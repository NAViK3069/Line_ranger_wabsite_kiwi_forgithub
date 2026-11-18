'use client'

// ====================================================
// /admin/lobby — พื้นที่ถ่ายรูปฉบับแอดมิน
// เห็นตารางจัดวางวัตถุ (Object list) และเลือกเรนเจอร์ได้ทุกตัวไม่จำกัด
//
// เข้าได้ต้องผ่านสองด่าน: ล็อกอินแอดมิน (layout ของ /admin จัดการให้)
// และปลดล็อค Beta/Pro (ด่านอยู่ใน LobbyStudio) — แอดมินอย่างเดียวยังเข้าไม่ได้
// ====================================================

import LobbyStudio from '@/app/lobby/LobbyStudio'

export default function AdminLobbyPage() {
  return <LobbyStudio admin />
}
