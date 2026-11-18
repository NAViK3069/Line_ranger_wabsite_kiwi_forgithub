'use client'

// ====================================================
// AdminGuard — เช็ค token ของแอดมินกับ Cloudflare Worker ก่อนโชว์หน้าแอดมิน
// ไม่ผ่าน → ส่งไป /admin/login
// ====================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from '@/components/AdminNav'
import { getSession, verifySession } from '@/lib/adminApi'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'ok'>('checking')
  const [username, setUsername] = useState('Admin')

  useEffect(() => {
    let alive = true
    verifySession().then(ok => {
      if (!alive) return
      if (!ok) { router.replace('/admin/login'); return }
      setUsername(getSession()?.username ?? 'Admin')
      setState('ok')
    })
    return () => { alive = false }
  }, [router])

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <span className="material-icons-round animate-spin mr-2">autorenew</span>
        กำลังตรวจสอบสิทธิ์...
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AdminNav username={username} />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
