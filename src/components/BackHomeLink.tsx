'use client'

// ปุ่ม "← กลับหน้าหลัก / Back" ตามภาษาที่เลือก — ใช้ในหน้าที่เป็น server component (เช่น /about)
// ซึ่งเรียก useLanguage() เองไม่ได้

import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

export default function BackHomeLink({ className }: { className?: string }) {
  const { tStat } = useLanguage()
  return (
    <Link href="/" className={className}>
      <span className="material-icons-round text-sm">arrow_back</span>
      {tStat('Back')}
    </Link>
  )
}
