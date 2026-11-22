'use client'

// ====================================================
// /admin/lobby — พื้นที่ถ่ายรูปฉบับแอดมิน
// เห็นตารางจัดวางวัตถุ (Object list) และเลือกเรนเจอร์ได้ทุกตัวไม่จำกัด
//
// ต้องล็อกอินแอดมินก่อน (layout ของ /admin จัดการให้)
// ====================================================

import LobbyStudio from '@/app/lobby/LobbyStudio'

export default function AdminLobbyPage() {
  return <LobbyStudio admin />
}
