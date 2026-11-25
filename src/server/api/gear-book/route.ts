// ====================================================
// GET /api/gear-book — รายการเกียร์ทั้งหมด (หน้า Gear Book)
// รันเฉพาะตอน build (scripts/emit-data.ts) · payload สร้างใน lib/bookPayloads
// ====================================================

import { NextResponse } from 'next/server'
import { buildGearBookPayload } from '@/lib/bookPayloads'

export async function GET() {
  return NextResponse.json(await buildGearBookPayload())
}
