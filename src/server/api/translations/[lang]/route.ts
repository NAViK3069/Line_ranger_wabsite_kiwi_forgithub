// ====================================================
// API: GET /api/translations/[lang]
// คืน translation maps ทุกประเภทในภาษาที่ระบุ
//
// ?only=names → คืนเฉพาะชื่อเรนเจอร์ ({ "<id>_nm": "ชื่อ" })
//   bundle เต็มหนัก ~3MB แต่ชื่อเรนเจอร์ล้วนๆ ~180KB
//   ใช้ตอนค้นหาข้ามภาษา (อยู่โหมด EN แล้วพิมพ์ไทย) ซึ่งไม่ต้องใช้อย่างอื่นเลย
//
// ใช้ lerico API: /api/v2/translate?keys=<lang>:UNIT (และอื่นๆ)
// Cache Redis 7 วัน (game data ไม่เปลี่ยนบ่อย)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'

export const maxDuration = 60

const SUPPORTED_LANGS = ['en', 'th'] as const
type Lang = typeof SUPPORTED_LANGS[number]

const TRANSLATION_TYPES = ['UNIT', 'EQUIP', 'SKILL', 'ABILITY', 'PROPERTIES', 'CUSTOM'] as const

const CACHE_TTL = 60 * 60 * 24 * 7  // 7 วัน

const FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0',
}

// sync ล้าง lr:translations:th/en ให้ทุกครั้ง ต้นทางจึงสด — CDN ต้องตามให้ทัน
const CACHE_HEADERS = FRESH_CACHE_HEADERS

interface TranslationBundle {
  lang: Lang
  units:      Record<string, string>
  equips:     Record<string, string>
  skills:     Record<string, string>
  abilities:  Record<string, string>
  properties: Record<string, string>
  custom:     Record<string, string>
}

async function fetchOneType(lang: Lang, type: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://rangers.lerico.net/api/v2/translate?keys=${lang}:${type}`,
      { headers: FETCH_HEADERS },
    )
    if (!res.ok) return {}
    const raw = await res.json() as Record<string, unknown>
    const data = (raw[`${lang}:${type}`] ?? raw) as Record<string, string>
    // ทำความสะอาด: ลบ \n, collapse spaces
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') {
        out[k] = v.replace(/\\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
    return out
  } catch {
    return {}
  }
}

// ชื่อเรนเจอร์ = unit key ที่ลงท้าย _nm — ตัดออกมาแล้ว cache แยก
function cacheNames(key: string, units: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(units)) if (k.endsWith('_nm')) out[k] = v
  if (redis && Object.keys(out).length > 0) redis.set(key, JSON.stringify(out), { ex: CACHE_TTL }).catch(() => {})
  return out
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params
  const lang = rawLang.toLowerCase() as Lang

  if (!SUPPORTED_LANGS.includes(lang)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  const onlyNames = _req.nextUrl.searchParams.get('only') === 'names'
  const redisKey = `lr:translations:${lang}`
  const namesKey = `${redisKey}:names`

  // ── 0. ชุดชื่อล้วน — มี cache แยกของตัวเอง จะได้ไม่ต้องอ่านแล้วตัด bundle 3MB ทุกครั้ง ──
  if (onlyNames && redis) {
    try {
      const cached = await redis.get<string>(namesKey)
      if (cached) {
        return NextResponse.json(typeof cached === 'string' ? JSON.parse(cached) : cached, { headers: CACHE_HEADERS })
      }
    } catch { /* fallback */ }
  }

  // ── 1. ลอง Redis ก่อน ──
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey)
      if (cached) {
        const data = (typeof cached === 'string' ? JSON.parse(cached) : cached) as TranslationBundle
        return NextResponse.json(onlyNames ? cacheNames(namesKey, data.units) : data, { headers: CACHE_HEADERS })
      }
    } catch { /* fallback to lerico */ }
  }

  // ── 2. Fetch ทั้ง 6 types พร้อมกัน ──
  const [units, equips, skills, abilities, properties, custom] = await Promise.all(
    TRANSLATION_TYPES.map(t => fetchOneType(lang, t))
  )

  const bundle: TranslationBundle = {
    lang, units, equips, skills, abilities, properties, custom,
  }

  // ── 3. Save Redis ──
  if (redis && Object.keys(units).length > 0) {
    redis.set(redisKey, JSON.stringify(bundle), { ex: CACHE_TTL }).catch(() => {})
  }

  return NextResponse.json(onlyNames ? cacheNames(namesKey, units) : bundle, { headers: CACHE_HEADERS })
}
