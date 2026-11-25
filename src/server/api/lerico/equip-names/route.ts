// GET /api/lerico/equip-names — ชื่อเกียร์ภาษาอังกฤษ { "en:EQUIP": { code: ข้อความ } } จากไฟล์ภาษาของเกม
// (ชื่อ path เดิมคงไว้ให้หน้าเว็บไม่ต้องแก้ — ไม่ได้ดึงจาก lerico แล้ว) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { gameTranslate } from '@/lib/gameData'

export async function GET() {
  try {
    return NextResponse.json(gameTranslate('en:EQUIP'))
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
