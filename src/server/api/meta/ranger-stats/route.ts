// ====================================================
// API Route: GET /api/meta/ranger-stats?id=u1587h-es
// คืนข้อมูล stat + skills + abilities ของ Ranger
// (lazy-loaded bundle จาก lerico.net — ครั้งแรกของ session จะช้า ~1-2s)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRawRanger, translateProperty } from '@/lib/rangerData'
import { buildRangerStatsResponse, type RangerStatsResponse } from '@/lib/buildRangerStats'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'

export const maxDuration = 60

export type { RangerStatsResponse }

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const rangerId = searchParams.get('id') ?? ''
  const levelParam = searchParams.get('level')

  if (!rangerId) {
    return NextResponse.json({ error: 'Missing ranger id' }, { status: 400 })
  }
  const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i
  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id format' }, { status: 400 })
  }

  let levelOverride: number | undefined
  if (levelParam != null) {
    const n = parseInt(levelParam, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 999) levelOverride = n
  }

  // browser cache ยืดให้เท่า CDN (1 วัน) — ranger stats เปลี่ยนแค่ตอน game update
  // → ลด edge request ซ้ำจากทุกครั้งที่เปิด popup ranger เดิม (ก่อนหน้านี้ทุก 1 ชม.)
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
  }

  try {
    // ── 1. Redis cache check ──
    const cacheKey = redisKey.rangerStats(rangerId, levelOverride)
    if (redis) {
      const cached = await redis.get<string>(cacheKey)
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data, { headers: cacheHeaders })
      }
    }

    const raw = await getRawRanger(rangerId)
    if (!raw) {
      return NextResponse.json({ error: 'Ranger data not found' }, { status: 404 })
    }

    const response = await buildRangerStatsResponse(raw, rangerId, levelOverride)

    // unused-import guard (keep for future use)
    void translateProperty

    // ── 2. Save to Redis (fire-and-forget) ──
    if (redis) {
      redis.set(cacheKey, JSON.stringify(response), { ex: REDIS_TTL.rangerStats })
        .catch((e) => console.error(`[RangerStats] Redis set failed for ${rangerId}:`, e))
    }

    return NextResponse.json(response, { headers: cacheHeaders })
  } catch (err) {
    console.error(`[RangerStats] Failed for ${rangerId}:`, err)
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
