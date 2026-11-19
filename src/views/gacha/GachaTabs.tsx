'use client'

// ====================================================
// GachaTabs — หัวหน้า Gacha Simulator + แท็บสลับ Ranger / Gear
// ใช้ทั้ง /gacha-ranger และ /gacha-gear (หน้าแรกมีปุ่ม Gacha Simulator ปุ่มเดียวพามาที่ Ranger)
// ====================================================

import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

const TABS = [
  { key: 'ranger', href: '/gacha-ranger', label: 'Ranger', icon: 'auto_awesome', active: 'from-yellow-400 to-orange-500 text-black' },
  { key: 'gear', href: '/gacha-gear', label: 'Gear', icon: 'settings', active: 'from-cyan-500 to-blue-600 text-white' },
] as const

export default function GachaTabs({ current }: { current: 'ranger' | 'gear' }) {
  const { tStat } = useLanguage()
  return (
    <div className="text-center mb-8 sm:mb-10">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-5">
        <span className="text-gradient-gold">Gacha Simulator</span>
      </h1>
      {/* แท็บแบบปุ่มแคปซูล — เต็มความกว้างบนมือถือ ตรงกลางบนจอกว้าง */}
      <nav aria-label="Gacha type" className="mx-auto grid grid-cols-2 gap-1 p-1 w-full max-w-md rounded-2xl bg-white/5 border border-white/10">
        {TABS.map(t => {
          const on = t.key === current
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`h-11 sm:h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-base sm:text-lg transition-all active:scale-[0.98] ${
                on ? `bg-gradient-to-r ${t.active} shadow-lg` : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-icons-round text-lg">{t.icon}</span>
              Gacha {t.label}
            </Link>
          )
        })}
      </nav>
      <p className="text-gray-400 text-sm mt-4">{tStat('Select banner to roll')}</p>
    </div>
  )
}
