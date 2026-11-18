// ====================================================
// Public API: GET /api/gacha/gear-pools
// ดึงรายการ gear pool ที่ isActive = true สำหรับแสดงในหน้า gacha gear
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'

// browser cache 1 นาที + CDN cache 1 นาที (stale-while-revalidate 5 นาที)
// เดิม s-maxage=86400 (1 วัน) — พอ admin แก้/เพิ่มตู้ใหม่ CDN ยังเสิร์ฟของเก่าให้คนทั่วไปได้นานสุดถึง 1 วัน
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rateLimitResult = apiRateLimit(ip)
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const isTestMode = request.nextUrl.searchParams.get('test') === 'true'

  // ── 1. ลอง Redis ก่อน ──
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey.gachaGearList(isTestMode))
      if (cached) {
        return NextResponse.json(JSON.parse(cached), { headers: CACHE_HEADERS })
      }
    } catch { /* Redis unavailable → fallback to DB */ }
  }

  // ── 2. DB query ──
  try {
    const pools = await prisma.gachaGearPool.findMany({
      where: { isActive: true, isTest: isTestMode },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        isNew: true,
        isEvent: true,
        gears: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    const result = pools.map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl ?? null,
      isNew: p.isNew,
      isEvent: p.isEvent,
      gearsCount: Array.isArray(p.gears) ? (p.gears as unknown[]).length : 0,
    }))

    const payload = { pools: result }

    // ── 3. เก็บลง Redis ──
    if (redis) {
      redis.set(redisKey.gachaGearList(isTestMode), JSON.stringify(payload), {
        ex: REDIS_TTL.gachaPoolList,
      }).catch(() => {})
    }

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error('Error fetching gear pools:', error)
    return NextResponse.json({ error: 'Failed to fetch gear pools' }, { status: 500 })
  }
}
