// GET /api/infinity-tower/[floor] — ศัตรูของชั้นนั้น (endless_ai → endless_product_line) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { towerEnemies } from '@/lib/infinityTower'

export async function GET(_req: Request, { params }: { params: Promise<{ floor: string }> }) {
  const { floor } = await params
  if (!/^fl\d+$/.test(floor ?? '')) return NextResponse.json({ error: 'Invalid floor' }, { status: 400 })
  const enemies = towerEnemies(floor)
  if (!enemies) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ floor, enemies })
}
