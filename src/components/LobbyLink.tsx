'use client'

// ====================================================
// LobbyLink — ปุ่ม Custom บนหน้าแรก (พาไปเมนูรวมโหมด Custom ที่ /custom)
// โผล่เฉพาะคนที่ปลดล็อค Beta แล้ว (คนอื่นกดเข้าไปก็เจอด่านอยู่ดี จึงไม่ต้องโชว์ให้สับสน)
// ====================================================

import Link from 'next/link'
import { usePro } from '@/contexts/ProContext'

export default function LobbyLink() {
  const { isPro } = usePro()
  if (!isPro) return null

  return (
    <Link
      href="/custom"
      className="w-full sm:w-60 px-4 py-4 card-glass text-white font-bold text-lg rounded-2xl hover:bg-white/10 transition-all hover:scale-105 active:scale-95 border border-cyan-400/30 flex items-center justify-center gap-2"
    >
      <span className="material-icons-round text-cyan-400 text-lg">dashboard_customize</span>
      Custom
    </Link>
  )
}
