// ====================================================
// API: GET /api/gear/spec-plus/[id]
// คืน Spec+ ของเกียร์ 9★ จากข้อมูลเกมของเรา (src/lib/gameData.ts → gameGearSpec)
//   ชื่อ + คำอธิบาย = ข้อความทางการ EQUIP (SPC_…_nm / _desc1 / _desc2 — มี %s / {$Np} / {$Nf} ให้แทนค่า)
//   ตัวเลข = eqip_spcl_opt + unit_eqip_attr + eqip_tlnt_attr (ช่วง min~max · ค่าต่อระดับ · โอกาสเกิด · เวลา)
// เดิมแกะจาก 裝備資料庫.json ของ warmycat — ตรวจแล้วตัวเลขตรงกันทุกชิ้น
//   (ยกเว้นค่าต่อระดับของสเตตัสแบบบวกตรง เช่น Move Speed ที่ warmycat เขียนผิดเป็น "100%" — ของจริง +1.0)
// เงื่อนไข / ชื่อผลไม่มีข้อความแยกในเกม → อยู่ในคำอธิบายทางการทั้งประโยค (ไม่แต่งข้อความเอง)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { gameGearSpec, type GameGearSpec } from '@/lib/gameData'

export type GearSpecData = GameGearSpec

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!/^[a-z0-9][a-z0-9_\-]+$/i.test(id)) {
    return NextResponse.json({ hasSpec: false, error: 'Invalid id' }, { status: 400 })
  }

  try {
    return NextResponse.json(gameGearSpec(id), { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[GearSpec] error:', err)
    return NextResponse.json({ hasSpec: false, error: 'Internal error' }, { status: 500 })
  }
}
