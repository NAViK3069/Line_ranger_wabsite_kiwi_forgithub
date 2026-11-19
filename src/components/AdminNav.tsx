'use client'

// ====================================================
// AdminNav - Navigation bar สำหรับหน้า Admin
// + แถบสถานะ build: หลังกดบันทึก เว็บจริงจะอัปเดตเมื่อ GitHub Actions build เสร็จ (~2–5 นาที)
// ====================================================

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getRuns, logout, type WorkflowRun } from '@/lib/adminApi'

interface AdminNavProps {
  username: string
}

// เมนูที่ใช้บ่อย — Ranger Book / Gear Book / Lobby / About เข้าจากการ์ดในหน้า Admin Panel
const NAV_ITEMS = [
  { href: '/admin/Gacha-ranger', icon: 'casino',         label: 'Gacha เรนเจอร์' },
  { href: '/admin/Gacha-Gear',   icon: 'shield',         label: 'Gacha เกียร์'   },
  { href: '/admin/tierlist',     icon: 'leaderboard',    label: 'Tier List'       },
  { href: '/admin/top40-legend', icon: 'emoji_events',   label: 'Top 40'          },
  { href: '/admin/analytics',    icon: 'insights',       label: 'สถิติ'            },
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

  // กำลัง build อยู่ (เปิดหน้ามาตอน build ค้างอยู่ / build จาก Daily Data) → เช็คซ้ำทุก 15 วินาทีจนเสร็จ
  // เดิมเช็คถี่แค่หลังกดบันทึก ป้ายเลยหมุนค้างจนกว่าจะกด F5
  const running = !!run && run.status !== 'completed'
  useEffect(() => {
    if (!running) return
    const t = setTimeout(refresh, 15000)
    return () => clearTimeout(t)
  }, [running, run, refresh])

  if (!run) return null
  const busy = run.status !== 'completed'
  const ok = run.conclusion === 'success'
  return (
    <a
      href={run.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${busy ? 'กำลัง build เว็บ' : ok ? 'เว็บอัปเดตแล้ว' : 'build ล้มเหลว'} — ${run.name} (${new Date(run.updatedAt).toLocaleString()})`}
      className={`shrink-0 whitespace-nowrap flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${
        busy ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
          : ok ? 'text-green-300 border-green-500/30 bg-green-500/10'
          : 'text-red-300 border-red-500/30 bg-red-500/10'
      }`}
    >
      <span className={`material-icons-round text-sm ${busy ? 'animate-spin' : ''}`}>
        {busy ? 'autorenew' : ok ? 'cloud_done' : 'error'}
      </span>
      {/* จอแคบโชว์แค่ไอคอน (สีบอกสถานะอยู่แล้ว) ข้อความเต็มอยู่ใน title */}
      <span className="hidden sm:inline lg:hidden xl:inline">{busy ? 'กำลัง build...' : ok ? 'อัปเดตแล้ว' : 'build ล้มเหลว'}</span>
    </a>
  )
}

export default function AdminNav({ username }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const mobileRowRef = useRef<HTMLDivElement>(null)

  // มือถือ: เลื่อนแถวเมนูให้เห็นหน้าที่เปิดอยู่ (ไม่งั้นเมนูท้ายๆ อย่าง Gear Book / Top 40 ถูกตัดขอบ)
  useEffect(() => {
    const row = mobileRowRef.current
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (row && active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2
  }, [pathname])

  // ลิงก์เมนู — ใช้ทั้งแถวบน (จอกว้าง) และแถวเลื่อนแนวนอน (มือถือ/แท็บเล็ต)
  // whitespace-nowrap ทุกจุด: ข้อความภาษาไทยห้ามตัดขึ้นบรรทัดใหม่กลางคำ (เช่น "Gacha เรน|เจอร์")
  const links = NAV_ITEMS.map((item) => {
    const isActive = pathname.startsWith(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={`shrink-0 whitespace-nowrap flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
          isActive
            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        <span className="material-icons-round text-sm">{item.icon}</span>
        {item.label}
      </Link>
    )
  })

  return (
    <nav className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Logo + Nav Links (จอกว้าง ≥ 1024px) */}
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin" className="shrink-0 whitespace-nowrap flex items-center gap-2 text-lg font-black text-gradient-purple" title="หน้าหลักแอดมิน">
            <span className="material-icons-round text-purple-300 text-xl">admin_panel_settings</span>
            Admin Panel
          </Link>
          <div className="hidden lg:flex items-center gap-1 text-sm">{links}</div>
        </div>

        {/* Build status + User info + Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <BuildStatus />
          {/* กลับหน้าเว็บปกติ (ยังล็อกอินค้างไว้ — กลับมา /admin ได้โดยไม่ต้องล็อกอินใหม่) */}
          <Link
            href="/"
            title="กลับไปหน้าเว็บ"
            className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            <span className="material-icons-round text-sm">home</span>
            <span className="hidden sm:inline lg:hidden">หน้าเว็บ</span>
          </Link>
          {/* ชื่อผู้ใช้ย้ายไปอยู่ใน title ของปุ่มออกจากระบบ — แถบนี้กว้างแค่ 1152px ใส่ทุกอย่างไม่พอ */}
          <button
            onClick={() => { logout(); router.push('/') }}
            title={`ออกจากระบบ (${username})`}
            className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            <span className="material-icons-round text-sm">logout</span>
            <span className="hidden sm:inline lg:hidden xl:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Nav Links (มือถือ/แท็บเล็ต < 1024px) — แถวเลื่อนซ้ายขวา เดิมซ่อนไว้เฉยๆ ทำให้มือถือไปหน้าอื่นไม่ได้ */}
      <div ref={mobileRowRef} className="lg:hidden relative max-w-6xl mx-auto px-4 pb-3 -mt-1 flex items-center gap-1 text-sm overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links}
      </div>
    </nav>
  )
}
