// ====================================================
// GET /api/ranger/usage-ranking/[id]?league=0
// อันดับการเลือกใช้ Awakening Ability / Talent stage ของ ranger ในลีคนั้น (ข้อมูล PvP จาก warmycat — src/lib/pvpUsage.ts)
// (จัดอันดับจากผู้เล่นทั้งหมดในลีค ไม่ใช่แค่ top 10/30/50/100)
// รันเฉพาะตอน build (scripts/emit-data.ts) — ไม่มีข้อมูล = ไม่เขียนไฟล์ (หน้าเว็บใช้ค่าว่างแทน)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRangerUsage } from '@/lib/pvpUsage'

const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const rangerId = rawId.toLowerCase().trim()
  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id' }, { status: 400 })
  }

  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '0', 10)
  if (Number.isNaN(league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    const usage = await getRangerUsage(rangerId, league)
    // ลีคไม่รองรับ หรือไม่มีข้อมูล — คืน array ว่าง ให้ UI ซ่อนเอง ไม่ error
    return NextResponse.json(usage ?? { awakeningUsage: [], talentUsage: [] })
  } catch (err) {
    console.error('[UsageRanking] error:', err)
    return NextResponse.json({ awakeningUsage: [], talentUsage: [] }, { status: 500 })
  }
}
