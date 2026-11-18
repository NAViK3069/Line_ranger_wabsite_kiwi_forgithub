// ====================================================
// Admin Layout — ทุกหน้าใน /admin ต้องล็อกอินก่อน
//
// static site ไม่มีเซิร์ฟเวอร์เช็ค session → เช็คฝั่ง browser ด้วย token จาก Cloudflare Worker
// (หน้าแอดมินเป็นแค่ UI — ทุกการบันทึกต้องผ่าน Worker ซึ่งตรวจ token อีกชั้นเสมอ
//  คนที่ไม่มี token เปิดหน้านี้ได้ก็จริง แต่แก้อะไรไม่ได้)
// ====================================================

import AdminGuard from '@/components/AdminGuard'

export const metadata = {
  title: 'Admin Panel',
  robots: 'noindex, nofollow', // ไม่ให้ Google index หน้า Admin
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
