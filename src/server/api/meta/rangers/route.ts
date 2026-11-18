// ====================================================
// API Route: GET /api/meta/rangers?league=0
// คืนข้อมูลจาก Redis cache (12h TTL) — ไม่ scrape ทุกครั้งแล้ว
// ถ้าต้องการ refresh จริงๆ ให้ใช้ /api/cron/refresh-meta แทน
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getMetaRangers, LEAGUES, withTopGear } from '@/lib/pvpScraper'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const leagueParam = searchParams.get('league') ?? '0'
  const league = parseInt(leagueParam, 10)

  const validLeague = LEAGUES.find((l) => l.value === league)
  if (!validLeague) {
    return NextResponse.json({ error: `Invalid league. Valid values: ${LEAGUES.map(l => l.value).join(", ")}` }, { status: 400 })
  }

  try {
    const fresh = await getMetaRangers(league, false)
    // static build: แนบ topGear แบบเดียวกับ rangers-stream (หน้า /meta ใช้โชว์เกียร์ยอดนิยมใต้ชื่อ)
    return NextResponse.json({ league, leagueName: validLeague.label, ...fresh, rangers: withTopGear(fresh.rangers, league), isRefreshing: false }, {
      headers: {
        // cron รายวันเขียน lr:league:* ทับ ต้นทางจึงสดตั้งแต่เช้า — เดิม CDN ยึดไว้อีก 1 วัน
        // ทำให้ตารางเมต้าช้ากว่าที่ควรเป็นเกือบสองเท่า
        ...FRESH_CACHE_HEADERS,
      },
    })
  } catch (err) {
    console.error('Error fetching meta rangers:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
