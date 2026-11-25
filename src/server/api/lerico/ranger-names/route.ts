// GET /api/lerico/ranger-names — ชื่อเรนเจอร์ภาษาอังกฤษ { "en:UNIT": { code: ข้อความ } } จากไฟล์ภาษาของเกม
// (ชื่อ path เดิมคงไว้ให้หน้าเว็บไม่ต้องแก้ — ไม่ได้ดึงจาก lerico แล้ว) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { gameTranslate } from '@/lib/gameData'

export async function GET() {
  try {
    return NextResponse.json(gameTranslate('en:UNIT'))
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
