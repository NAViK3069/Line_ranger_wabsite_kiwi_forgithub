'use client'

// ====================================================
// Admin Dashboard — หน้าหลักของหลังบ้าน
// • การ์ดเมนูแบ่งกลุ่ม: เนื้อหาบนเว็บ / ข้อมูลเกม / เครื่องมือ
// • รายการ build ล่าสุด อ่านง่าย (สถานะ + ที่มา + เวลา)
// เพิ่มเมนูใหม่ที่ SECTIONS ที่เดียว (เมนูที่ใช้บ่อยใส่ใน AdminNav ด้วย)
// ====================================================

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { getRuns, type WorkflowRun } from '@/lib/adminApi'

interface MenuItem {
  href: string
  icon: string
  title: string
  description: string
  /** publish = บันทึกแล้วขึ้นเว็บจริง · view = ดู/ใช้งานอย่างเดียว */
  kind: 'publish' | 'view' | 'tool'
  tone: string
}

const SECTIONS: { title: string; hint: string; items: MenuItem[] }[] = [
  {
    title: 'สถิติ',
    hint: 'จาก Cloudflare Web Analytics — ไม่ใช้คุกกี้',
    items: [
      { href: '/admin/analytics', icon: 'insights', title: 'สถิติคนเข้าเว็บ', description: 'กราฟคนเข้ารายวัน หน้าที่เปิดบ่อย คนมาจากไหน ประเทศ และอุปกรณ์', kind: 'view', tone: 'text-sky-300' },
    ],
  },
  {
    title: 'เนื้อหาบนเว็บ',
    hint: 'แก้แล้วกดบันทึก — หน้าเว็บจริงจะอัปเดตภายใน 2–5 นาที',
    items: [
      { href: '/admin/Gacha-ranger', icon: 'casino', title: 'Gacha เรนเจอร์', description: 'เพิ่ม/แก้ตู้สุ่มเรนเจอร์ อัตราออก และเรนเจอร์การันตี', kind: 'publish', tone: 'text-yellow-300' },
      { href: '/admin/Gacha-Gear', icon: 'shield', title: 'Gacha เกียร์', description: 'เพิ่ม/แก้ตู้สุ่มเกียร์ และอัตราออกของแต่ละระดับ', kind: 'publish', tone: 'text-cyan-300' },
      { href: '/admin/tierlist', icon: 'leaderboard', title: 'Tier List เริ่มต้น', description: 'จัดเทียร์ลิสต์ที่ผู้ใช้ทุกคนเห็นเป็นค่าเริ่มต้น (และตอนกดรีเซ็ต)', kind: 'publish', tone: 'text-amber-300' },
      { href: '/admin/top40-legend', icon: 'emoji_events', title: 'Top 40 Legend', description: 'ดึงอันดับเรนเจอร์ลีค Legend ล่าสุด จัดเรียง แล้วบันทึกเป็นรูป', kind: 'publish', tone: 'text-orange-300' },
      { href: '/admin/about-me', icon: 'manage_accounts', title: 'About Me', description: 'โปรไฟล์ ประกาศ และลิงก์ติดต่อในหน้า About', kind: 'publish', tone: 'text-pink-300' },
    ],
  },
  {
    title: 'ข้อมูลเกม',
    hint: 'ดึงจาก lerico.net อัตโนมัติทุกวัน — สั่งอัปเดตเองได้ในหน้า Ranger Book',
    items: [
      { href: '/admin/ranger-book', icon: 'menu_book', title: 'Ranger Book', description: 'ดูเรนเจอร์ทั้งหมด และสั่งดึงข้อมูลเกมใหม่ทันที', kind: 'view', tone: 'text-emerald-300' },
      { href: '/admin/gear-book', icon: 'inventory_2', title: 'Gear Book', description: 'ดูเกียร์ทั้งหมดที่ sync มาจาก lerico.net', kind: 'view', tone: 'text-violet-300' },
    ],
  },
  {
    title: 'เครื่องมือ',
    hint: 'ใช้งานในเครื่อง ไม่เปลี่ยนอะไรบนเว็บ',
    items: [
      { href: '/admin/lobby', icon: 'photo_camera', title: 'Lobby', description: 'จัดฉากล็อบบี้ วางวัตถุได้ เลือกเรนเจอร์ได้ทุกตัว แล้วเซฟเป็นรูป', kind: 'tool', tone: 'text-sky-300' },
    ],
  },
]

const KIND_TAG: Record<MenuItem['kind'], { label: string; cls: string }> = {
  publish: { label: 'ขึ้นเว็บจริง', cls: 'text-green-300 bg-green-500/10 border-green-500/25' },
  view: { label: 'ดูข้อมูล', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
  tool: { label: 'เครื่องมือ', cls: 'text-gray-300 bg-white/5 border-white/15' },
}

/** สถานะ build เป็นภาษาคน */
function runStatus(r: WorkflowRun): { label: string; icon: string; cls: string; spin?: boolean } {
  if (r.status !== 'completed') return { label: 'กำลังทำงาน', icon: 'autorenew', cls: 'text-yellow-300', spin: true }
  if (r.conclusion === 'success') return { label: 'สำเร็จ', icon: 'check_circle', cls: 'text-green-400' }
  if (r.conclusion === 'cancelled') return { label: 'ยกเลิก (มีรอบใหม่แทน)', icon: 'do_not_disturb_on', cls: 'text-gray-400' }
  return { label: 'ล้มเหลว', icon: 'error', cls: 'text-red-400' }
}

const RUN_NAME: Record<string, string> = { Deploy: 'อัปเดตหน้าเว็บ', 'Daily Data': 'ดึงข้อมูลเกม' }
const RUN_EVENT: Record<string, string> = { push: 'จากการบันทึก', schedule: 'อัตโนมัติรายวัน', workflow_dispatch: 'สั่งเอง' }

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'เมื่อสักครู่'
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`
  return `${Math.floor(s / 86400)} วันที่แล้ว`
}

function RecentBuilds() {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null)
  const load = useCallback(() => { getRuns().then(r => setRuns(r.slice(0, 5))).catch(() => setRuns([])) }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])
  // มีรอบที่ยังทำงานอยู่ → เช็คถี่ขึ้น (15 วินาที) ให้สถานะเปลี่ยนเป็นสำเร็จเองโดยไม่ต้องรีเฟรช
  const running = !!runs?.some(r => r.status !== 'completed')
  useEffect(() => {
    if (!running) return
    const t = setTimeout(load, 15000)
    return () => clearTimeout(t)
  }, [running, runs, load])

  // แถบพับได้: ปิดอยู่ก็เห็นสถานะรอบล่าสุดในบรรทัดเดียว · กดเพื่อดูรายการ
  const latest = runs?.[0]
  const lst = latest ? runStatus(latest) : null
  return (
    <details className="group card-glass rounded-2xl border border-white/10">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="material-icons-round text-gray-300 text-xl">history</span>
        <span className="font-semibold text-white text-sm whitespace-nowrap">การอัปเดตเว็บล่าสุด</span>
        {latest && lst && (
          <span className={`hidden sm:flex items-center gap-1 text-xs ${lst.cls} min-w-0`}>
            <span className={`material-icons-round text-base ${lst.spin ? 'animate-spin' : ''}`}>{lst.icon}</span>
            <span className="truncate">{lst.label} · {timeAgo(latest.updatedAt)}</span>
          </span>
        )}
        {latest && lst && <span className="sm:hidden inline-flex"><span className={`material-icons-round text-base ${lst.cls} ${lst.spin ? 'animate-spin' : ''}`}>{lst.icon}</span></span>}
        <span className="material-icons-round ml-auto text-gray-400 transition-transform group-open:rotate-180">expand_more</span>
      </summary>
      <div className="px-4 pb-3">
      <div className="flex justify-end -mt-1 mb-1">
        <button onClick={load} className="text-xs text-gray-400 hover:text-white flex items-center gap-1" title="โหลดใหม่">
          <span className="material-icons-round text-base">refresh</span>รีเฟรช
        </button>
      </div>
      {runs === null ? (
        <p className="text-sm text-gray-500 py-3">กำลังโหลด...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">ยังไม่มีข้อมูล (หรืออ่านจาก GitHub ไม่ได้)</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {runs.map(r => {
            const st = runStatus(r)
            return (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 hover:bg-white/[0.03] -mx-2 px-2 rounded-lg">
                  <span className={`material-icons-round text-xl ${st.cls} ${st.spin ? 'animate-spin' : ''}`}>{st.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{RUN_NAME[r.name] ?? r.name} <span className="text-gray-500">· {RUN_EVENT[r.event] ?? r.event}</span></p>
                    <p className={`text-xs ${st.cls}`}>{st.label}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{timeAgo(r.updatedAt)}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </details>
  )
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-7">
      {/* หัวเล็กๆ + แถบการอัปเดตเว็บล่าสุด (พับได้) */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">Admin Panel</h1>
          <p className="text-sm text-gray-400">จัดการเนื้อหาของเว็บ Line Ranger Kiwi</p>
        </div>
        <RecentBuilds />
      </div>

      {/* เมนูแบ่งกลุ่ม */}
      {SECTIONS.map(sec => (
        <section key={sec.title}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
            <h2 className="text-lg font-bold text-white">{sec.title}</h2>
            <p className="text-xs text-gray-500">{sec.hint}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sec.items.map(item => {
              const tag = KIND_TAG[item.kind]
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group card-glass rounded-2xl p-4 sm:p-5 flex gap-4 border border-white/10 hover:border-white/25 hover:bg-white/[0.06] transition-all active:scale-[0.99]"
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <span className={`material-icons-round text-[26px] ${item.tone}`}>{item.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white">{item.title}</h3>
                      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md border ${tag.cls}`}>{tag.label}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">{item.description}</p>
                  </div>
                  <span className="material-icons-round self-center text-gray-600 group-hover:text-white group-hover:translate-x-0.5 transition-all">chevron_right</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
