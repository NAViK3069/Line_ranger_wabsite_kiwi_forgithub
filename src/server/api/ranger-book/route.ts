// ====================================================
// GET /api/ranger-book — รายการเรนเจอร์ทั้งหมด (หน้า Ranger Book)
// รันเฉพาะตอน build (scripts/emit-data.ts) · payload สร้างใน lib/bookPayloads
// ====================================================

import { NextResponse } from 'next/server'
import { buildRangerBookPayload } from '@/lib/bookPayloads'

export async function GET() {
  return NextResponse.json(await buildRangerBookPayload())
}
