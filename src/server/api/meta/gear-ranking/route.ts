// ====================================================
// GET /api/meta/gear-ranking?league=0
// รวม Gear ทุกชิ้นจากทุก Ranger ใน League นั้น — เรียงตาม count มากสุด → น้อยสุด
// รันเฉพาะตอน build (scripts/emit-data.ts) · ข้อมูลจาก .data/db/ranger-gear.json
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEquipGrade, isValidLeague } from '@/lib/pvpScraper'
import { aggregateGearRanking } from '@/lib/gearAggregate'
import type { GearRanking } from '@/lib/gearAggregate'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const league = parseInt(searchParams.get('league') ?? '0', 10)

  if (!isValidLeague(league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    const rows = await prisma.rangerGear.findMany({
      where: { league },
      select: { gearData: true, sampled: true },
    })

    const payload = aggregateGearRanking(
      rows.map(r => ({ rangerId: '', gearData: r.gearData as unknown as GearRanking, sampled: r.sampled })),
      getEquipGrade,
    )
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[GearRanking] Error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
