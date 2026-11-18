// ====================================================
// GET /api/ranger-cast-time/[id]
// คืนระยะเวลาร่ายสกิลของเรนเจอร์ (จาก .sam animation)
//
// Response:
//   { unitCode, animRate, skill1: { frames, seconds } | null, skill2: ... }
//
// Cache: Redis 7 วัน (game data ไม่เปลี่ยนบ่อย)
// ====================================================

import { NextResponse } from 'next/server'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'
import { parseSAMFrameCounts, extractCastTimes, type RangerCastTimes } from '@/lib/samParser'

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
}

// game data ไม่เปลี่ยนบ่อย → browser cache ยืดให้เท่า CDN (7 วัน)
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!id || !/^[a-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid ranger id' }, { status: 400 })
  }

  // ── 1. ลอง Redis ก่อน ──
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey.rangerCastTime(id))
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          headers: { 'X-Cache': 'HIT', ...CACHE_HEADERS },
        })
      }
    } catch { /* Redis unavailable → fallback */ }
  }

  // ── 2. Fetch .sam file จาก lerico.net ──
  const samUrl = `https://rangers.lerico.net/res/${id}/${id}-body.sam`
  let buffer: ArrayBuffer
  try {
    const res = await fetch(samUrl, {
      headers: FETCH_HEADERS,
      // timeout ใน Next.js edge ปกติ 10s — ไฟล์ .sam ขนาดเล็กพอ
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `SAM file not found for "${id}" (HTTP ${res.status})` },
        { status: 404 },
      )
    }
    buffer = await res.arrayBuffer()
  } catch (e) {
    console.error(`[CastTime] fetch failed for ${id}:`, e)
    return NextResponse.json({ error: 'Failed to fetch SAM file' }, { status: 502 })
  }

  // ── 3. Parse SAM + คำนวณ cast time ──
  let castTimes: RangerCastTimes
  try {
    const samInfo = parseSAMFrameCounts(buffer)
    castTimes = extractCastTimes(samInfo)
  } catch (e) {
    console.error(`[CastTime] parse failed for ${id}:`, e)
    return NextResponse.json({ error: 'Failed to parse SAM file' }, { status: 500 })
  }

  const payload = { unitCode: id, ...castTimes }

  // ── 4. เก็บลง Redis ──
  if (redis) {
    redis
      .set(redisKey.rangerCastTime(id), JSON.stringify(payload), {
        ex: REDIS_TTL.rangerCastTime,
      })
      .catch(() => {})
  }

  return NextResponse.json(payload, { headers: { 'X-Cache': 'MISS', ...CACHE_HEADERS } })
}
