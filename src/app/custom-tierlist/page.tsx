'use client'

// ====================================================
// /custom-tierlist — จัดเทียร์ลิสต์เรนเจอร์ (ปุ่ม Tier List บนหน้าแรก / เมนู Custom)
// ตัวหน้าอยู่ใน TierListStudio.tsx · สไตล์อยู่ใน tierlist.css
// ====================================================

import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import TierListStudio from './TierListStudio'
import './tierlist.css'

export default function CustomTierListPage() {
  const { tStat } = useLanguage()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">
          {/* Tier List อยู่บนหน้าแรกแล้ว → ย้อนกลับไปหน้าแรก (ไม่ใช่เมนู Custom) */}
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <span className="text-white/20">|</span>
          <span className="material-icons-round text-lg text-amber-300">leaderboard</span>
          <span className="text-sm font-bold text-white">Tier List</span>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <TierListStudio />
      </main>
    </div>
  )
}
