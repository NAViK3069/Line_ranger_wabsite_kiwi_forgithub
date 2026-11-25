// ====================================================
// GET /api/meta/ranger-detail?id=xxx&league=0
// เกียร์ยอดนิยม + จำนวนผู้ใช้ของเรนเจอร์ในลีค (ข้อมูล PvP จาก lerico — refresh รายวันใน Daily Data)
// รันเฉพาะตอน build (scripts/emit-data.ts)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRangerDetail, LEAGUES } from '@/lib/pvpScraper'

const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rangerId = searchParams.get('id') ?? ''
  const league = parseInt(searchParams.get('league') ?? '0', 10)

  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id format' }, { status: 400 })
  }
  if (!LEAGUES.some((l) => l.value === league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    const result = await getRangerDetail(rangerId, league)
    // ยังโหลดเกียร์ไม่เสร็จ → 202 (emit-data ไม่เขียนไฟล์ หน้าเว็บใช้ค่าว่างแทน)
    return NextResponse.json(result, { status: result.gearLoading ? 202 : 200 })
  } catch (error) {
    console.error('Error fetching ranger detail:', error)
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
