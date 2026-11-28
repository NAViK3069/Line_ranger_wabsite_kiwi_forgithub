'use client'
// ====================================================
// Books Layout — layout สำหรับ /ranger-book และ /gear-book (public)
// ====================================================

import SiteHeader from '@/components/SiteHeader'
import { usePathname } from 'next/navigation'

export default function BooksLayout({ children }: { children: React.ReactNode }) {
  // หน้าใน layout นี้: /ranger-book และ /gear-book — ชื่อ/ไอคอนแถบบนตามหน้า
  const gear = usePathname()?.startsWith('/gear-book') ?? false
  return (
    <div className="min-h-screen">
      {/* Top nav bar */}
      <SiteHeader
        icon={gear ? '/home-icons/mission-gear-book.webp' : '/home-icons/mission-ranger-book.webp'}
        title={gear ? 'Gear Book' : 'Ranger Book'} heading={false} />

      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
