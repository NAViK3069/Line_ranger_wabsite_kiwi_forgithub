'use client'

// ====================================================
// AdminBuildLog — "การอัปเดตเว็บล่าสุด" ในหน้าแรกของแอดมิน
// • ประวัติ GitHub Actions ยาวขึ้น (ทีละ 30 รอบ + ปุ่มโหลดเพิ่ม) แบ่งตามวัน
// • กรองตามประเภท: ดึงข้อมูลเกม + เมต้า / ข้อมูลเกมขึ้นเว็บ / บันทึกจากแอดมิน (แยกหน้าได้) / แก้โค้ด / สั่งเอง / ตรวจคำแปล
// • รอบดึงข้อมูลโชว์ผลทีละขั้นในบรรทัดเลย (Ranger Book · เมต้า PvP · ไฟล์ข้อมูล) — กดแถวไหนก็ดูขั้นตอนเต็มได้
// ประเภทแยกจาก: ไฟล์ workflow + ที่มา (push / ตามรอบดึงข้อมูล / สั่งเอง) + หัวข้อ commit ("admin: ..." = จากหน้าแอดมิน)
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRuns, getRunsPage, getRunJobs, type RunJob, type WorkflowRun } from '@/lib/adminApi'

// ── ประเภท ──────────────────────────────────────────

type Cat = 'data' | 'publish' | 'admin' | 'code' | 'manual' | 'check' | 'other'
type Filter = 'all' | Exclude<Cat, 'other'>

const CATS: { id: Filter; label: string; icon: string; tone: string; workflow?: string; hint: string }[] = [
  { id: 'all', label: 'ทั้งหมด', icon: 'list', tone: 'text-gray-200', hint: 'ทุกอย่างที่ทำงานบน GitHub Actions' },
  { id: 'data', label: 'ดึงข้อมูลเกม + เมต้า', icon: 'cloud_download', tone: 'text-emerald-300', workflow: 'data.yml', hint: 'ดึง Ranger Book / Gear Book และอันดับ PvP (เมต้า) ทุกลีค — อัตโนมัติทุกวัน 07:00 หรือกด Sync เอง' },
  { id: 'publish', label: 'ข้อมูลเกมขึ้นเว็บ', icon: 'published_with_changes', tone: 'text-sky-300', workflow: 'deploy.yml', hint: 'build หน้าเว็บใหม่ด้วยข้อมูลเกมชุดล่าสุด (เริ่มเองหลังดึงข้อมูลเสร็จ)' },
  { id: 'admin', label: 'บันทึกจากแอดมิน', icon: 'edit_note', tone: 'text-pink-300', workflow: 'deploy.yml', hint: 'กดบันทึกในหน้าแอดมิน (Gacha / Tier List / Top 40 / About) แล้วเว็บ build ใหม่' },
  { id: 'code', label: 'แก้โค้ดเว็บ', icon: 'code', tone: 'text-violet-300', workflow: 'deploy.yml', hint: 'push โค้ดใหม่ขึ้น main' },
  { id: 'manual', label: 'สั่ง build เอง', icon: 'touch_app', tone: 'text-amber-300', workflow: 'deploy.yml', hint: 'กดรัน Deploy เองที่ GitHub' },
  { id: 'check', label: 'ตรวจคำแปล', icon: 'translate', tone: 'text-cyan-300', workflow: 'talent-coverage-check.yml', hint: 'เช็คคำแปล Talent ที่ยังขาด (ทุกวันอังคาร)' },
]
const CAT_OF: Record<Cat, { label: string; icon: string; tone: string }> = {
  ...(Object.fromEntries(CATS.map(c => [c.id, c])) as unknown as Record<Filter, { label: string; icon: string; tone: string }>),
  other: { label: 'อื่นๆ', icon: 'more_horiz', tone: 'text-gray-400' },
}

/** Worker เวอร์ชันเก่าไม่ส่งชื่อไฟล์ workflow มา → เดาจากชื่อ workflow */
function workflowOf(r: WorkflowRun): string {
  if (r.workflow) return r.workflow
  if (r.name === 'Daily Data') return 'data.yml'
  if (r.name === 'Deploy') return 'deploy.yml'
  if (r.name.startsWith('Talent')) return 'talent-coverage-check.yml'
  return ''
}
const isAdminCommit = (title?: string) => /^admin:/i.test(title ?? '')

function categorize(r: WorkflowRun): Cat {
  const wf = workflowOf(r)
  if (wf === 'data.yml') return 'data'
  if (wf === 'talent-coverage-check.yml') return 'check'
  if (wf === 'deploy.yml') {
    if (r.event === 'workflow_run') return 'publish'
    if (r.event === 'workflow_dispatch') return 'manual'
    if (r.event === 'push') return isAdminCommit(r.title) ? 'admin' : 'code'
  }
  return 'other'
}

// ── บันทึกจากแอดมิน: แยกว่าแก้หน้าไหน (จากหัวข้อ commit ที่ adminApi.ts ตั้งให้) ──

type Area = 'gacha-ranger' | 'gacha-gear' | 'gacha' | 'tierlist' | 'top40' | 'about' | 'other'
type AreaFilter = 'all' | Exclude<Area, 'gacha' | 'other'>
const AREAS: { id: AreaFilter; label: string }[] = [
  { id: 'all', label: 'ทุกหน้า' },
  { id: 'gacha-ranger', label: 'Gacha เรนเจอร์' },
  { id: 'gacha-gear', label: 'Gacha เกียร์' },
  { id: 'tierlist', label: 'Tier List' },
  { id: 'top40', label: 'Top 40 Legend' },
  { id: 'about', label: 'About Me' },
]
const AREA_LABEL: Record<Area, string> = {
  'gacha-ranger': 'ตู้ Gacha เรนเจอร์', 'gacha-gear': 'ตู้ Gacha เกียร์', gacha: 'ตู้ Gacha',
  tierlist: 'Tier List เริ่มต้น', top40: 'Top 40 Legend', about: 'หน้า About Me', other: '',
}

function adminInfo(title = ''): { area: Area; text: string } {
  const t = title.replace(/^admin:\s*/i, '')
  // ตู้กาชาเกียร์ ต้องเช็คก่อน (มีคำว่า ตู้กาชา อยู่ข้างใน)
  const area: Area = /ตู้กาชาเกียร์|gacha-gear-pools/.test(t) ? 'gacha-gear'
    : /ตู้กาชา|gacha-pools/.test(t) ? 'gacha-ranger'
    : /^toggle/i.test(t) ? 'gacha'
    : /tier ?list/i.test(t) ? 'tierlist'
    : /top ?40/i.test(t) ? 'top40'
    : /about/i.test(t) ? 'about' : 'other'
  const verb = /^add\b/i.test(t) ? 'เพิ่ม' : /^update\b/i.test(t) ? 'แก้' : /^delete\b/i.test(t) ? 'ลบ'
    : /^reorder\b/i.test(t) ? 'จัดลำดับ' : /^toggle\b/i.test(t) ? 'เปิด/ปิด' : ''
  const name = t.match(/"(.+)"/)?.[1]
  const text = area === 'other' ? t : `${verb}${verb ? ' ' : ''}${AREA_LABEL[area]}${name ? ` “${name}”` : ''}`
  return { area, text }
}
const areaMatches = (a: Area, f: AreaFilter) => f === 'all' || a === f || (a === 'gacha' && (f === 'gacha-ranger' || f === 'gacha-gear'))

function runTitle(r: WorkflowRun, cat: Cat): string {
  switch (cat) {
    case 'data': return 'ดึงข้อมูลเกม + อันดับ PvP (เมต้า)'
    case 'publish': return 'เอาข้อมูลเกมชุดใหม่ขึ้นเว็บ'
    case 'admin': return adminInfo(r.title).text
    case 'code': return r.title || 'อัปเดตโค้ดเว็บ'
    case 'manual': return 'สั่ง build หน้าเว็บเอง'
    case 'check': return 'ตรวจคำแปล Talent'
    default: return r.title || r.name
  }
}

// ── สถานะ / เวลา ─────────────────────────────────────

function runStatus(r: { status: string; conclusion: string | null }): { label: string; icon: string; cls: string; spin?: boolean } {
  if (r.status !== 'completed') return { label: r.status === 'queued' || r.status === 'waiting' ? 'รอคิว' : 'กำลังทำงาน', icon: 'autorenew', cls: 'text-yellow-300', spin: true }
  if (r.conclusion === 'success') return { label: 'สำเร็จ', icon: 'check_circle', cls: 'text-green-400' }
  if (r.conclusion === 'cancelled') return { label: 'ยกเลิก (มีรอบใหม่แทน)', icon: 'do_not_disturb_on', cls: 'text-gray-400' }
  if (r.conclusion === 'skipped') return { label: 'ข้าม', icon: 'redo', cls: 'text-gray-400' }
  return { label: 'ล้มเหลว', icon: 'error', cls: 'text-red-400' }
}

const RUN_EVENT: Record<string, string> = {
  push: 'จากการ push', schedule: 'อัตโนมัติ', workflow_dispatch: 'สั่งเอง', workflow_run: 'ต่อจากดึงข้อมูล',
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'เมื่อสักครู่'
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`
  return `${Math.floor(s / 86400)} วันที่แล้ว`
}

function duration(a?: string | null, b?: string | null): string {
  if (!a || !b) return ''
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)
  if (!(s >= 0)) return ''
  if (s < 60) return `${s} วิ`
  if (s < 3600) return `${Math.floor(s / 60)} นาที${s % 60 ? ` ${s % 60} วิ` : ''}`
  return `${Math.floor(s / 3600)} ชม. ${Math.floor((s % 3600) / 60)} นาที`
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'วันนี้'
  if (d.toDateString() === yest.toDateString()) return 'เมื่อวาน'
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

// ── ขั้นตอน ─────────────────────────────────────────

/** ขั้นสำคัญที่โชว์เป็นป้ายในบรรทัด (รอบดึงข้อมูล) — ชื่อต้องตรงกับ name: ใน data.yml */
const KEY_STEPS: Record<string, string> = {
  'Sync Ranger Book + Gear Book': 'Ranger/Gear Book',
  'Refresh PvP rankings (all leagues)': 'เมต้า PvP',
  'Emit static JSON (public/data)': 'ไฟล์ข้อมูล',
  'Save to branch `data`': 'บันทึก',
}
/** ชื่อขั้นเป็นภาษาคน (ที่ไม่มีในนี้ใช้ชื่อเดิม) */
const STEP_LABEL: Record<string, string> = {
  ...KEY_STEPS,
  'Refresh PvP rankings (all leagues)': 'อันดับ PvP ทุกลีค (เมต้า)',
  'Restore previous data (branch `data`)': 'โหลดข้อมูลเมื่อวาน',
  'Load game data (branch `data`)': 'โหลดข้อมูลเกม',
  'Emit content JSON': 'เนื้อหาจากแอดมิน',
  'Build (static export)': 'Build หน้าเว็บ',
  'Custom domain + no Jekyll': 'ตั้งโดเมน',
  'Run npm ci': 'ติดตั้งแพ็กเกจ',
  'Run coverage check': 'ตรวจคำแปล',
  'Create issue if missing translations': 'เปิด issue คำแปลที่ขาด',
}
const stepLabel = (n: string) => STEP_LABEL[n]
  ?? (/^Run actions\/upload-pages-artifact/.test(n) ? 'อัปโหลดไฟล์เว็บ' : /^Run actions\/deploy-pages/.test(n) ? 'ขึ้นเว็บ (GitHub Pages)' : n)
/** ขั้นเบื้องหลังที่ไม่ต้องโชว์ (ยกเว้นขั้นอัปโหลด/ขึ้น GitHub Pages) */
const hiddenStep = (n: string) =>
  !/^Run actions\/(upload-pages-artifact|deploy-pages)/.test(n) && /^(Set up job|Complete job|Post |Run actions\/|Checkout code$|Setup Node)/.test(n)

function stepIcon(s: { status: string; conclusion: string | null }) {
  if (s.status !== 'completed') return { icon: 'autorenew', cls: 'text-yellow-300', spin: true }
  if (s.conclusion === 'success') return { icon: 'check', cls: 'text-green-400' }
  if (s.conclusion === 'skipped') return { icon: 'remove', cls: 'text-gray-500' }
  if (s.conclusion === 'cancelled') return { icon: 'block', cls: 'text-gray-400' }
  return { icon: 'close', cls: 'text-red-400' }
}

const FILTER_KEY = 'lr:admin:build-filter'

// ── คอมโพเนนต์ ───────────────────────────────────────

export default function AdminBuildLog() {
  // แถบสรุปตอนพับ: รอบล่าสุดของทุก workflow
  const [latest, setLatest] = useState<WorkflowRun | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [area, setArea] = useState<AreaFilter>('all')
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [jobs, setJobs] = useState<Record<number, RunJob[] | null>>({})
  const jobsLoading = useRef(new Set<number>())
  const source = CATS.find(c => c.id === filter)?.workflow

  useEffect(() => {
    try { const f = localStorage.getItem(FILTER_KEY) as Filter | null; if (f && CATS.some(c => c.id === f)) setFilter(f) } catch { /* ไม่มี storage */ }
  }, [])

  const loadLatest = useCallback(() => { getRuns().then(r => setLatest(r[0] ?? null)).catch(() => setLatest(null)) }, [])
  useEffect(() => {
    loadLatest()
    const t = setInterval(loadLatest, 30000)
    return () => clearInterval(t)
  }, [loadLatest])

  /** โหลดหน้าแรกใหม่ (เปลี่ยนตัวกรอง) หรือรวมหน้าแรกเข้ากับที่มีอยู่ (รีเฟรชอัตโนมัติ) */
  const loadFirst = useCallback(async (merge: boolean) => {
    setBusy(true); setError('')
    try {
      const { runs: fresh, total: t } = await getRunsPage({ page: 1, perPage: 30, workflow: source })
      setTotal(t)
      setRuns(prev => {
        if (!merge || !prev) return fresh
        const keys = new Set(fresh.map(runKey))
        return [...fresh, ...prev.filter(r => !keys.has(runKey(r)))]
      })
      if (!merge) setPage(1)
      // รอบที่ยังไม่จบ → ขั้นตอนเก่าใน cache ใช้ไม่ได้แล้ว
      setJobs(prev => {
        const next = { ...prev }
        for (const r of fresh) if (r.id && r.status !== 'completed') delete next[r.id]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
      if (!merge) setRuns([])
    } finally { setBusy(false) }
  }, [source])

  const loadMore = async () => {
    setBusy(true); setError('')
    try {
      const { runs: more, total: t } = await getRunsPage({ page: page + 1, perPage: 30, workflow: source })
      setTotal(t)
      setRuns(prev => {
        const keys = new Set((prev ?? []).map(runKey))
        return [...(prev ?? []), ...more.filter(r => !keys.has(runKey(r)))]
      })
      setPage(p => p + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  // เปิดแถบ / เปลี่ยนตัวกรอง → โหลดใหม่
  useEffect(() => { if (open) { setRuns(null); loadFirst(false) } }, [open, loadFirst])
  // เปิดอยู่: รีเฟรชทุก 30 วิ · มีรอบที่ยังทำงาน → ทุก 15 วิ
  const running = !!runs?.some(r => r.status !== 'completed')
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => loadFirst(true), running ? 15000 : 30000)
    return () => clearInterval(t)
  }, [open, running, loadFirst])

  const visible = useMemo(() => (runs ?? []).filter(r => {
    const c = categorize(r)
    if (filter !== 'all' && c !== filter) return false
    if (filter === 'admin' && !areaMatches(adminInfo(r.title).area, area)) return false
    return true
  }), [runs, filter, area])

  const ensureJobs = useCallback(async (id: number) => {
    if (jobsLoading.current.has(id)) return
    jobsLoading.current.add(id)
    try {
      const j = await getRunJobs(id).catch(() => null)
      setJobs(prev => ({ ...prev, [id]: j }))
    } finally { jobsLoading.current.delete(id) }
  }, [])

  // รอบดึงข้อมูลที่เห็นอยู่ (15 รอบแรก): โหลดขั้นตอนมาโชว์เป็นป้ายเลย — ทีละรอบ ไม่รุมยิง GitHub
  useEffect(() => {
    if (!open) return
    const need = visible.filter(r => r.id && categorize(r) === 'data' && !(r.id in jobs)).slice(0, 15)
    if (!need.length) return
    let alive = true
    ;(async () => { for (const r of need) { if (!alive) break; await ensureJobs(r.id!) } })()
    return () => { alive = false }
  }, [open, visible, jobs, ensureJobs])

  const toggleRow = (r: WorkflowRun) => {
    const k = runKey(r)
    setExpanded(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
    if (r.id && !(r.id in jobs)) ensureJobs(r.id)
  }

  const pickFilter = (f: Filter) => {
    setFilter(f); setArea('all')
    try { localStorage.setItem(FILTER_KEY, f) } catch { /* ไม่มี storage */ }
  }

  // แบ่งกลุ่มตามวัน
  const groups = useMemo(() => {
    const out: { day: string; items: WorkflowRun[] }[] = []
    for (const r of visible) {
      const day = dayLabel(r.createdAt)
      if (out.at(-1)?.day !== day) out.push({ day, items: [] })
      out.at(-1)!.items.push(r)
    }
    return out
  }, [visible])

  const lst = latest ? runStatus(latest) : null
  const hasMore = total !== null && (runs?.length ?? 0) < total
  const cat = CATS.find(c => c.id === filter)!

  return (
    <details className="group card-glass rounded-2xl border border-white/10" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="material-icons-round text-gray-300 text-xl">history</span>
        <span className="font-semibold text-white text-sm whitespace-nowrap">การอัปเดตเว็บล่าสุด</span>
        {latest && lst && (
          <span className={`hidden sm:flex items-center gap-1 text-xs ${lst.cls} min-w-0`}>
            <span className={`material-icons-round text-base ${lst.spin ? 'animate-spin' : ''}`}>{lst.icon}</span>
            <span className="truncate">{CAT_OF[categorize(latest)].label} · {lst.label} · {timeAgo(latest.updatedAt)}</span>
          </span>
        )}
        {latest && lst && <span className="sm:hidden inline-flex"><span className={`material-icons-round text-base ${lst.cls} ${lst.spin ? 'animate-spin' : ''}`}>{lst.icon}</span></span>}
        <span className="material-icons-round ml-auto text-gray-400 transition-transform group-open:rotate-180">expand_more</span>
      </summary>

      <div className="px-4 pb-4">
        {/* ตัวกรองประเภท */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
          {CATS.map(c => (
            <button
              key={c.id}
              onClick={() => pickFilter(c.id)}
              title={c.hint}
              className={`shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs border transition-colors ${
                filter === c.id ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.07]'
              }`}
            >
              <span className={`material-icons-round text-[16px] ${filter === c.id ? c.tone : ''}`}>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* บันทึกจากแอดมิน: แยกตามหน้า */}
        {filter === 'admin' && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {AREAS.map(a => (
              <button key={a.id} onClick={() => setArea(a.id)}
                className={`h-7 px-2.5 rounded-full text-[11.5px] border transition-colors ${
                  area === a.id ? 'bg-pink-500/20 border-pink-400/40 text-pink-200' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2 mb-1">
          <p className="text-[11.5px] text-gray-500 leading-snug min-w-0 flex-1">{cat.hint}</p>
          <button onClick={() => loadFirst(true)} disabled={busy} className="shrink-0 text-xs text-gray-400 hover:text-white flex items-center gap-1 disabled:opacity-50" title="โหลดใหม่">
            <span className={`material-icons-round text-base ${busy ? 'animate-spin' : ''}`}>refresh</span>รีเฟรช
          </button>
        </div>

        {error && <p className="text-xs text-red-300 py-1">{error}</p>}

        {runs === null ? (
          <p className="text-sm text-gray-500 py-3">กำลังโหลด...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500 py-3">
            {runs.length === 0 ? 'ยังไม่มีข้อมูล (หรืออ่านจาก GitHub ไม่ได้)' : 'ไม่มีรายการประเภทนี้ในช่วงที่โหลดมา'}
            {hasMore && ' — ลองกดโหลดเพิ่ม'}
          </p>
        ) : (
          groups.map(g => (
            <div key={g.day} className="mt-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide py-1">{g.day}</p>
              <ul className="divide-y divide-white/5">
                {g.items.map(r => (
                  <RunRow key={runKey(r)} r={r} open={expanded.has(runKey(r))} jobs={r.id ? jobs[r.id] : undefined} onToggle={() => toggleRow(r)} />
                ))}
              </ul>
            </div>
          ))
        )}

        {runs !== null && (hasMore || total !== null) && (
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="text-[11.5px] text-gray-500">
              โหลดแล้ว {runs.length}{total !== null ? ` จาก ${total}` : ''} รอบ{filter !== 'all' && source === 'deploy.yml' ? ' (ของ Deploy)' : ''}
            </span>
            {hasMore && (
              <button onClick={loadMore} disabled={busy}
                className="h-8 px-3 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 disabled:opacity-50 flex items-center gap-1">
                <span className="material-icons-round text-base">expand_more</span>โหลดเพิ่ม
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

const runKey = (r: WorkflowRun) => String(r.id ?? r.url)

function RunRow({ r, open, jobs, onToggle }: { r: WorkflowRun; open: boolean; jobs: RunJob[] | null | undefined; onToggle: () => void }) {
  const cat = categorize(r)
  const c = CAT_OF[cat]
  const st = runStatus(r)
  const steps = (jobs ?? []).flatMap(j => j.steps)
  const keySteps = cat === 'data' ? steps.filter(s => s.name in KEY_STEPS) : []
  // ขั้นที่ล้มเหลวแต่ทั้งรอบยัง "สำเร็จ" (continue-on-error) — ต้องบอกให้เห็น
  const partial = r.conclusion === 'success' && steps.some(s => s.conclusion === 'failure')
  const took = r.status === 'completed' ? duration(r.startedAt ?? r.createdAt, r.updatedAt) : ''

  return (
    <li>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex items-start gap-3 py-2.5 hover:bg-white/[0.03] -mx-2 px-2 rounded-lg cursor-pointer">
        <span className={`material-icons-round text-xl mt-0.5 ${partial ? 'text-amber-300' : st.cls} ${st.spin ? 'animate-spin' : ''}`}>{partial ? 'warning' : st.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white leading-snug">
            <span className={`inline-flex items-center gap-0.5 mr-1.5 align-[-2px] text-[11px] ${c.tone}`}>
              <span className="material-icons-round text-[14px]">{c.icon}</span>
            </span>
            <span className="break-words">{runTitle(r, cat)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-1.5">
            <span className={partial ? 'text-amber-300' : st.cls}>{partial ? 'สำเร็จบางส่วน' : st.label}</span>
            <span>· {RUN_EVENT[r.event] ?? r.event}</span>
            {took && <span>· ใช้เวลา {took}</span>}
            {r.runNumber ? <span>· #{r.runNumber}{r.attempt && r.attempt > 1 ? ` (ครั้งที่ ${r.attempt})` : ''}</span> : null}
            {cat === 'code' && r.sha && <span className="font-mono">· {r.sha}</span>}
          </p>
          {keySteps.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {keySteps.map(s => {
                const ic = stepIcon(s)
                return (
                  <span key={s.number} className="inline-flex items-center gap-0.5 h-5 pl-1 pr-1.5 rounded-md bg-white/[0.04] border border-white/10 text-[11px] text-gray-300" title={s.name}>
                    <span className={`material-icons-round text-[13px] ${ic.cls} ${ic.spin ? 'animate-spin' : ''}`}>{ic.icon}</span>
                    {KEY_STEPS[s.name]}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400 whitespace-nowrap">{clock(r.createdAt)}</p>
          <p className="text-[11px] text-gray-600 whitespace-nowrap">{timeAgo(r.updatedAt)}</p>
        </div>
      </div>

      {open && (
        <div className="ml-9 mb-2 -mt-1 rounded-xl bg-black/20 border border-white/5 p-3 text-xs">
          {cat === 'admin' && r.title && <p className="text-gray-400 mb-2 break-words"><span className="text-gray-500">commit:</span> {r.title}</p>}
          {jobs === undefined ? (
            <p className="text-gray-500">{r.id ? 'กำลังโหลดขั้นตอน...' : 'Worker เวอร์ชันนี้ยังดูขั้นตอนไม่ได้ — deploy Worker ใหม่ก่อน'}</p>
          ) : jobs === null ? (
            <p className="text-gray-500">อ่านขั้นตอนจาก GitHub ไม่ได้ (Worker อาจยังเป็นเวอร์ชันเก่า)</p>
          ) : (
            jobs.map(j => (
              <div key={j.name} className="mb-2 last:mb-0">
                {jobs.length > 1 && <p className="text-gray-400 font-semibold mb-1">{j.name === 'build' ? 'Build' : j.name === 'deploy' ? 'ขึ้นเว็บ (GitHub Pages)' : j.name}</p>}
                <ol className="space-y-0.5">
                  {j.steps.filter(s => !hiddenStep(s.name)).map(s => {
                    const ic = stepIcon(s)
                    return (
                      <li key={s.number} className="flex items-center gap-2">
                        <span className={`material-icons-round text-[15px] ${ic.cls} ${ic.spin ? 'animate-spin' : ''}`}>{ic.icon}</span>
                        <span className={`flex-1 min-w-0 truncate ${s.conclusion === 'failure' ? 'text-red-300' : 'text-gray-300'}`} title={s.name}>{stepLabel(s.name)}</span>
                        <span className="text-gray-500 whitespace-nowrap">{duration(s.startedAt, s.completedAt)}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))
          )}
          <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 mt-2 text-sky-300 hover:text-sky-200">
            <span className="material-icons-round text-[15px]">open_in_new</span>เปิด log เต็มใน GitHub
          </a>
        </div>
      )}
    </li>
  )
}
