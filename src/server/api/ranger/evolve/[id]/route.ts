// ====================================================
// API: GET /api/ranger/evolve/[id]
// คืนสายวิวัฒนาการ (evolveChain) ของเรนเจอร์ พร้อมชื่อ EN + ระดับดาว
//
//   { chain: [{ id, name, grade, tierIconKey, tierLabel }, ...] }
//
// ที่มา: https://rangers.lerico.net/api/getRanger/{id} → { evolveMaterial, evolveChain }
//   payload เล็กมาก (~900B) แต่ยิงทีละตัว → cache Redis 7 วัน
//
// 💡 ทุกตัวในสายเดียวกันคืน chain ชุดเดียวกันเป๊ะ (ตรวจแล้ว u284e-brown = u286h-brown)
//    → fetch ครั้งเดียวแล้วเขียน cache ให้ "ทุกสมาชิก" ในสาย ผู้ใช้กดสลับร่างไปมาไม่ยิงซ้ำ
//
// ชื่อ EN: อ่านจาก cache ที่ /api/translations/en?only=names สร้างไว้ (lr:translations:en:names)
//   ถ้าไม่มีค่อยดึง en:UNIT เอง แล้วเขียน cache ก้อนนั้นให้เลย
// ระดับดาว: getTierInfo() จาก ranger bundle — ตัวเดียวกับที่ RangerStatPanel ใช้โชว์รูปดาว
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRawRanger, getTierInfo } from '@/lib/rangerData'
import { redis } from '@/lib/redis'
import { cleanUnitName } from '@/lib/unitName'

export const maxDuration = 60

const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

const CACHE_TTL = 60 * 60 * 24 * 7      // 7 วัน — สายวิวัฒนาการเปลี่ยนแค่ตอน game update
const NAMES_TTL = 60 * 60 * 24 * 7

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

const RANGER_ID_RE = /^[a-z0-9][a-z0-9_-]{2,50}$/i

const evolveKey = (id: string) => `lr:ranger:evolve:v1:${id}`
const NAMES_KEY = 'lr:translations:en:names'

export interface EvolveEntry {
  id: string
  name: string
  grade: number | null
  tierIconKey: string
  tierLabel: string
}

export interface EvolveResponse {
  chain: EvolveEntry[]
}

/** ชื่อ EN ของทุกยูนิต ({ "<id>_nm": "White Tiger Brown" }) — ใช้ cache ร่วมกับ /api/translations/en?only=names */
async function loadNameMap(): Promise<Record<string, string>> {
  if (redis) {
    try {
      const cached = await redis.get<string>(NAMES_KEY)
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached
    } catch { /* ตกไปดึงเอง */ }
  }
  try {
    const res = await fetch('https://rangers.lerico.net/api/v2/translate?keys=en:UNIT', { headers: FETCH_HEADERS })
    if (!res.ok) return {}
    const raw = await res.json() as Record<string, unknown>
    const data = (raw['en:UNIT'] ?? raw) as Record<string, string>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      if (k.endsWith('_nm') && typeof v === 'string') out[k] = cleanUnitName(v)
    }
    if (redis && Object.keys(out).length > 0) {
      redis.set(NAMES_KEY, JSON.stringify(out), { ex: NAMES_TTL }).catch(() => {})
    }
    return out
  } catch {
    return {}
  }
}

async function buildEntry(id: string, nameMap: Record<string, string>): Promise<EvolveEntry> {
  const raw = await getRawRanger(id)
  const tier = raw ? getTierInfo(raw) : null
  return {
    id,
    name: nameMap[`${id}_nm`] || id,
    grade: typeof raw?.grade === 'number' ? raw.grade : null,
    tierIconKey: tier?.tierIconKey ?? '',
    tierLabel: tier?.tierLabel ?? '',
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!RANGER_ID_RE.test(id)) {
    return NextResponse.json({ chain: [] } as EvolveResponse, { status: 400 })
  }

  try {
    if (redis) {
      const cached = await redis.get<string>(evolveKey(id))
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data as EvolveResponse, { headers: CACHE_HEADERS })
      }
    }

    const res = await fetch(`https://rangers.lerico.net/api/getRanger/${encodeURIComponent(id)}`, { headers: FETCH_HEADERS })
    if (!res.ok) throw new Error(`getRanger ${res.status}`)
    const json = await res.json() as { evolveChain?: unknown }
    const ids = Array.isArray(json.evolveChain)
      ? json.evolveChain.filter((x): x is string => typeof x === 'string' && RANGER_ID_RE.test(x))
      : []

    // ไม่มีสาย (หรือมีตัวเดียว = ตัวเอง) → คืน chain ว่าง ให้ UI ซ่อน section ไปเลย
    if (ids.length < 2) {
      const empty: EvolveResponse = { chain: [] }
      if (redis) redis.set(evolveKey(id), JSON.stringify(empty), { ex: CACHE_TTL }).catch(() => {})
      return NextResponse.json(empty, { headers: CACHE_HEADERS })
    }

    const nameMap = await loadNameMap()
    const chain = await Promise.all(ids.map(cid => buildEntry(cid, nameMap)))
    const payload: EvolveResponse = { chain }

    // เขียน cache ให้ทุกตัวในสาย (รวมตัวที่ขอมา เผื่อ id ที่ขอไม่ได้อยู่ใน chain)
    if (redis) {
      const body = JSON.stringify(payload)
      for (const cid of new Set([id, ...ids])) {
        redis.set(evolveKey(cid), body, { ex: CACHE_TTL }).catch(() => {})
      }
    }

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[Evolve] error:', err)
    // Silent fail — คืน chain ว่างให้ UI ซ่อน section (ไม่ cache ผลพลาด)
    return NextResponse.json({ chain: [] } as EvolveResponse, { status: 500 })
  }
}
