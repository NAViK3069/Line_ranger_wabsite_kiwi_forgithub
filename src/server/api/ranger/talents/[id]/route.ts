// ====================================================
// API: GET /api/ranger/talents/[id]
// คืนทาเลนต์ของเรนเจอร์ (ทาเลนต์หลัก + ทาเลนต์เสริม 3 ขั้น) จากข้อมูลเกมของเรา (src/lib/gameData.ts → gameTalent)
//
//   primary   = ทาเลนต์หลัก: คำอธิบายทางการ zh/th/en · โอกาสเกิด · เงื่อนไข (บรรทัดนำของคำอธิบาย)
//               ผลแต่ละข้อ (รายการ * ของคำอธิบาย) + โอกาสของผลนั้น (ความสามารถย่อยของทาเลนต์)
//   enhanced  = ทาเลนต์เสริม (zh) · enhancedL = ชื่อสเตตัสทางการ th/en + ค่า · enhancedStats = ชนิด + ค่าดิบ
//
// เดิมแกะจาก Rangers_data.json ของ warmycat (ภาษาจีน แล้วแปลเอง) — ตรวจแล้วโอกาสเกิด/ผล/ทาเลนต์เสริมตรงกันทุกตัว
// คำนวณจากไฟล์ในเครื่อง ไม่ต้องมี cache เพิ่ม
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { gameTalent } from '@/lib/gameData'

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!/^[a-z0-9][a-z0-9_\-]+$/i.test(id)) {
    return NextResponse.json({ hasTalent: false, error: 'Invalid id' }, { status: 400 })
  }

  try {
    return NextResponse.json(gameTalent(id), { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[Talents] error:', err)
    // Silent fail — return no-talent ให้ UI ซ่อน TalentSection
    return NextResponse.json({ hasTalent: false, error: 'Internal error' }, { status: 500 })
  }
}
