// GET /api/main-stage — พื้นที่และด่านทั้งหมดของ Main Stage (ปกติ / Hard / Extreme) · รันเฉพาะตอน build
// ข้อมูลเกมของเรา: area + stage + ability (src/lib/mainStage.ts)
import { NextResponse } from 'next/server'
import { mainStageIndex } from '@/lib/mainStage'

export async function GET() {
  try {
    return NextResponse.json(mainStageIndex())
  } catch {
    return NextResponse.json({ error: 'no game data' }, { status: 500 })
  }
}
