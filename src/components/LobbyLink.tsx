'use client'

// ====================================================
// LobbyLink — ปุ่ม Custom บนหน้าแรก (พาไปเมนูรวมโหมด Custom ที่ /custom)
// ทุกคนเห็น (usePro() คืน isPro = true เสมอ — ระบบโค้ด Pro/Beta ถูกตัดทิ้งแล้ว)
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
