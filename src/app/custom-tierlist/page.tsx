'use client'

// ====================================================
// /custom-tierlist — จัดเทียร์ลิสต์เรนเจอร์ (ปุ่ม Tier List บนหน้าแรก / เมนู Custom)
// ตัวหน้าอยู่ใน TierListStudio.tsx · สไตล์อยู่ใน tierlist.css
// ====================================================

import TierListStudio from './TierListStudio'
import './tierlist.css'
import SiteHeader from '@/components/SiteHeader'

export default function CustomTierListPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader icon="/home-icons/mission-tierlist.webp" title="Tier List" />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <TierListStudio />
      </main>
    </div>
  )
}
