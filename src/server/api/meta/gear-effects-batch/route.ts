// ====================================================
// API Route: GET /api/meta/gear-effects-batch?iconUrls=url1,url2,url3
// คืน effects ของเกียร์หลายชิ้นในรอบเดียว
// ใช้ใน Ranger Detail popup เพื่อลดจำนวน request (3 → 1)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getGearEffectsAsync, type GearEffects } from '@/lib/pvpScraper'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'

export const maxDuration = 60

const MAX_BATCH = 8
const ICON_URL_RE = /^https:\/\/rangers\.lerico\.net\/res\/gear_icon\/[a-zA-Z0-9_\-]+_icon\.png$/

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const iconUrlsParam = searchParams.get('iconUrls') ?? ''
  if (!iconUrlsParam) {
    return NextResponse.json({ effects: {} })
  }

  // Split + dedupe + validate
  const seen = new Set<string>()
  const urls: string[] = []
  for (const u of iconUrlsParam.split(',')) {
    const t = u.trim()
    if (!t || seen.has(t)) continue
    if (!ICON_URL_RE.test(t)) continue   // กัน injection / URL แปลก
    seen.add(t)
    urls.push(t)
    if (urls.length >= MAX_BATCH) break
  }

  if (urls.length === 0) {
    return NextResponse.json({ effects: {} })
  }

  try {
    // ── เตรียม itemCode + key map ──
    const itemMap: { iconUrl: string; itemCode: string | null; key: string | null }[] = urls.map(iconUrl => {
      const m = iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)
      const itemCode = m ? m[1] : null
      return { iconUrl, itemCode, key: itemCode ? redisKey.gearEffects(itemCode) : null }
    })

    // ── 1 MGET รวบ N keys → ลด Redis commands จาก N เป็น 1 ──
    const cachedResults = new Map<string, GearEffects | null>()
    const validKeys = itemMap.filter(x => x.key).map(x => x.key as string)
    if (redis && validKeys.length > 0) {
      try {
        const cachedValues = await redis.mget<(string | null)[]>(...validKeys)
        for (let i = 0; i < validKeys.length; i++) {
          const raw = cachedValues[i]
          if (!raw) continue
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
            cachedResults.set(validKeys[i], parsed as GearEffects)
          } catch { /* skip */ }
        }
      } catch { /* Redis unavailable → fallback per-item */ }
    }

    // ── สำหรับ items ที่ cache miss → scrape + set Redis ──
    const results = await Promise.all(itemMap.map(async ({ iconUrl, itemCode, key }) => {
      if (!itemCode || !key) return [iconUrl, null] as const

      // Redis hit จาก MGET
      if (cachedResults.has(key)) {
        return [iconUrl, cachedResults.get(key)!] as const
      }

      // Cache miss → scrape
      const effects: GearEffects | null = await getGearEffectsAsync(itemCode)
      if (redis && effects) {
        redis.set(key, JSON.stringify(effects), { ex: REDIS_TTL.gearEffects }).catch(() => {})
      }
      return [iconUrl, effects] as const
    }))

    const effects: Record<string, GearEffects | null> = {}
    for (const [k, v] of results) effects[k] = v

    return NextResponse.json({ effects }, {
      headers: {
        // browser cache ยืดให้เท่า CDN (1 ชม.) — ลด edge request ซ้ำ
        'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('[GearEffectsBatch] Error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
