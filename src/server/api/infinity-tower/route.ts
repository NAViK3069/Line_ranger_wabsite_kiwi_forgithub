// GET /api/infinity-tower — ทุกชั้นของ Infinity Tower (ประเภทด่าน, กลไก, ภารกิจ, รางวัล) · รันเฉพาะตอน build
// ข้อมูลเกมของเรา: endless_floor_renewal + new_endless_floor_mission (src/lib/infinityTower.ts)
import { NextResponse } from 'next/server'
import { towerIndex } from '@/lib/infinityTower'

export async function GET() {
  try {
    return NextResponse.json(towerIndex())
  } catch {
    return NextResponse.json({ error: 'no game data' }, { status: 500 })
  }
}
