// GET /api/ranger-faces — ตำแหน่งหน้าของเรนเจอร์ (unit.faceCenterX / faceCenterY ของเกม) → { รหัส: [x, y] }
// ใช้ซูมการ์ดเรนเจอร์ให้เห็นหน้า (หน้า Custom → Tier List) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { gameRangerFaces } from '@/lib/gameData'

export async function GET() {
  try {
    return NextResponse.json(gameRangerFaces())
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
