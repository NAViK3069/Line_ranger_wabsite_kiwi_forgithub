'use client'

// ====================================================
// ResFolderLink — ปุ่ม Folder บนหัวหน้าแรก พาไปหน้า /res
// โผล่เฉพาะคนที่ปลดล็อค Beta แล้ว (คนอื่นกดเข้าไปก็เจอด่านอยู่ดี จึงไม่ต้องโชว์ให้สับสน)
// ====================================================

import Link from 'next/link'
import { usePro } from '@/contexts/ProContext'

export default function ResFolderLink() {
  const { isPro } = usePro()
  if (!isPro) return null

  return (
    <Link
      href="/res"
      className="px-3 py-1.5 sm:px-4 sm:py-2 card-glass text-gray-400 hover:text-white text-xs sm:text-sm rounded-xl flex items-center gap-1.5 transition-all hover:bg-white/10 border border-white/5"
    >
      <span className="material-icons-round text-sm sm:text-base">folder</span>
      Folder
    </Link>
  )
}
