// ====================================================
// GET /api/gacha/pools — รายการตู้เรนเจอร์ที่เปิดอยู่ (หน้าเลือกตู้กาชา)
// ?test=true = ตู้ทดสอบ · รันเฉพาะตอน build (scripts/emit-data.ts) ข้อมูลจาก content/gacha-pools.json
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const isTestMode = request.nextUrl.searchParams.get('test') === 'true'

  const pools = await prisma.gachaPool.findMany({
    where: { isActive: true, isTest: isTestMode },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      isNew: true,
      isEvent: true,
      rangers: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  const result = pools.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl ?? null,
    isNew: p.isNew,
    isEvent: p.isEvent,
    rangersCount: Array.isArray(p.rangers) ? (p.rangers as unknown[]).length : 0,
  }))

  return NextResponse.json({ pools: result })
}
