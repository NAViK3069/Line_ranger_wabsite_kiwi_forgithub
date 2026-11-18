// ====================================================
// API Route: GET /api/meta/gear-ranking?league=0
// รวม Gear ทุกชิ้นจากทุก Ranger ใน League นั้น
// คืน list เรียงตาม count มากสุด → น้อยสุด
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEquipGrade, isValidLeague } from '@/lib/pvpScraper'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'
import { aggregateGearRanking, rowsFromGearBatch } from '@/lib/gearAggregate'
import type { GearRanking } from '@/lib/gearAggregate'

export const maxDuration = 60

// ข้อมูลเปลี่ยนวันละครั้ง (refresh รายวัน) — CDN เก็บ 6 ชม. แล้วค่อยถามใหม่ จะได้เห็นรอบใหม่ภายในวันเดียวกัน
// (เดิม 7 วัน ทำให้หน้า Meta โชว์อันดับเกียร์ค้างได้ทั้งสัปดาห์)
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const leagueParam = searchParams.get('league') ?? '0'
  const league = parseInt(leagueParam, 10)

  if (!isValidLeague(league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    // ── 1. ลอง Redis ก่อน ──
    if (redis) {
      try {
        const cached = await redis.get<string>(redisKey.gearRanking(league))
        if (cached) {
          return NextResponse.json(JSON.parse(cached), { headers: CACHE_HEADERS })
        }
      } catch { /* Redis unavailable → fallback to DB */ }
    }

    // ── 2. ปกติตัว refresh รายวันเขียนผลไว้ให้แล้ว ถ้าหายไปให้สร้างจาก gearBatch ใน Redis ก่อน ──
    // (ข้อมูลชุดเดียวกับใน DB) ตกถึง Neon เฉพาะตอน Redis ไม่มีอะไรเลยจริงๆ
    if (redis) {
      try {
        const raw = await redis.get<string>(redisKey.gearBatch(league))
        if (raw) {
          const batch = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, { data: GearRanking; sampled: number }>
          const payload = aggregateGearRanking(rowsFromGearBatch(batch), getEquipGrade)
          redis.set(redisKey.gearRanking(league), JSON.stringify(payload), { ex: REDIS_TTL.rangerGear }).catch(() => {})
          return NextResponse.json(payload, { headers: CACHE_HEADERS })
        }
      } catch { /* ไปต่อที่ DB */ }
    }

    // ── 3. Redis ไม่มีอะไรเลย → ดึงจาก DB ──
    const rows = await prisma.rangerGear.findMany({
      where: { league },
      select: { gearData: true, sampled: true },
    })

    const payload = aggregateGearRanking(
      rows.map(r => ({ rangerId: '', gearData: r.gearData as unknown as GearRanking, sampled: r.sampled })),
      getEquipGrade,
    )

    // ── เก็บลง Redis ──
    if (redis) {
      redis.set(redisKey.gearRanking(league), JSON.stringify(payload), {
        ex: REDIS_TTL.rangerGear,
      }).catch(() => {})
    }

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error('[GearRanking] Error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
