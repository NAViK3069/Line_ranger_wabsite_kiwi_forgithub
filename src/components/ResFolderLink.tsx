'use client'

// ====================================================
// ResFolderLink — ปุ่ม Folder บนหัวหน้าแรก พาไปหน้า /res
// ทุกคนเห็น (usePro() คืน isPro = true เสมอ — ระบบโค้ด Pro/Beta ถูกตัดทิ้งแล้ว)
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
