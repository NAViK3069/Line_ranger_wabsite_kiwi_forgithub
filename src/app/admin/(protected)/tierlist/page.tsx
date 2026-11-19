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
        tips={[
          'จัดเหมือนหน้าเว็บปกติ: ลากเรนเจอร์ลงแถว หรือคลิกที่เรนเจอร์เพื่อเลือกแถว · กด ⚙ เพื่อแก้ชื่อแถวและสี',
          'กด เผยแพร่ เมื่อจัดเสร็จ — หน้าเว็บจะอัปเดตภายใน 2–5 นาที (ดูสถานะ build ได้ที่มุมขวาบน)',
          'ผู้ใช้ที่ยังไม่เคยจัดเอง จะเห็นฉบับใหม่ทันที · คนที่จัดเองไว้แล้วจะเห็นเมื่อกด รีเซ็ต',
          'ผู้ใช้กด ล้างตาราง เพื่อจัดเองจากศูนย์ได้เสมอ',
          'คลังด้านล่างของผู้ใช้มาจาก Meta PVP ลีค Legend อัตโนมัติ — ที่นี่บันทึกเฉพาะแถวกับเรนเจอร์ที่วางในแถว',
          'โหลดฉบับที่เผยแพร่ = ทิ้งที่แก้ไว้แล้วกลับไปฉบับล่าสุดที่เผยแพร่',
        ]}
      />
      <TierListStudio mode="admin" />
    </div>
  )
}
