'use client'

// ====================================================
// /custom-gacha-ranger — หน้าถ่ายรูปกาชาเรนเจอร์ (ต้องปลดล็อค Beta/Pro ถึงจะใช้ได้ ด่านอยู่ใน GachaStudio)
// โคลนโครงหน้ามาจาก /lobby
// ====================================================

import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import GachaStudio from './GachaStudio'

export default function CustomGachaRangerPage() {
  const { tStat } = useLanguage()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/custom" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back to Custom')}</span>
          </Link>
          <span className="text-white/20">|</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gacha/images/LogoKiwi-48.webp" alt="Kiwi" width={50} height={48} className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-white">
            <span className="hidden sm:inline">Line Ranger </span>Kiwi
          </span>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <GachaStudio />
      </main>
    </div>
  )
}
