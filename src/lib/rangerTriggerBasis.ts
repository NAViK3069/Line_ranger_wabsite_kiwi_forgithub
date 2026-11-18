// ====================================================
// rangerTriggerBasis — 觸發基準 (skill targeting basis) จาก warmycat Rangers_data.json
// • mirror ระบบ talent/gearSpec (7-day pattern): per-ranger Redis key + primed flag
// • fetch warmycat 1× ต่อ 7 วัน (เมื่อ primed flag หมดอายุ) — ไม่แตะ Neon เลย
// • match กับ skill ของเราด้วย icon filename (เหมือนกันเป๊ะระหว่าง lerico/warmycat)
// ====================================================

import { redis, redisKey, REDIS_TTL } from '@/lib/redis'

const WARMYCAT_URL =
  'https://rangerbook.warmycat.com/res/' + encodeURIComponent('Rangers_data') + '.json'
const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

export type TriggerBasisType = 'self' | 'front' | 'rear'
export interface TriggerBasis {
  type: TriggerBasisType
  multiplier?: number   // เฉพาะ type === 'rear'
}

// unitCode → { skillIconFilename → TriggerBasis }
const cache = new Map<string, Record<string, TriggerBasis>>()
let primedInMemory = false

function parseTriggerBasis(raw: unknown): TriggerBasis | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (s === '自身') return { type: 'self' }
  if (s === '前方敵人') return { type: 'front' }
  const m = s.match(/^後方敵人（倍率:([\d.]+)倍）$/)
  if (m) return { type: 'rear', multiplier: parseFloat(m[1]) }
  return null
}

/** Fetch warmycat + parse ทุก ranger → populate Redis (per-ranger + primed) */
async function populateAll(): Promise<void> {
  const res = await fetch(WARMYCAT_URL, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`Warmycat fetch failed: ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : Object.values(data)

  const writeOps: Promise<unknown>[] = []
  for (const r of list as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const id = String(r.ranger_id ?? '').toLowerCase()
    if (!id) continue

    const bySkillIcon: Record<string, TriggerBasis> = {}
    for (const key of ['技能1', '技能2', '技能3']) {
      const sk = r[key]
      if (!sk || typeof sk !== 'object') continue
      const skObj = sk as Record<string, unknown>
      const icon = typeof skObj.icon === 'string' ? skObj.icon : null
      const tb = parseTriggerBasis(skObj['觸發基準'])
      if (icon && tb) bySkillIcon[icon] = tb
    }
    if (Object.keys(bySkillIcon).length === 0) continue

    cache.set(id, bySkillIcon)
    if (redis) {
      writeOps.push(
        redis.set(redisKey.triggerBasis(id), JSON.stringify(bySkillIcon), { ex: REDIS_TTL.triggerBasis })
          .catch(() => {})
      )
    }
  }

  if (redis) {
    writeOps.push(
      redis.set(redisKey.triggerBasisPrimed(), '1', { ex: REDIS_TTL.triggerBasis }).catch(() => {})
    )
  }
  await Promise.all(writeOps)
  primedInMemory = true
}

/** เรียกก่อนใช้ getTriggerBasis() — no-op ถ้า unitCode นี้โหลดแล้ว (in-memory + Redis 2 ชั้น) */
export async function ensureTriggerBasisLoaded(unitCode: string): Promise<void> {
  if (!unitCode) return
  if (cache.has(unitCode)) return
  if (primedInMemory) return   // โหลดครบทั้งระบบแล้วแต่ ranger นี้ไม่มีข้อมูล

  if (redis) {
    try {
      const [dataRaw, primed] = await redis.mget<[unknown, unknown]>(
        redisKey.triggerBasis(unitCode),
        redisKey.triggerBasisPrimed(),
      )
      if (dataRaw) {
        const parsed = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw
        cache.set(unitCode, parsed as Record<string, TriggerBasis>)
        return
      }
      if (primed) return   // primed แล้วแต่ ranger นี้ไม่มี key → ไม่มีข้อมูล ไม่ต้อง fetch ซ้ำ
    } catch { /* Redis ล่ม → fallback ไป fetch สด */ }
  }

  await populateAll()
}

export function getTriggerBasis(unitCode: string, skillIcon: string | undefined | null): TriggerBasis | null {
  if (!unitCode || !skillIcon) return null
  return cache.get(unitCode)?.[skillIcon] ?? null
}
