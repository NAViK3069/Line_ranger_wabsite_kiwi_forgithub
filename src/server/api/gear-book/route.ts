// ====================================================
// GET /api/gear-book — Public (ไม่ต้อง login)
// Redis cache → DB query เฉพาะตอน cache miss
// v2: เพิ่ม skillPlusNames ต่อ item (จาก pvpScraper in-memory cache)
//
// payload สร้างใน lib/bookPayloads เพื่อให้ sync เขียนแคชชุดเดียวกันไว้ล่วงหน้าได้
// ปกติ route นี้จึงไม่ต้องแตะ Neon เลย (ดูคำอธิบายในไฟล์นั้น)
// ====================================================

import { NextResponse } from 'next/server'
import { redis, REDIS_TTL } from '@/lib/redis'
import { buildGearBookPayload, GEAR_BOOK_CACHE_KEY } from '@/lib/bookPayloads'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'

// แอดมินกด sync แล้วต้องเห็นผลจริง — ห้ามให้ CDN ยึดไว้ยาว (ดู FRESH_CACHE_HEADERS)
const CACHE_HEADERS = FRESH_CACHE_HEADERS

export async function GET() {
  // ── 1. ลอง Redis ก่อน ──
  if (redis) {
    try {
      const cached = await redis.get<string>(GEAR_BOOK_CACHE_KEY)
      if (cached) {
        return NextResponse.json(typeof cached === 'string' ? JSON.parse(cached) : cached, { headers: CACHE_HEADERS })
      }
    } catch { /* Redis unavailable → fallback to DB */ }
  }

  // ── 2. Cache miss → DB ──
  const payload = await buildGearBookPayload()

  // ── 3. เก็บลง Redis ──
  if (redis) {
    redis.set(GEAR_BOOK_CACHE_KEY, JSON.stringify(payload), {
      ex: REDIS_TTL.gearBookAll,
    }).catch(() => {})
  }

  return NextResponse.json(payload, { headers: CACHE_HEADERS })
}
