'use client'

// ====================================================
// /custom — เมนูรวมโหมด Custom ทั้งหมด (ปุ่ม Custom บนหน้าแรกพามาที่นี่)
// ทุกโหมดในเมนูนี้ใช้ได้เฉพาะคนที่ปลดล็อค Beta/Pro — หน้านี้จึงล็อคไว้ทั้งหน้าด้วย
// เพิ่มโหมดใหม่ได้ที่ CUSTOM_ITEMS ที่เดียว
// ====================================================

import Link from 'next/link'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'

const CUSTOM_ITEMS = [
  { href: '/lobby', label: 'Lobby', icon: 'photo_camera', iconClass: 'text-cyan-400', borderClass: 'border-cyan-400/30' },
  { href: '/custom-gacha-ranger', label: 'Gacha Ranger', icon: 'auto_awesome', iconClass: 'text-yellow-400', borderClass: 'border-yellow-400/30' },
  // Video Studio = ANME (จัดฉาก + เล่นสกิล + ส่งออก MP4) — ดู src/anme/
  { href: '/custom-video', label: 'Video Studio', icon: 'movie', iconClass: 'text-pink-400', borderClass: 'border-pink-400/30' },
]

export default function CustomPage() {
  const { tStat } = useLanguage()
  const { isPro, loading: proLoading } = usePro()
  return (
    <div className="min-h-screen">
      {/* Top bar — โครงเดียวกับหน้า lobby/books */}
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
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

      <main className="max-w-6xl mx-auto px-4 py-10 flex flex-col items-center">
        {proLoading ? (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <span className="material-icons-round text-sm animate-spin">autorenew</span>
            Loading...
          </div>
        ) : !isPro ? (
          <div className="max-w-md w-full mx-auto rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center">
            <span className="material-icons-round text-4xl text-yellow-300">lock</span>
            <p className="text-white font-bold mt-3">{tStat('Pro / Beta only')}</p>
            <p className="text-gray-400 text-sm mt-1">{tStat('This page needs an active Pro or Beta code.')}</p>
            <Link
              href="/beta"
              className="inline-flex items-center gap-1.5 mt-5 h-9 px-4 rounded-lg bg-yellow-400/20 border border-yellow-400 text-yellow-200 text-sm font-bold hover:bg-yellow-400/30 transition-colors"
            >
              <span className="material-icons-round text-base">vpn_key</span>
              {tStat('Enter code')}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 mb-8">
              <span className="material-icons-round text-cyan-400 text-3xl">dashboard_customize</span>
              Custom
            </h1>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 justify-center w-full">
              {CUSTOM_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full sm:w-60 px-4 py-4 card-glass text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border ${item.borderClass} flex items-center justify-center gap-2`}
                >
                  <span className={`material-icons-round text-lg ${item.iconClass}`}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
