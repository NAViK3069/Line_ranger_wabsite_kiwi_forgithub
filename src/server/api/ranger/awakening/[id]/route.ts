// ====================================================
// GET /api/ranger/awakening/[id]
// คืน Awakening Abilities (覺醒能力) ของ 9★+ ranger จาก warmycat API
// ดึง 能力.json เพื่อได้ชื่อ + คำอธิบายภาษาจีนเป็น fallback
// Cache: Redis 7 วัน
// ====================================================

import { NextResponse } from 'next/server'
import { redis, REDIS_TTL } from '@/lib/redis'
import { gameText } from '@/lib/gameData'

const WARMYCAT_RANGERS = 'https://rangerbook.warmycat.com/res/Rangers_data.json'
const WARMYCAT_ABILITY  = 'https://rangerbook.warmycat.com/res/%E8%83%BD%E5%8A%9B.json'
const LERICO_ICON = (icon: string) => `https://rangers.lerico.net/res/ability_icon/${icon}`

export interface AwakenAbility {
  code: string      // e.g. "aab213_lastatk"
  nameEn: string    // English name from lerico en:ABILITY (used when lang=en)
  descEn: string    // English description from lerico
  nameZh: string    // Chinese name (TH fallback via tAbility())
  descZh: string    // Chinese description (TH fallback via tAbilityDesc())
  iconUrl: string   // from lerico res
}

export interface AwakenAbilityResponse {
  rangerId: string
  abilities: AwakenAbility[]
}

// ── In-memory cache ──────────────────────────────────
let abilityDict: Record<string, { nameZh: string; descZh: string; nameEn: string; descEn: string; icon: string }> | null = null
let rangersMap: Record<string, AwakenAbility[]> | null = null
let fetchedAt = 0
const MEM_TTL = 10 * 60 * 1000  // 10 min

async function ensureData() {
  if (abilityDict && rangersMap && Date.now() - fetchedAt < MEM_TTL) return

  const [rangersRes, abilityRes] = await Promise.all([
    fetch(WARMYCAT_RANGERS, { next: { revalidate: 600 } }),
    fetch(WARMYCAT_ABILITY,  { next: { revalidate: 600 } }),
  ])
  if (!rangersRes.ok || !abilityRes.ok) throw new Error('warmycat fetch failed')

  // ข้อความ EN ของ ABILITY จากไฟล์ภาษาของเกม → { aab213_lastatk_nm: 'Last Attack', ... } (เดิมดึงจาก lerico)
  const enDict: Record<string, string> = { ...gameText('en', 'ABILITY') }

  // 能力.json: { [code]: { icon, 名稱, 敘述, ... } }
  const abilityRaw = await abilityRes.json() as Record<string, {
    icon?: string
    '名稱'?: string
    '敘述'?: string
  }>
  abilityDict = {}
  for (const [code, info] of Object.entries(abilityRaw)) {
    abilityDict[code] = {
      nameZh: info['名稱'] ?? '',
      descZh: info['敘述'] ?? '',
      nameEn: enDict[`${code}_nm`]   ?? '',
      descEn: enDict[`${code}_desc`] ?? '',
      icon:   info.icon   ?? '',
    }
  }

  // Rangers_data.json: array of rangers with 覺醒能力 field
  const rangers = await rangersRes.json() as Array<Record<string, unknown>>
  rangersMap = {}
  for (const r of rangers) {
    const rid = r['ranger_id'] as string
    if (!rid) continue
    const awakenRaw = r['覺醒能力']
    if (!Array.isArray(awakenRaw) || !awakenRaw.length) continue
    const awaken = awakenRaw as Array<{ 能力: string; abilityCode: string; icon: string }>
    rangersMap[rid] = awaken
      .filter(a => a.abilityCode?.startsWith('aab'))
      .map(a => {
        const info = abilityDict![a.abilityCode] ?? {}
        return {
          code:    a.abilityCode,
          nameEn:  info.nameEn || '',
          descEn:  info.descEn || '',
          nameZh:  info.nameZh || a['能力'] || '',
          descZh:  info.descZh || '',
          iconUrl: LERICO_ICON(info.icon || a.icon || `${a.abilityCode.slice(1)}_icon.png`),
        }
      })
  }
  fetchedAt = Date.now()
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || !/^[a-z0-9_-]+$/i.test(id))
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const cacheKey = `lr:ranger:awakening:v4:${id}`

  if (redis) {
    try {
      const cached = await redis.get<string>(cacheKey)
      if (cached) return NextResponse.json(JSON.parse(cached))
    } catch { /* fallback */ }
  }

  await ensureData()
  const abilities = rangersMap?.[id] ?? []
  const payload: AwakenAbilityResponse = { rangerId: id, abilities }

  if (redis && abilities.length > 0) {
    redis.set(cacheKey, JSON.stringify(payload), { ex: REDIS_TTL.rangerCastTime }).catch(() => {})
  }

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=604800, s-maxage=604800' },
  })
}
