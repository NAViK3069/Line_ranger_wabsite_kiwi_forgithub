'use client'

// ====================================================
// /admin/tierlist — จัดเทียร์ลิสต์เริ่มต้นของหน้า /custom-tierlist
// ใช้ตัวจัดตัวเดียวกับหน้าเว็บ (TierListStudio mode="admin") แต่ไม่เก็บลงเครื่อง
// กด "เผยแพร่" → commit content/tierlist.json → GitHub Actions build เว็บใหม่ (~2–5 นาที)
// ====================================================

import AdminPageHeader from '@/components/AdminPageHeader'
import TierListStudio from '@/app/custom-tierlist/TierListStudio'
import '@/app/custom-tierlist/tierlist.css'

export default function AdminTierListPage() {
  return (
    <div>
      <AdminPageHeader
        icon="leaderboard"
        tone="text-amber-300"
        title="Tier List เริ่มต้น"
        description="จัดเทียร์ลิสต์ที่ผู้ใช้ทุกคนจะเห็นเป็นค่าเริ่มต้นในหน้า Tier List แล้วกด เผยแพร่"
        viewHref="/custom-tierlist"
        viewLabel="ดูหน้า Tier List"
      />
      <TierListStudio mode="admin" />
    </div>
  )
}
