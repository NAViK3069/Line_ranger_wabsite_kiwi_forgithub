import { NextRequest, NextResponse } from 'next/server'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'
import { gameRangerFaces } from '@/lib/gameData'

// ตำแหน่งหน้าของเรนเจอร์ (unit.faceCenterX / faceCenterY ของเกม) → { รหัส: [x, y] }
// ใช้ซูมการ์ดเรนเจอร์ให้เห็นหน้า (หน้า Custom → Tier List)
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    return NextResponse.json(gameRangerFaces(), { headers: { ...FRESH_CACHE_HEADERS } })
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
