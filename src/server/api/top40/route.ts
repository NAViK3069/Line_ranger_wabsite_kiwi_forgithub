import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'

// browser cache ยืดให้เท่า s-maxage (admin invalidate ทันทีเมื่อแก้อยู่แล้ว) — ลด edge revalidate ซ้ำๆ
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
}

export async function GET() {
  // ── 1. ลอง Redis ก่อน ──
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey.top40())
      if (cached) {
        return NextResponse.json(JSON.parse(cached), { headers: CACHE_HEADERS })
      }
    } catch { /* Redis unavailable → fallback to DB */ }
  }

  // ── 2. DB query ──
  const data = await prisma.top40Legend.findUnique({
    where: { id: 'main' },
  })
  const payload = data ?? { entries: [] }

  // ── 3. เก็บลง Redis ──
  if (redis) {
    redis.set(redisKey.top40(), JSON.stringify(payload), {
      ex: REDIS_TTL.top40,
    }).catch(() => {})
  }

  return NextResponse.json(payload, { headers: CACHE_HEADERS })
}
