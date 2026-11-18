// ====================================================
// PVP Usage Ranking — Awakening Ability / Talent pick-rate ต่อลีค จาก warmycat
// https://pvp-data.warmycat.com/usage*.json
//
// • รองรับเฉพาะ Legend~Gold 3 (warmycat ไม่มีข้อมูล Silver/Bronze) — ลีคนอกลิสต์คืน null ทันที ไม่ fetch
// • ใช้ข้อมูลจาก data.rangers (sample เต็มทั้งลีค) เท่านั้น — ไม่แตะ data.scopes
//   (scopes = breakdown เฉพาะ top 10/30/50/100 ผู้เล่น ไม่ใช่ข้อมูลทั้งหมดที่เว็บนี้ต้องการ)
// • Cache ทั้งลีคเป็น 1 Redis key (ไฟล์ warmycat เป็น 1 ไฟล์ต่อลีคอยู่แล้ว) + in-memory 10 นาที
//   กัน Redis round-trip ถี่เกินในเครื่องเดียว — ไม่ต้อง fetch ใหม่ทุก request
// ====================================================

import { redis, redisKey, REDIS_TTL } from './redis'

export interface UsageEntry {
  code: string
  count: number
  rate: number
}

export interface RangerUsageData {
  awakeningUsage: UsageEntry[]
  talentUsage: UsageEntry[]
}

// league value (ตรงกับ LEAGUES ใน pvpScraper.ts) → warmycat usage JSON URL
// เฉพาะ Legend(0) ~ Gold 3(9) — ตามที่ขอ ไม่รวม Silver/Bronze
const WARMYCAT_USAGE_URL: Record<number, string> = {
  0: 'https://pvp-data.warmycat.com/usage.json',
  1: 'https://pvp-data.warmycat.com/usage_MASTER_1.json',
  2: 'https://pvp-data.warmycat.com/usage_MASTER_2.json',
  3: 'https://pvp-data.warmycat.com/usage_MASTER_3.json',
  4: 'https://pvp-data.warmycat.com/usage_DIAMOND_1.json',
  5: 'https://pvp-data.warmycat.com/usage_DIAMOND_2.json',
  6: 'https://pvp-data.warmycat.com/usage_DIAMOND_3.json',
  7: 'https://pvp-data.warmycat.com/usage_GOLD_1.json',
  8: 'https://pvp-data.warmycat.com/usage_GOLD_2.json',
  9: 'https://pvp-data.warmycat.com/usage_GOLD_3.json',
}

const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
const MEM_TTL = 10 * 60 * 1000   // 10 นาที

const memCache = new Map<number, { data: Map<string, RangerUsageData>; fetchedAt: number }>()
const fetchingLeagues = new Map<number, Promise<Map<string, RangerUsageData> | null>>()

interface WarmycatUsageRanger {
  rangerId?: string
  awakeningUsage?: UsageEntry[]
  talentUsage?: UsageEntry[]
}

async function populateLeague(league: number, url: string): Promise<Map<string, RangerUsageData>> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`warmycat usage fetch failed: ${res.status}`)
  const json = await res.json() as { rangers?: WarmycatUsageRanger[] }

  const map = new Map<string, RangerUsageData>()
  for (const r of json.rangers ?? []) {
    const id = String(r.rangerId ?? '').toLowerCase()
    if (!id) continue
    // "__NONE__" = sentinel ของ warmycat แปลว่าเรนเจอร์ตัวนี้ไม่มี Awakening Ability จริง (ต่ำกว่า 9★)
    const awakeningUsage = (r.awakeningUsage ?? []).filter((e) => e.code !== '__NONE__')
    const talentUsage = r.talentUsage ?? []
    map.set(id, { awakeningUsage, talentUsage })
  }

  if (redis) {
    redis.set(redisKey.usageRanking(league), JSON.stringify(Array.from(map.entries())), {
      ex: REDIS_TTL.usageRanking,
    }).catch(() => {})
  }
  memCache.set(league, { data: map, fetchedAt: Date.now() })
  return map
}

/** โหลด usage ranking ทั้งลีค (ทุก ranger) — cache 3 ชั้น: in-memory → Redis → warmycat */
export async function getUsageRankingsForLeague(league: number): Promise<Map<string, RangerUsageData> | null> {
  const url = WARMYCAT_USAGE_URL[league]
  if (!url) return null   // ลีคที่ไม่รองรับ (Silver/Bronze) — ไม่ fetch เลย

  const mem = memCache.get(league)
  if (mem && Date.now() - mem.fetchedAt < MEM_TTL) return mem.data

  // กันยิง warmycat ซ้ำถ้ามีหลาย request เข้ามาพร้อมกันตอน cache ว่าง
  const inFlight = fetchingLeagues.get(league)
  if (inFlight) return inFlight

  const task = (async () => {
    if (redis) {
      try {
        const cached = await redis.get<string>(redisKey.usageRanking(league))
        if (cached) {
          const entries = typeof cached === 'string' ? JSON.parse(cached) : cached
          const map = new Map<string, RangerUsageData>(entries)
          memCache.set(league, { data: map, fetchedAt: Date.now() })
          return map
        }
      } catch { /* Redis พัง → fetch สดแทน */ }
    }
    try {
      return await populateLeague(league, url)
    } catch (err) {
      console.error('[PvpUsage] failed to load league', league, err)
      return null
    }
  })()

  fetchingLeagues.set(league, task)
  try {
    return await task
  } finally {
    fetchingLeagues.delete(league)
  }
}

/** usage ranking ของ ranger ตัวเดียว (base id หรือ tier id ก็ได้ — key ตรงตาม warmycat rangerId) */
export async function getRangerUsage(rangerId: string, league: number): Promise<RangerUsageData | null> {
  const map = await getUsageRankingsForLeague(league)
  if (!map) return null
  return map.get(rangerId.toLowerCase()) ?? null
}
