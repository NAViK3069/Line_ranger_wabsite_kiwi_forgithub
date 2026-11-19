'use client'

// ====================================================
// HomeMenu — ปุ่มเมนูหน้าแรก (6 ช่องขนาดเท่ากัน)
// มือถือ 2 คอลัมน์ (3 แถว) · จอ ≥ 640px 3 คอลัมน์ (2 แถว) → สมดุลทุกขนาดจอ
// ทุกช่องหน้าตาเดียวกัน: ไอคอนในกรอบสีประจำเมนู + ชื่อ + คำอธิบายสั้น
// สีของแต่ละเมนูเขียนเป็นคลาสเต็มๆ (Tailwind ต้องเห็นชื่อคลาสตรงๆ ตอน build)
// เพิ่ม/สลับเมนูได้ที่ ITEMS ที่เดียว — จำนวนช่องควรเป็น 6 (หรือ 3/12) ให้ตารางเต็มพอดี
// ====================================================

import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

interface Item {
  href: string
  icon: string
  title: string
  th: string
  en: string
  /** กรอบไอคอน (ไล่สี) */
  iconBg: string
  /** ขอบ + เงาตอนชี้ */
  hover: string
  /** แสงจางมุมขวาบนตอนชี้ */
  glow: string
}

const ITEMS: Item[] = [
  {
    href: '/gacha-ranger', icon: 'auto_awesome', title: 'Gacha Simulator',
    th: 'สุ่มตู้เรนเจอร์และเกียร์', en: 'Ranger & gear banners',
    iconBg: 'from-amber-300 to-orange-500', hover: 'hover:border-amber-400/60 hover:shadow-[0_10px_30px_-12px_rgba(251,191,36,0.55)]', glow: 'bg-amber-400',
  },
  {
    href: '/custom-tierlist', icon: 'leaderboard', title: 'Tier List',
    th: 'จัดอันดับเรนเจอร์ของคุณ', en: 'Rank your rangers',
    iconBg: 'from-sky-400 to-blue-600', hover: 'hover:border-sky-400/60 hover:shadow-[0_10px_30px_-12px_rgba(56,189,248,0.55)]', glow: 'bg-sky-400',
  },
  {
    href: '/meta', icon: 'military_tech', title: 'Meta Ranger',
    th: 'อันดับ PVP ลีค Legend', en: 'Top PVP Legend picks',
    iconBg: 'from-rose-400 to-red-600', hover: 'hover:border-rose-400/60 hover:shadow-[0_10px_30px_-12px_rgba(251,113,133,0.55)]', glow: 'bg-rose-400',
  },
  {
    href: '/ranger-book', icon: 'menu_book', title: 'Ranger Book',
    th: 'ข้อมูลเรนเจอร์ทุกตัว', en: 'Every ranger & stats',
    iconBg: 'from-emerald-400 to-teal-600', hover: 'hover:border-emerald-400/60 hover:shadow-[0_10px_30px_-12px_rgba(52,211,153,0.55)]', glow: 'bg-emerald-400',
  },
  {
    href: '/gear-book', icon: 'inventory_2', title: 'Gear Book',
    th: 'ข้อมูลเกียร์ทุกชิ้น', en: 'Every gear piece',
    iconBg: 'from-violet-400 to-purple-600', hover: 'hover:border-violet-400/60 hover:shadow-[0_10px_30px_-12px_rgba(167,139,250,0.55)]', glow: 'bg-violet-400',
  },
  {
    href: '/custom', icon: 'dashboard_customize', title: 'Custom',
    th: 'Lobby · วิดีโอ · กาชาเอง', en: 'Lobby, video & more',
    iconBg: 'from-fuchsia-400 to-pink-600', hover: 'hover:border-fuchsia-400/60 hover:shadow-[0_10px_30px_-12px_rgba(232,121,249,0.55)]', glow: 'bg-fuchsia-400',
  },
]

export default function HomeMenu() {
  const { lang } = useLanguage()
  return (
    <nav aria-label="Main menu" className="w-full max-w-3xl text-left grid grid-cols-2 sm:grid-cols-3 auto-rows-fr gap-3 sm:gap-4">
      {ITEMS.map(it => (
        <Link
          key={it.href}
          href={it.href}
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm
            p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3
            transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] active:scale-[0.98] ${it.hover}`}
        >
          {/* แสงจางมุมขวาบน (ตอนชี้) */}
          <span aria-hidden className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-25 transition-opacity ${it.glow}`} />
          <span className={`relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${it.iconBg} flex items-center justify-center shadow-lg shadow-black/30 ring-1 ring-white/20`}>
            <span className="material-icons-round text-white text-[22px] sm:text-2xl drop-shadow">{it.icon}</span>
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block font-bold text-white text-[15px] sm:text-base leading-tight whitespace-nowrap truncate">{it.title}</span>
            <span className="block text-xs text-gray-400 mt-1 leading-snug line-clamp-2">{lang === 'th' ? it.th : it.en}</span>
          </span>
        </Link>
      ))}
    </nav>
  )
}
