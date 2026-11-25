// GET /api/top40 — ตาราง Top 40 Legend (แอดมินแก้ใน content/top40-legend.json) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const data = await prisma.top40Legend.findUnique({ where: { id: 'main' } })
  return NextResponse.json(data ?? { entries: [] })
}
