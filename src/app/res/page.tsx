'use client'

// ====================================================
// /res — ไล่ดูโฟลเดอร์ของ rangers.lerico.net/res/ ผ่านเว็บเรา
// เข้าได้เฉพาะคนที่ปลดล็อค Beta (ด่านอยู่ที่นี่ และที่ตัว API อีกชั้น)
//
// โชว์เฉพาะโฟลเดอร์กับไฟล์ .png / .plist / .sam — กรองที่ฝั่ง API แล้ว
// พาธเก็บไว้ใน query string (?p=hd/area) ปุ่มย้อนกลับของเบราว์เซอร์จึงใช้ได้ตามปกติ
// ====================================================

import { proxyFile, loadResDir } from '@/lib/staticApi'
import { apiFetch } from '@/lib/staticApi'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'
import RangerAnimationPopup from '@/components/RangerAnimationPopup'

interface DirEntry {
  name: string
  kind: 'dir' | 'file'
  date: string
  size: number | null
}

const ORIGIN = 'https://rangers.lerico.net/res/'
const fileUrl = (path: string) =>
  proxyFile(ORIGIN + path)

// รายการของแต่ละโฟลเดอร์ — เก็บไว้ทั้ง session เดินกลับไปกลับมาไม่ต้องโหลดซ้ำ
const dirCache = new Map<string, DirEntry[]>()

// จำว่าจากแต่ละโฟลเดอร์ เรากดเข้าตัวไหนไป — ขากลับจะได้เลื่อนไปหาแถวนั้น
//
// เก็บ "ชื่อโฟลเดอร์" ไม่ใช่ตำแหน่งพิกเซล เพราะพิกเซลใช้ไม่ได้ทันทีที่เปลี่ยนการเรียง
// ย่อ/ขยายจอ หรือกรองรายการ ส่วนชื่อยังหาเจอเสมอ
//
// ⚠ ทำไมต้องเลื่อนเองแทนที่จะพึ่งเบราว์เซอร์: วัดแล้วตอนกดย้อนกลับ หน้ายังสูงแค่ 718px
// อยู่ 2 เฟรม (รายการยังไม่ทันขึ้น) เบราว์เซอร์เลยคืนตำแหน่งไม่ได้ กว่ารายการ 808 อัน
// จะโผล่ทำให้หน้าสูง 29,945px ตำแหน่งก็ค้างที่ 0 ไปแล้ว — ต้องรอรายการขึ้นก่อนถึงเลื่อนได้
const lastOpened = new Map<string, string>()

/** จอกว้างพอจะฝังตัวเล่นไว้ในหน้าไหม — แคบกว่านี้ให้เปิดเป็นป๊อปอัพเหมือนเดิม */
function useWideScreen(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

// ⚠️ ต้องบวกเลขนี้ทุกครั้งที่แก้กฎกรองใน /api/lerico-proxy/dir
// คำตอบของ API ถูก cache ในเบราว์เซอร์ 7 วัน เปลี่ยนกฎเฉยๆ คนที่เคยเปิดจะยังเห็นของเก่า
// จนกว่าจะหมดอายุ — เลขนี้อยู่ใน URL พอเปลี่ยนก็กลายเป็นคนละรายการ cache ทันที
// v2 = เริ่มซ่อน _raw กับโฟลเดอร์ตัวละคร (u<เลข>- / g<เลข>-)
// v3 = เริ่มซ่อนโฟลเดอร์ที่เปิดเข้าไปแล้วว่างเปล่า
const DIR_RULES_VERSION = 3

const EXT_STYLE: Record<string, { color: string; label: string }> = {
  png:   { color: 'text-emerald-400', label: 'PNG' },
  plist: { color: 'text-amber-400',   label: 'PLIST' },
  sam:   { color: 'text-sky-400',     label: 'SAM' },
}
const extOf = (n: string) => n.slice(n.lastIndexOf('.') + 1).toLowerCase()

// ── การจัดเรียง ──
// ค่าเริ่มต้น = ชื่อ A→Z (โฟลเดอร์ขึ้นก่อนเสมอ ไม่ว่าจะเรียงแบบไหน — เหมือน file manager ทั่วไป)
// กดหัวคอลัมน์เดิมซ้ำ = สลับทิศ / กดอีกคอลัมน์ = ใช้ทิศเริ่มต้นของคอลัมน์นั้น
type SortKey = 'name' | 'date'
const SORT_DEFAULT_ASC: Record<SortKey, boolean> = { name: true, date: false }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DATE_RE = /^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2})$/

/** "11-Feb-2026 03:55" (รูปแบบของ nginx autoindex) → เลขไว้เทียบ, อ่านไม่ออกให้เป็น 0 = เก่าสุด */
function dateValue(s: string): number {
  const m = DATE_RE.exec(s)
  if (!m) return 0
  const mo = MONTHS.indexOf(m[2])
  if (mo < 0) return 0
  return Date.UTC(+m[3], mo, +m[1], +m[4], +m[5])
}

const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function humanSize(b: number | null): string {
  if (b === null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="text-yellow-400 shrink-0" fill="currentColor">
      <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
    </svg>
  )
}

function FileIcon({ ext }: { ext: string }) {
  const c = EXT_STYLE[ext]?.color ?? 'text-gray-500'
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className={`${c} shrink-0`} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function SortHeader({ label, col, sort, onClick }: {
  label: string
  col: SortKey
  sort: { key: SortKey; asc: boolean }
  onClick: (k: SortKey) => void
}) {
  const on = sort.key === col
  return (
    <button
      type="button" onClick={() => onClick(col)}
      className={`inline-flex items-center gap-0.5 rounded px-1 -mx-1 py-0.5 transition-colors hover:text-gray-200 ${
        on ? 'text-cyan-300' : ''
      }`}
    >
      {label}
      {/* จองที่ลูกศรไว้เสมอ ไม่งั้นหัวคอลัมน์จะขยับตอนสลับการเรียง */}
      <span className="material-icons-round text-[14px] w-[14px]">
        {on ? (sort.asc ? 'arrow_upward' : 'arrow_downward') : ''}
      </span>
    </button>
  )
}

/** ขอรายการของโฟลเดอร์หนึ่ง — ผ่าน cache ระดับ session ก่อนเสมอ */
async function loadDir(path: string): Promise<DirEntry[]> {
  const hit = dirCache.get(path)
  if (hit) return hit
  const list = await loadResDir(path)
  dirCache.set(path, list)
  return list
}

function ResBrowser() {
  const { tStat } = useLanguage()
  const { isPro, loading: proLoading } = usePro()
  const router = useRouter()
  const params = useSearchParams()
  const path = (params.get('p') ?? '').replace(/^\/+|\/+$/g, '')

  // เก็บพาธติดไปกับรายการด้วย — ตอนเปลี่ยนโฟลเดอร์ entries ของอันเก่าจะยังค้างอยู่ 1-2 เฟรม
  // ถ้าไม่รู้ว่ารายการที่ถืออยู่เป็นของใคร จะเผลอทำงานกับรายการผิดโฟลเดอร์
  const [entries, setEntries] = useState<{ path: string; list: DirEntry[] }>({ path: '', list: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  // รูปที่กดดู — โชว์ทับหน้าจอ (ผ่าน proxy เพราะต้นทางไม่ให้ดึงตรง)
  const [preview, setPreview] = useState<string | null>(null)
  // ชื่อโฟลเดอร์พี่น้องทั้งหมดในโฟลเดอร์แม่ — ใช้ทำปุ่มก่อนหน้า/ถัดไป
  const [siblings, setSiblings] = useState<string[]>([])
  const [playerOpen, setPlayerOpen] = useState(false)
  // ชื่อแถวที่เพิ่งเลื่อนไปหา — ไฮไลต์แวบนึงให้เห็นว่าค้างไว้ตรงไหน
  const [flash, setFlash] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restored = useRef(false)
  // คงไว้ข้ามโฟลเดอร์ — เลือกวิธีเรียงครั้งเดียวแล้วเดินดูได้ทั้งเว็บ
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const wide = useWideScreen()

  const toggleSort = useCallback((key: SortKey) => {
    setSort(s => (s.key === key ? { key, asc: !s.asc } : { key, asc: SORT_DEFAULT_ASC[key] }))
  }, [])

  const go = useCallback((next: string) => {
    router.push(next ? `/res?p=${encodeURIComponent(next)}` : '/res')
  }, [router])

  useEffect(() => {
    if (proLoading || !isPro) return
    const hit = dirCache.get(path)
    if (hit) { setEntries({ path, list: hit }); setLoading(false); setError(''); return }

    let alive = true
    setLoading(true)
    setError('')
    loadDir(path)
      .then(list => { if (alive) { setEntries({ path, list }); setLoading(false) } })
      .catch((e: Error) => { if (alive) { setError(e.message || 'Fetch failed'); setLoading(false) } })
    return () => { alive = false }
  }, [path, isPro, proLoading])

  // ── โฟลเดอร์พี่น้อง — ขอจากโฟลเดอร์แม่ (โดนแคชอยู่แล้วถ้าเพิ่งเดินลงมา) ──
  useEffect(() => {
    if (proLoading || !isPro || !path) { setSiblings([]); return }
    const parent = path.split('/').slice(0, -1).join('/')
    let alive = true
    loadDir(parent)
      .then(list => { if (alive) setSiblings(list.filter(e => e.kind === 'dir').map(e => e.name)) })
      .catch(() => { if (alive) setSiblings([]) })
    return () => { alive = false }
  }, [path, isPro, proLoading])

  useEffect(() => { setFilter('') }, [path])

  useEffect(() => {
    if (!preview) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [preview])

  // .plist กับ .sam ไม่ต้องโชว์เป็นแถว — ตัวเล่นด้านบนจัดการให้อยู่แล้ว เหลือ .png ให้ดูรูปพอ
  // ยกเว้นโฟลเดอร์ที่ไม่มี .png เลย ค่อยโชว์ไว้ ไม่งั้นจะกลายเป็นโฟลเดอร์เปล่าทั้งที่มีไฟล์อยู่
  // (สุ่มตรวจ 120 โฟลเดอร์ ยังไม่เจอเคสนั้น แต่กันไว้ก่อน)
  const visible = useMemo(() => {
    const list = entries.list
    const hasPng = list.some(e => e.kind === 'file' && e.name.toLowerCase().endsWith('.png'))
    if (!hasPng) return list
    return list.filter(e => e.kind !== 'file' || e.name.toLowerCase().endsWith('.png'))
  }, [entries])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = q ? visible.filter(e => e.name.toLowerCase().includes(q)) : visible
    const dir = sort.asc ? 1 : -1
    // slice ก่อน — sort แก้อาเรย์ต้นฉบับ ซึ่งที่นี่คือ entries ที่แคชไว้
    return list.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      if (sort.key === 'date') {
        const d = dateValue(a.date) - dateValue(b.date)
        // เวลาเท่ากันเพียบ (ไฟล์ชุดเดียวกันถูกอัปพร้อมกัน) — ตัดสินด้วยชื่อจะได้ลำดับนิ่ง
        if (d !== 0) return d * dir
        return nameCollator.compare(a.name, b.name)
      }
      return nameCollator.compare(a.name, b.name) * dir
    })
  }, [visible, filter, sort])

  const crumbs = path ? path.split('/') : []
  const dirCount = visible.filter(e => e.kind === 'dir').length
  const fileCount = visible.length - dirCount

  // ปุ่มก่อนหน้า/ถัดไป — เดินไปโฟลเดอร์พี่น้องตัวติดกันในโฟลเดอร์แม่
  const here = crumbs[crumbs.length - 1] ?? ''
  const sibIdx = siblings.indexOf(here)
  const parentPath = crumbs.slice(0, -1).join('/')
  const jump = (delta: number) => {
    const t = siblings[sibIdx + delta]
    if (t) go(parentPath ? `${parentPath}/${t}` : t)
  }

  // ไฟล์ .sam ทุกตัวในโฟลเดอร์ที่มี .plist กับ .png คู่ครบ — ขาดไฟล์ไหนก็เล่นไม่ได้
  // ส่งเป็น URL เต็มให้ตัวเล่น เพราะมันคาดหวังรูปแบบเดียวกับที่ API list คืนมา
  const samUrls = useMemo(() => {
    const names = new Set(entries.list.filter(e => e.kind === 'file').map(e => e.name))
    return entries.list
      .filter(e => e.kind === 'file' && e.name.toLowerCase().endsWith('.sam'))
      .filter(e => {
        const base = e.name.slice(0, -4)
        return names.has(`${base}.plist`) && names.has(`${base}.png`)
      })
      .map(e => ORIGIN + (path ? `${path}/${e.name}` : e.name))
  }, [entries, path])

  // ปิดตัวเล่นเองเมื่อเปลี่ยนโฟลเดอร์ ไม่งั้นจะค้างเล่นไฟล์ของโฟลเดอร์เดิม
  useEffect(() => { setPlayerOpen(false) }, [path])

  // ล้างธงทุกครั้งที่เปลี่ยนโฟลเดอร์ — ต้องประกาศก่อน effect ข้างล่าง เพราะ React รันตามลำดับ
  //
  // เดิมจำเป็น "พาธที่เคยคืนตำแหน่งไปแล้ว" ซึ่งพังเมื่อเดินเข้าโฟลเดอร์ว่าง:
  // โฟลเดอร์ว่างไม่มีแถวให้ทำงาน effect เลย return ก่อนจะอัปเดตค่าที่จำไว้
  // พอกดย้อนกลับมาที่เดิม ค่าที่ค้างอยู่เลยเท่ากับพาธปัจจุบันพอดี → ถูกมองว่า "ทำไปแล้ว" ทั้งที่ยังไม่ได้ทำ
  useEffect(() => { restored.current = false }, [path])

  // เลื่อนกลับไปหาโฟลเดอร์ที่เพิ่งเปิดไป — ทำครั้งเดียวต่อการเข้าโฟลเดอร์หนึ่งครั้ง
  // เงื่อนไข shown.length > 0 คือหัวใจ: รอจนแถวถูก render จริงก่อน ไม่งั้นจะเลื่อนตอนหน้ายังสั้น
  // แล้วไม่มีผลอะไรเลย (บั๊กเดิมเกิดจากตรงนี้)
  useEffect(() => {
    // entries.path !== path = รายการที่ render อยู่ยังเป็นของโฟลเดอร์เก่า ยังไม่ถึงตา
    if (loading || entries.path !== path || shown.length === 0 || restored.current) return
    restored.current = true

    const name = lastOpened.get(path)
    if (!name) return
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row]')
    const target = rows && Array.from(rows).find(el => el.dataset.row === name)
    if (!target) return   // ถูกกรองออกหรือหายไปจากรายการแล้ว — ปล่อยอยู่บนสุด

    target.scrollIntoView({ block: 'center' })
    setFlash(name)
  }, [path, loading, shown, entries.path])

  // ไฮไลต์แค่แวบเดียวแล้วจางไป
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(t)
  }, [flash])

  if (proLoading) {
    return (
      <div className="text-gray-400 text-sm flex items-center gap-2">
        <span className="material-icons-round text-sm animate-spin">autorenew</span> Loading...
      </div>
    )
  }
  if (!isPro) {
    return (
      <div className="max-w-md mx-auto rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center">
        <span className="material-icons-round text-4xl text-yellow-300">lock</span>
        <p className="text-white font-bold mt-3">{tStat('Pro / Beta only')}</p>
        <p className="text-gray-400 text-sm mt-1">{tStat('This page needs an active Pro or Beta code.')}</p>
        <Link
          href="/beta"
          className="inline-flex items-center gap-1.5 mt-5 h-9 px-4 rounded-lg bg-yellow-400/20 border border-yellow-400 text-yellow-200 text-sm font-bold hover:bg-yellow-400/30 transition-colors"
        >
          <span className="material-icons-round text-base">vpn_key</span>
          {tStat('Enter code')}
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* ── แถวบน: เส้นทาง + ช่องกรอง ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="material-icons-round text-2xl text-yellow-400">folder_open</span>
        <div className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
          <button type="button" onClick={() => go('')}
            className={`px-1.5 py-0.5 rounded hover:bg-white/10 ${path ? 'text-cyan-300' : 'text-white font-bold'}`}>
            res
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <span className="text-gray-600">/</span>
              <button type="button" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}
                className={`px-1.5 py-0.5 rounded hover:bg-white/10 truncate ${
                  i === crumbs.length - 1 ? 'text-white font-bold' : 'text-cyan-300'
                }`}>
                {c}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* ก่อนหน้า / ถัดไป — ข้ามไปโฟลเดอร์พี่น้องโดยไม่ต้องย้อนขึ้นไปเลือกใหม่ */}
          {path && siblings.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              <button
                type="button" onClick={() => jump(-1)} disabled={sibIdx <= 0}
                aria-label="previous folder"
                className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <span className="material-icons-round text-[18px]">chevron_left</span>
              </button>
              <span className="text-[10px] text-gray-500 tabular-nums px-0.5">
                {sibIdx < 0 ? '—' : `${sibIdx + 1}/${siblings.length}`}
              </span>
              <button
                type="button" onClick={() => jump(1)} disabled={sibIdx < 0 || sibIdx >= siblings.length - 1}
                aria-label="next folder"
                className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <span className="material-icons-round text-[18px]">chevron_right</span>
              </button>
            </div>
          )}

          <div className="relative">
            <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-base">search</span>
            <input
              type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder={tStat('Filter in this')}
              className="h-8 w-44 sm:w-60 pl-8 pr-8 rounded-lg bg-slate-900 border border-slate-700 text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
            />
            {filter && (
              <button
                type="button" onClick={() => setFilter('')} aria-label="clear"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"
              >
                <span className="material-icons-round text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── ตารางรายการ ── */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* โฟลเดอร์ไหนมีไฟล์ .sam ครบชุด →
            จอกว้าง: ฝังตัวเล่นไว้ตรงนี้เลย / จอแคบ: เป็นแถบกดเปิดป๊อปอัพเหมือนเดิม
            (ฝังบนมือถือแล้วตัวเล่นจะกินจอจนเลื่อนดูรายการไฟล์ไม่ไหว) */}
        {samUrls.length > 0 && (wide ? (
          <div className="p-2 border-b border-white/10 bg-white/[0.02]">
            <RangerAnimationPopup
              key={`${path}:embed`}
              rangerId={path || 'res'}
              rangerName={path.slice(path.lastIndexOf('/') + 1) || 'res'}
              samFilesOverride={samUrls}
              embedded
              onClose={() => {}}
            />
          </div>
        ) : (
          <button
            type="button" onClick={() => setPlayerOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left"
          >
            <span className="material-icons-round text-[20px] text-emerald-400 shrink-0">play_circle</span>
            <span className="text-sm text-emerald-200 font-bold">{tStat('Play animation')}</span>
            <span className="text-xs text-gray-400 truncate min-w-0">
              {samUrls[0].slice(samUrls[0].lastIndexOf('/') + 1)}
            </span>
            {samUrls.length > 1 && (
              <span className="text-[10px] text-gray-500 shrink-0">+{samUrls.length - 1}</span>
            )}
          </button>
        ))}

        {/* หัวคอลัมน์ = ปุ่มเรียงลำดับ ลูกศรบอกทิศของคอลัมน์ที่กำลังใช้อยู่ */}
        <div className="flex items-center gap-3 px-3 py-2 bg-white/5 text-[11px] text-gray-500 font-bold">
          <span className="w-5 shrink-0" />
          <span className="flex-1 min-w-0">
            <SortHeader label={tStat('Name')} col="name" sort={sort} onClick={toggleSort} />
          </span>
          <span className="w-20 text-right hidden sm:block">{tStat('Size')}</span>
          <span className="w-36 text-right shrink-0 flex justify-end">
            <SortHeader label={tStat('Modified')} col="date" sort={sort} onClick={toggleSort} />
          </span>
        </div>

        {loading ? (
          <div className="px-3 py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <span className="material-icons-round text-sm animate-spin">autorenew</span> Loading...
          </div>
        ) : error ? (
          <div className="px-3 py-10 text-center text-red-400 text-sm">{error}</div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-10 text-center text-gray-500 text-sm">{tStat('No results')}</div>
        ) : (
          <ul ref={listRef}>
            {/* ขึ้นไปข้างบนหนึ่งชั้น — แถวแรกเหมือน file manager ทั่วไป */}
            {path && (
              <li>
                <button type="button" onClick={() => go(crumbs.slice(0, -1).join('/'))}
                  className="w-full flex items-center gap-3 px-3 py-2 border-t border-white/5 hover:bg-white/[0.06] transition-colors text-left">
                  <span className="material-icons-round text-[20px] text-gray-500 shrink-0">drive_folder_upload</span>
                  <span className="flex-1 text-sm text-gray-400">..</span>
                </button>
              </li>
            )}
            {shown.map(e => {
              const full = path ? `${path}/${e.name}` : e.name
              const ext = extOf(e.name)
              return (
                <li key={e.name} data-row={e.name} className="flex items-stretch border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      if (e.kind === 'dir') {
                        // จำไว้ว่าออกจากหน้านี้ไปทางไหน เผื่อกดย้อนกลับมา
                        lastOpened.set(path, e.name)
                        go(full)
                      }
                      else if (ext === 'png') setPreview(full)
                      else window.open(fileUrl(full), '_blank', 'noopener')
                    }}
                    className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2 transition-colors text-left ${
                      flash === e.name ? 'bg-cyan-400/20' : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    {e.kind === 'dir' ? <FolderIcon /> : <FileIcon ext={ext} />}
                    {/* รูปตัวอย่างของ .png — lazy ไว้ ไม่งั้นโฟลเดอร์ที่มีรูปเป็นร้อยจะโหลดพรวดเดียว */}
                    {ext === 'png' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fileUrl(full)} alt=""
                        loading="lazy"
                        className="h-12 w-12 object-contain rounded shrink-0"
                        style={{ background: 'repeating-conic-gradient(#242433 0% 25%, #1b1b28 0% 50%) 50% / 8px 8px' }}
                        onError={ev => { (ev.target as HTMLImageElement).style.visibility = 'hidden' }}
                      />
                    )}
                    <span className="flex-1 min-w-0 text-sm text-gray-100 truncate">{e.name}</span>
                    {e.kind === 'file' && EXT_STYLE[ext] && (
                      <span className={`text-[10px] font-bold ${EXT_STYLE[ext].color} hidden sm:block`}>
                        {EXT_STYLE[ext].label}
                      </span>
                    )}
                    <span className="w-20 text-right text-xs text-gray-500 hidden sm:block">{humanSize(e.size)}</span>
                    <span className="w-36 text-right text-xs text-gray-500 shrink-0">{e.date}</span>
                  </button>
                  {/* เปิดโฟลเดอร์ในแท็บใหม่ — หน้านี้ยังค้างอยู่ที่เดิม ไม่ต้องเลื่อนหาใหม่ */}
                  {e.kind === 'dir' ? (
                    <a
                      href={`/res?p=${encodeURIComponent(full)}`}
                      target="_blank" rel="noopener"
                      title={tStat('Open in new tab')} aria-label={tStat('Open in new tab')}
                      className="w-10 shrink-0 flex items-center justify-center text-gray-500 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors"
                    >
                      <span className="material-icons-round text-[18px]">open_in_new</span>
                    </a>
                  ) : (
                    <span className="w-10 shrink-0" />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-gray-600 mt-2">
        {dirCount} {tStat('folders')} · {fileCount} {tStat('files')}
        {filter && ` · ${tStat('showing')} ${shown.length}`}
      </p>

      {/* ตัวเล่นอนิเมชั่น — ตัวเดียวกับที่ใช้ในหน้าเรนเจอร์ ได้ปุ่มครบชุดมาเลย
          (เฟรม / ตาราง / เลือกพื้นที่ / เซฟ PNG / เซฟวิดีโอ / สลับไฟล์ .sam ในโฟลเดอร์) */}
      {playerOpen && !wide && (
        <RangerAnimationPopup
          rangerId={path || 'res'}
          rangerName={path.slice(path.lastIndexOf('/') + 1) || 'res'}
          samFilesOverride={samUrls}
          onClose={() => setPlayerOpen(false)}
        />
      )}

      {/* ── ดูรูปแบบเต็ม ── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}
        >
          <div className="max-w-full max-h-full flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(preview)} alt={preview}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              style={{ background: 'repeating-conic-gradient(#2a2a3a 0% 25%, #1e1e2c 0% 50%) 50% / 20px 20px' }}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300 truncate max-w-[60vw]">{preview}</span>
              <a href={fileUrl(preview)} target="_blank" rel="noopener noreferrer"
                className="h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1 hover:bg-slate-700">
                <span className="material-icons-round text-[14px]">open_in_new</span>
                {tStat('Open')}
              </a>
              <button type="button" onClick={() => setPreview(null)}
                className="h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs hover:bg-slate-700">
                {tStat('Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function ResPage() {
  const { tStat } = useLanguage()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <span className="text-white/20">|</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gacha/images/LogoKiwi-48.webp" alt="Kiwi" width={50} height={48} className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-white">
            <span className="hidden sm:inline">Line Ranger </span>Kiwi
          </span>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* useSearchParams ต้องอยู่ใน Suspense — ไม่งั้น build จะบังคับให้ทั้งหน้าเป็น dynamic */}
        <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
          <ResBrowser />
        </Suspense>
      </main>
    </div>
  )
}
