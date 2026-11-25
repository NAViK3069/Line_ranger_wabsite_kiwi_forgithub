// ====================================================
// GET /api/gacha/gear-pools — รายการตู้เกียร์ที่เปิดอยู่ (หน้าเลือกตู้กาชา)
// ?test=true = ตู้ทดสอบ · รันเฉพาะตอน build (scripts/emit-data.ts) ข้อมูลจาก content/gacha-gear-pools.json
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const isTestMode = request.nextUrl.searchParams.get('test') === 'true'

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

  return NextResponse.json({ pools: result })
}
