'use client'

// ====================================================
// /res — ไล่ดูโฟลเดอร์ของ rangers.lerico.net/res/ ผ่านเว็บเรา
// ทุกคนเข้าได้ (ระบบโค้ด Pro/Beta ถูกตัดทิ้งแล้ว) · ไฟล์โหลดผ่าน Cloudflare Worker
//
// โชว์เฉพาะโฟลเดอร์กับไฟล์ .png / .plist / .sam — กรองใน src/lib/resIndex.ts (loadResDir)
// หน้ารากคำนวณไว้ตอน build (public/data/res/*.json) เพราะต้องเช็คโฟลเดอร์ว่างหลายพันโฟลเดอร์
// พาธเก็บไว้ใน query string (?p=hd/area) ปุ่มย้อนกลับของเบราว์เซอร์จึงใช้ได้ตามปกติ
// ====================================================

import { proxyFile, loadResDir } from '@/lib/staticApi'
import { apiFetch } from '@/lib/staticApi'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePro } from '@/contexts/ProContext'
import RangerAnimationPopup from '@/components/RangerAnimationPopup'
import PlistPieces, { downloadUrl } from './PlistPieces'
import { isLocalRes, localResUrl } from '@/lib/gameRes'
import SiteHeader from '@/components/SiteHeader'

interface DirEntry {
  name: string
  kind: 'dir' | 'file'
  date: string
  size: number | null
}

const ORIGIN = 'https://rangers.lerico.net/res/'
/** hd/... = ไฟล์ของเราเอง (public/gameres) · อื่นๆ = lerico ผ่าน Worker */
const fileUrl = (path: string) =>
  isLocalRes(path) ? localResUrl(path) : proxyFile(ORIGIN + path)

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
      className={`group inline-flex items-center gap-1 h-7 px-2 -mx-2 rounded-md uppercase tracking-wider transition-colors hover:bg-white/5 hover:text-gray-200 ${
        on ? 'text-cyan-300' : ''
      }`}
    >
      {label}
      {/* จองที่ลูกศรไว้เสมอ (กล่อง 16px) ไม่งั้นหัวคอลัมน์จะขยับตอนสลับการเรียง */}
      <span className={`material-icons-round !text-[16px] !leading-none w-4 h-4 flex items-center justify-center ${on ? '' : 'opacity-0 group-hover:opacity-50'}`}>
        {on ? (sort.asc ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
      </span>
    </button>
  )
}

/** ขอรายการของโฟลเดอร์หนึ่ง — ผ่าน cache ระดับ session ก่อนเสมอ */
async function loadDir(path: string, advanced: boolean): Promise<DirEntry[]> {
  const key = cacheKey(path, advanced)
  const hit = dirCache.get(key)
  if (hit) return hit
  const list = await loadResDir(path, advanced)
  dirCache.set(key, list)
  return list
}
/** แคชแยกตามโหมด — โหมดขั้นสูงมีโฟลเดอร์เรนเจอร์เพิ่มเข้ามา */
const cacheKey = (path: string, advanced: boolean) => (advanced ? `+${path}` : path)

/** จำว่าเปิดโหมดขั้นสูงไว้ไหม (ต่อเบราว์เซอร์) */
const ADV_KEY = 'lr:res:advanced'
function readAdvanced(): boolean {
  try { return localStorage.getItem(ADV_KEY) === '1' } catch { return false }
}
function writeAdvanced(on: boolean) {
  try { if (on) localStorage.setItem(ADV_KEY, '1'); else localStorage.removeItem(ADV_KEY) } catch { /* โหมดส่วนตัว ฯลฯ */ }
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
  // โหมดขั้นสูง: โชว์โฟลเดอร์เรนเจอร์ (u…/g…) ที่ปกติซ่อนไว้ · ไฟล์ยังกรองเหมือนเดิม · โฟลเดอร์ที่ไม่มีไฟล์ให้ดูยังซ่อน
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => { setAdvanced(readAdvanced()) }, [])
  const toggleAdvanced = useCallback(() => {
    setAdvanced(a => { writeAdvanced(!a); return !a })
  }, [])
  // รูปที่กดดู — โชว์ทับหน้าจอ (ผ่าน proxy เพราะต้นทางไม่ให้ดึงตรง)
  const [preview, setPreview] = useState<string | null>(null)
  // ชื่อโฟลเดอร์พี่น้องทั้งหมดในโฟลเดอร์แม่ — ใช้ทำปุ่มก่อนหน้า/ถัดไป
  const [siblings, setSiblings] = useState<string[]>([])
  const [playerOpen, setPlayerOpen] = useState(false)
  /** แถว .png ที่กางแผงชิ้นส่วน (จาก .plist คู่กัน) ไว้ */
  const [openPieces, setOpenPieces] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)
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
    const hit = dirCache.get(cacheKey(path, advanced))
    if (hit) { setEntries({ path, list: hit }); setLoading(false); setError(''); return }

    let alive = true
    setLoading(true)
    setError('')
    loadDir(path, advanced)
      .then(list => { if (alive) { setEntries({ path, list }); setLoading(false) } })
      .catch((e: Error) => { if (alive) { setError(e.message || 'Fetch failed'); setLoading(false) } })
    return () => { alive = false }
  }, [path, isPro, proLoading, advanced])

  // ── โฟลเดอร์พี่น้อง — ขอจากโฟลเดอร์แม่ (โดนแคชอยู่แล้วถ้าเพิ่งเดินลงมา) ──
  useEffect(() => {
    if (proLoading || !isPro || !path) { setSiblings([]); return }
    const parent = path.split('/').slice(0, -1).join('/')
    let alive = true
    loadDir(parent, advanced)
      .then(list => { if (alive) setSiblings(list.filter(e => e.kind === 'dir').map(e => e.name)) })
      .catch(() => { if (alive) setSiblings([]) })
    return () => { alive = false }
  }, [path, isPro, proLoading, advanced])

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

  // ชื่อไฟล์ทั้งหมดในโฟลเดอร์ (รวม .plist ที่ซ่อนไว้) — ใช้เช็คว่า .png ตัวไหนมี .plist คู่กัน
  const fileNames = useMemo(() => new Set(entries.list.filter(e => e.kind === 'file').map(e => e.name)), [entries])
  // เปลี่ยนโฟลเดอร์ → หุบแผงชิ้นส่วนทั้งหมด
  useEffect(() => { setOpenPieces(new Set()) }, [path])
  const togglePieces = (name: string) => setOpenPieces(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const download = async (full: string, name: string) => {
    setDownloading(name)
    try { await downloadUrl(fileUrl(full), name) } catch { window.open(fileUrl(full), '_blank', 'noopener') } finally { setDownloading(null) }
  }

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

  // ไฟล์ .sam ทุกตัวในโฟลเดอร์ที่มี atlas (.plist + .png) คู่ครบ — ขาดไฟล์ไหนก็เล่นไม่ได้
  // atlas ชื่อเดียวกับ .sam (x.sam → x.plist + x.png) หรือมีป้ายต่อท้ายชื่อ (x.sam → x.16.plist + x.16.png
  // เช่นด่าน new_ar14 — เกมเก็บ atlas สี 16 บิตไว้ชื่อนี้) → ส่งชื่อ atlas จริงให้ตัวเล่นทาง samAtlas
  // ส่งเป็น URL เต็มให้ตัวเล่น เพราะมันคาดหวังรูปแบบเดียวกับที่ API list คืนมา
  const { samUrls, samAtlas } = useMemo(() => {
    const names = new Set(entries.list.filter(e => e.kind === 'file').map(e => e.name))
    const toUrl = (name: string) => { const p = path ? `${path}/${name}` : name; return isLocalRes(p) ? localResUrl(p) : ORIGIN + p }
    const atlasOf = (base: string): string | null => {
      if (names.has(`${base}.plist`) && names.has(`${base}.png`)) return base
      for (const n of names) {
        if (!n.startsWith(`${base}.`)) continue
        const m = n.slice(base.length).match(/^(\.[^.]+)\.plist$/i)
        if (m && names.has(`${base}${m[1]}.png`)) return `${base}${m[1]}`
      }
      return null
    }
    const urls: string[] = []
    const atlas: Record<string, string> = {}
    for (const e of entries.list) {
      if (e.kind !== 'file' || !e.name.toLowerCase().endsWith('.sam')) continue
      const base = e.name.slice(0, -4)
      const a = atlasOf(base)
      if (!a) continue
      const url = toUrl(e.name)
      urls.push(url)
      if (a !== base) atlas[url] = toUrl(a)
    }
    return { samUrls: urls, samAtlas: atlas }
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
      {/* ── แถวบน: เส้นทาง + ช่องกรอง ── ล็อกติดใต้หัวเว็บตอนเลื่อนลง (กดย้อน/ค้นหาได้ตลอด)
          มือถือ: เส้นทางบรรทัดหนึ่ง / ปุ่มก่อน-ถัดไป + ขั้นสูง + ช่องกรองอีกบรรทัด · จอกว้าง: บรรทัดเดียว */}
      <div className="sticky top-[49px] z-30 -mx-4 px-4 py-2 mb-3 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-start sm:items-center gap-2 min-w-0">
        {/* ในโฟลเดอร์ย่อย: ปุ่มย้อนขึ้นหนึ่งชั้น · หน้าราก: ไอคอนโฟลเดอร์ */}
        {path ? (
          <button
            type="button" onClick={() => go(crumbs.slice(0, -1).join('/'))}
            aria-label={tStat('Up one folder')} title={tStat('Up one folder')}
            className="shrink-0 h-8 w-8 -my-0.5 rounded-lg flex items-center justify-center text-yellow-400 hover:bg-white/10"
          >
            <span className="material-icons-round text-[22px]">arrow_back</span>
          </button>
        ) : (
          <span className="material-icons-round text-2xl text-yellow-400 shrink-0">folder_open</span>
        )}
        <div className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
          <button type="button" onClick={() => go('')}
            className={`px-1.5 py-0.5 rounded hover:bg-white/10 ${path ? 'text-cyan-300' : 'text-white font-bold'}`}>
            res
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <span className="text-gray-600">/</span>
              <button type="button" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}
                className={`px-1.5 py-0.5 rounded hover:bg-white/10 break-all text-left ${
                  i === crumbs.length - 1 ? 'text-white font-bold' : 'text-cyan-300'
                }`}>
                {c}
              </button>
            </span>
          ))}
        </div>
        </div>

        <div className="flex items-center gap-1.5 sm:ml-auto w-full sm:w-auto">
          {/* ก่อนหน้า / ถัดไป — ข้ามไปโฟลเดอร์พี่น้องโดยไม่ต้องย้อนขึ้นไปเลือกใหม่ */}
          {path && siblings.length > 1 && (
            <div className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              <button
                type="button" onClick={() => jump(-1)} disabled={sibIdx <= 0}
                aria-label="previous folder"
                className="h-8 w-8 sm:h-7 sm:w-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <span className="material-icons-round text-[18px]">chevron_left</span>
              </button>
              <span className="text-[10px] text-gray-500 tabular-nums px-0.5">
                {sibIdx < 0 ? '—' : `${sibIdx + 1}/${siblings.length}`}
              </span>
              <button
                type="button" onClick={() => jump(1)} disabled={sibIdx < 0 || sibIdx >= siblings.length - 1}
                aria-label="next folder"
                className="h-8 w-8 sm:h-7 sm:w-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <span className="material-icons-round text-[18px]">chevron_right</span>
              </button>
            </div>
          )}

          {/* ขั้นสูง: โชว์โฟลเดอร์ทั้งหมด รวมโฟลเดอร์เรนเจอร์ที่ปกติซ่อนไว้
              มีเฉพาะหน้าราก /res — ในโฟลเดอร์ย่อยไม่มีปุ่ม (ค่าที่เปิดไว้ยังมีผลกับปุ่มก่อน/ถัดไป) */}
          {!path && <button
            type="button" onClick={toggleAdvanced} aria-pressed={advanced}
            title={tStat('Show all folders (incl. ranger folders)')} aria-label={tStat('Advanced')}
            className={`shrink-0 h-9 sm:h-8 w-9 sm:w-auto sm:px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
              advanced
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700 bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            <span className="material-icons-round text-[18px] sm:text-[16px]">{advanced ? 'folder_special' : 'tune'}</span>
            {/* มือถือเหลือแต่ไอคอน — ไม่งั้นช่องค้นหาแคบจนพิมพ์ไม่ได้ */}
            <span className="hidden sm:inline">{tStat('Advanced')}</span>
          </button>}

          <div className="relative flex-1 sm:flex-none min-w-[120px]">
            <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-base">search</span>
            <input
              type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder={tStat('Filter in this')}
              className="h-9 sm:h-8 w-full sm:w-60 pl-8 pr-8 rounded-lg bg-slate-900 border border-slate-700 text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
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
              samAtlasOverride={samAtlas}
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
        <div className="flex items-center gap-3 pl-3 pr-3 sm:pr-0 py-1 bg-white/[0.04] border-b border-white/10 text-[11px] text-gray-400 font-bold">
          <span className="w-5 shrink-0 hidden sm:block" />
          <span className="flex-1 min-w-0">
            <SortHeader label={tStat('Name')} col="name" sort={sort} onClick={toggleSort} />
          </span>
          <span className="w-20 text-right hidden sm:block uppercase tracking-wider">{tStat('Size')}</span>
          <span className="sm:w-36 text-right shrink-0 flex justify-end">
            <SortHeader label={tStat('Modified')} col="date" sort={sort} onClick={toggleSort} />
          </span>
          {/* ตรงกับคอลัมน์ปุ่มด้านขวาของแต่ละแถว (เฉพาะจอกว้าง) */}
          <span className="hidden sm:block w-40 shrink-0" />
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
              const base = e.name.replace(/\.[^.]+$/, '')
              // .png ที่มี .plist ชื่อเดียวกัน = spritesheet → แตกเป็นชิ้นๆ ให้โหลดทีละชิ้นได้
              const plistName = ext === 'png' && fileNames.has(`${base}.plist`) ? `${base}.plist` : null
              const piecesOpen = openPieces.has(e.name)
              return (
                <li key={e.name} data-row={e.name} className="border-t border-white/5">
                  <div className="flex items-stretch">
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
                    className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 sm:py-2 transition-colors text-left ${
                      flash === e.name ? 'bg-cyan-400/20' : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* ไอคอนชนิดไฟล์ — มือถือไม่ต้องโชว์ถ้ามีรูปตัวอย่างอยู่แล้ว (ประหยัดที่ให้ชื่อไฟล์) */}
                    {e.kind === 'dir' ? <FolderIcon /> : <span className={ext === 'png' ? 'hidden sm:block' : ''}><FileIcon ext={ext} /></span>}
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
                    {/* ชื่อ: มือถือขึ้นได้ 2 บรรทัด + บรรทัดรายละเอียด (ชนิด · ขนาด · วันที่) · จอกว้าง: บรรทัดเดียว มีคอลัมน์แยก */}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-100 break-all line-clamp-2 sm:line-clamp-1 sm:break-normal sm:truncate">{e.name}</span>
                      <span className="sm:hidden block text-[11px] text-gray-500 mt-0.5 truncate">
                        {e.kind === 'file' && EXT_STYLE[ext] && <span className={`${EXT_STYLE[ext].color} font-bold`}>{EXT_STYLE[ext].label} · </span>}
                        {e.kind === 'file' && e.size != null && `${humanSize(e.size)} · `}
                        {e.date}
                      </span>
                    </span>
                    {e.kind === 'file' && EXT_STYLE[ext] && (
                      <span className={`text-[10px] font-bold ${EXT_STYLE[ext].color} hidden sm:block`}>
                        {EXT_STYLE[ext].label}
                      </span>
                    )}
                    <span className="w-20 text-right text-xs text-gray-500 hidden sm:block">{humanSize(e.size)}</span>
                    <span className="w-36 text-right text-xs text-gray-500 shrink-0 hidden sm:block">{e.date}</span>
                  </button>
                  {/* เปิดโฟลเดอร์ในแท็บใหม่ — หน้านี้ยังค้างอยู่ที่เดิม ไม่ต้องเลื่อนหาใหม่ */}
                  <div className="shrink-0 flex items-stretch justify-end sm:w-40">
                  {e.kind === 'dir' ? (
                    <a
                      href={`/res?p=${encodeURIComponent(full)}`}
                      target="_blank" rel="noopener"
                      title={tStat('Open in new tab')} aria-label={tStat('Open in new tab')}
                      className="w-10 shrink-0 flex items-center justify-center text-gray-500 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors"
                    >
                      <span className="material-icons-round text-[18px]">open_in_new</span>
                    </a>
                  ) : ext === 'png' ? (
                    <>
                      {plistName && (
                        <button
                          type="button" onClick={() => togglePieces(e.name)}
                          aria-expanded={piecesOpen}
                          title={tStat('Show pieces (from .plist)')}
                          className={`shrink-0 w-11 sm:w-auto sm:px-3 flex items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                            piecesOpen ? 'text-amber-300 bg-amber-400/10' : 'text-gray-400 hover:text-amber-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="material-icons-round text-[18px]">grid_view</span>
                          <span className="hidden sm:inline">{tStat('Pieces')}</span>
                          <span className="hidden sm:inline-flex"><span className={`material-icons-round text-[18px] transition-transform ${piecesOpen ? 'rotate-180' : ''}`}>expand_more</span></span>
                        </button>
                      )}
                      <button
                        type="button" onClick={() => download(full, e.name)}
                        title={tStat('Download')} aria-label={tStat('Download')}
                        className="w-11 sm:w-10 shrink-0 flex items-center justify-center text-gray-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors"
                      >
                        <span className={`material-icons-round text-[20px] ${downloading === e.name ? 'animate-pulse' : ''}`}>download</span>
                      </button>
                    </>
                  ) : (
                    <span className="w-10 shrink-0" />
                  )}
                  </div>
                  </div>
                  {plistName && piecesOpen && (
                    <div className="bg-black/20 border-t border-white/5">
                      <PlistPieces pngUrl={fileUrl(full)} plistUrl={fileUrl(path ? `${path}/${plistName}` : plistName)} baseName={base} />
                    </div>
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
              samAtlasOverride={samAtlas}
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
      <SiteHeader materialIcon="folder_open" title="Resources" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* useSearchParams ต้องอยู่ใน Suspense — ไม่งั้น build จะบังคับให้ทั้งหน้าเป็น dynamic */}
        <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
          <ResBrowser />
        </Suspense>
      </main>
    </div>
  )
}
