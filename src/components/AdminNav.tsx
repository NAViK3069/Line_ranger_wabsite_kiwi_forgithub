'use client'

// ====================================================
// AdminNav - Navigation bar สำหรับหน้า Admin
// + แถบสถานะ build: หลังกดบันทึก เว็บจริงจะอัปเดตเมื่อ GitHub Actions build เสร็จ (~2–5 นาที)
// ====================================================

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { getRuns, logout, type WorkflowRun } from '@/lib/adminApi'

interface AdminNavProps {
  username: string
}

const NAV_ITEMS = [
  { href: '/admin/Gacha-ranger', icon: 'casino',         label: 'Gacha เรนเจอร์' },
  { href: '/admin/Gacha-Gear',   icon: 'shield',         label: 'Gacha เกียร์'   },
  { href: '/admin/ranger-book',  icon: 'menu_book',      label: 'Ranger Book'     },
  { href: '/admin/gear-book',    icon: 'inventory_2',    label: 'Gear Book'       },
  { href: '/admin/top40-legend', icon: 'emoji_events',   label: 'Top 40'          },
]

function BuildStatus() {
  const [run, setRun] = useState<WorkflowRun | null>(null)

  const refresh = useCallback(() => {
    getRuns().then(runs => setRun(runs[0] ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // เพิ่งบันทึก → เช็คถี่ขึ้นจนกว่า build จะจบ
    let timer: ReturnType<typeof setInterval> | null = null
    const onCommit = () => {
      setTimeout(refresh, 4000)
      if (timer) clearInterval(timer)
      timer = setInterval(refresh, 15000)
      setTimeout(() => { if (timer) clearInterval(timer) }, 10 * 60 * 1000)
    }
    window.addEventListener('lr:admin-committed', onCommit)
    return () => { window.removeEventListener('lr:admin-committed', onCommit); if (timer) clearInterval(timer) }
  }, [refresh])

  if (!run) return null
  const busy = run.status !== 'completed'
  const ok = run.conclusion === 'success'
  return (
    <a
      href={run.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${run.name} — ${new Date(run.updatedAt).toLocaleString()}`}
      className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${
        busy ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
          : ok ? 'text-green-300 border-green-500/30 bg-green-500/10'
          : 'text-red-300 border-red-500/30 bg-red-500/10'
      }`}
    >
      <span className={`material-icons-round text-sm ${busy ? 'animate-spin' : ''}`}>
        {busy ? 'autorenew' : ok ? 'cloud_done' : 'error'}
      </span>
      {busy ? 'กำลัง build เว็บ...' : ok ? 'เว็บอัปเดตแล้ว' : 'build ล้มเหลว'}
    </a>
  )
}

export default function AdminNav({ username }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-black text-gradient-purple">
            🛡️ Admin Panel
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="material-icons-round text-sm">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Build status + User info + Logout */}
        <div className="flex items-center gap-3">
          <BuildStatus />
          <span className="text-sm text-gray-400 flex items-center gap-1">
            <span className="material-icons-round text-sm">account_circle</span> {username}
          </span>
          <button
            onClick={() => { logout(); router.push('/') }}
            className="px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </nav>
  )
}
