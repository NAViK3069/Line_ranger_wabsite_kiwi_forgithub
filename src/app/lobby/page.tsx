'use client'

// ====================================================
// /lobby — หน้าสาธารณะ ทุกคนใช้ได้
// ใช้ฉากชุดเดียวกับ /admin/lobby แต่ไม่มีตารางจัดวางวัตถุ (เลือกเรนเจอร์ได้ทุกตัวเหมือนกัน)
// ====================================================

import { useLanguage } from '@/contexts/LanguageContext'
import LobbyStudio from './LobbyStudio'
import SiteHeader from '@/components/SiteHeader'

export default function LobbyPage() {
  const { tStat } = useLanguage()
  return (
    <div className="min-h-screen">
      {/* Top bar — โครงเดียวกับหน้า books เพื่อให้หัวหน้าตรงกันทั้งเว็บ */}
      <SiteHeader backHref="/custom" backLabel={tStat('Back to Custom')} icon="/home-icons/mission-custom.webp" title="Lobby" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <LobbyStudio />
      </main>
    </div>
  )
}
