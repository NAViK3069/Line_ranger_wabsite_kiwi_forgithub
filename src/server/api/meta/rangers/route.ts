// ====================================================
// GET /api/meta/rangers?league=0
// อันดับเรนเจอร์ของลีค (ข้อมูล PvP ที่ Daily Data scrape ไว้ใน .data/db) + เกียร์ยอดนิยมใต้ชื่อ
// รันเฉพาะตอน build (scripts/emit-data.ts)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getMetaRangers, LEAGUES, withTopGear } from '@/lib/pvpScraper'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const league = parseInt(searchParams.get('league') ?? '0', 10)

  const validLeague = LEAGUES.find((l) => l.value === league)
  if (!validLeague) {
    return NextResponse.json({ error: `Invalid league. Valid values: ${LEAGUES.map(l => l.value).join(", ")}` }, { status: 400 })
  }

  try {
    const fresh = await getMetaRangers(league, false)
    return NextResponse.json({ league, leagueName: validLeague.label, ...fresh, rangers: withTopGear(fresh.rangers, league), isRefreshing: false })
  } catch (err) {
    console.error('Error fetching meta rangers:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
