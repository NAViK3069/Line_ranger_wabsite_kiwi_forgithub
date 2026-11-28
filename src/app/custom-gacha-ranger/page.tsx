'use client'

// ====================================================
// /custom-gacha-ranger — หน้าถ่ายรูปกาชาเรนเจอร์ (ทุกคนใช้ได้)
// โคลนโครงหน้ามาจาก /lobby
// ====================================================

import { useLanguage } from '@/contexts/LanguageContext'
import GachaStudio from './GachaStudio'
import SiteHeader from '@/components/SiteHeader'

export default function CustomGachaRangerPage() {
  const { tStat } = useLanguage()
  return (
    <div className="min-h-screen">
      <SiteHeader backHref="/custom" backLabel={tStat('Back to Custom')} icon="/home-icons/mission-custom.webp" title="Custom Gacha" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <GachaStudio />
      </main>
    </div>
  )
}
