'use client'

// ====================================================
// /infinity-tower — หอคอยอนันต์ (โหมด endless ของเกม) ทุกชั้น จากข้อมูลเกมของเรา
//   ข้อมูล: /api/infinity-tower (ทุกชั้น) + /api/infinity-tower/<floor> (ศัตรูรายชั้น — โหลดตอนกางชั้น)
//   ที่มา/กติกาของข้อมูล: src/lib/infinityTower.ts
//   ประตูชั้น = อนิเมชันเกม endless_main_effect/endless_maintop_* (TowerGate.tsx)
//   ไอคอน = ชิ้นจาก atlas ของเกม (atlas.tsx) — ไม่ใช้ไอคอนทั่วไปแทนของเกม
//
// ออกแบบมือถือก่อน: ค่าเริ่มของ class = จอมือถือ · sm:/lg: = จอใหญ่ขึ้น
// ยังไม่มีปุ่มพามาหน้านี้ (กำลังทำ) — ไม่อยู่ใน sitemap และบอก Google ไม่ให้เก็บ
// ?f=300 → เปิดแล้วเลื่อนไปชั้น 300 และกางรายละเอียดให้เลย
// ====================================================

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch } from '@/lib/staticApi'
import type { TBattle, TEnemy, TFloor, TIcon, TowerIndex, TText, TReward } from '@/lib/infinityTower'
import { GameIcon, useIconUrl } from './atlas'
import TowerEnemyPopup from './TowerEnemyPopup'
import { EnemySkeleton, TowerLoader } from './TowerLoading'

// canvas + โหลดไฟล์ .sam → ฝั่ง browser เท่านั้น
const TowerGate = dynamic(() => import('./TowerGate'), { ssr: false })

type L = 'en' | 'th'
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const tx = (t: TText | undefined, lang: L) => (t ? t[lang] || t.en : '')
const fillD = (s: string, v: number | null) => (v == null ? s : s.replace('%d', fmt(v)))
/** ชื่อชั้นของเกมแบบสั้น — ตัดวงเล็บท้ายชื่อ เช่น "(Time Attack)" / "(จำกัดเวลา)" ออก (ไอคอนด่านบอกอยู่แล้ว) */
const floorName = (t: TText | undefined, lang: L) => tx(t, lang).replace(/\s*[(（][^)）]*[)）]\s*/g, ' ').trim()

// ── ไอคอนของเกม ──
const IC: Record<string, TIcon> = {
  feather: { atlas: 'popup', frame: 'pop_gift_icon_03.png' },
  coin: { atlas: 'popup', frame: 'pop_gift_icon_02.png' },
  exp: { atlas: 'popup', frame: 'pop_gift_icon_09.png' },
  timer: { atlas: 'main', frame: 'endless_main_timer.png' },
  sally: { atlas: 'ui', frame: 'endless_battle_top_profile_sally.png' },
  boss: { atlas: 'ui', frame: 'endless_battle_track_boss_icon.png' },
  base: { atlas: 'ui', frame: 'endless_battle_top_tower_img.png' },
  mission: { atlas: 'main', frame: 'endless_battle_icon_mission.png' },
  star: { atlas: 'main', frame: 'endless_main_tower_star_on.png' },
  trophy: { atlas: 'main', frame: 'endless_reward_icon_trophy.png' },
  sallyCaught: { atlas: 'endlesspopup', frame: 'endless_sally_img01.png' },
  sallyFree: { atlas: 'endlesspopup', frame: 'endless_sally_img02.png' },
}

/** สีตามประเภทด่าน */
const TONE: Record<TBattle, { chip: string; ring: string }> = {
  OFFENCE: { chip: 'bg-sky-500/15 border-sky-400/40 text-sky-200', ring: 'border-sky-400/25' },
  TIMEATTACK: { chip: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200', ring: 'border-emerald-400/25' },
  SIEGE: { chip: 'bg-amber-500/15 border-amber-400/40 text-amber-200', ring: 'border-amber-400/25' },
  BOSS: { chip: 'bg-rose-500/15 border-rose-400/50 text-rose-200', ring: 'border-rose-400/35' },
}
const ELEMENT_ICON: Record<string, string> = { fire: 'fire', water: 'water', tree: 'wood', wood: 'wood', light: 'light', dark: 'dark' }
const TYPE_ICON: Record<string, string> = { STR: '/gacha/images/Str.png', AGI: '/gacha/images/Agi.png', INT: '/gacha/images/Int.png' }
const thumbOf = (code: string): TIcon => ({ url: `https://rangers.lerico.net/res/${code}/${code}-thum.png` })

type Tfn = (th: string, en: string) => string

export default function InfinityTowerPage() {
  const { lang: siteLang, tStat } = useLanguage()
  const lang = siteLang as L
  // ค่าคงที่ระหว่าง render (เปลี่ยนตามภาษาเท่านั้น) — FloorCard เป็น memo ไม่ต้อง render ใหม่ทั้ง 330 ใบ
  const T: Tfn = useCallback((th, en) => (lang === 'th' ? th : en), [lang])

  const [data, setData] = useState<TowerIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<TBattle | 'ALL'>('ALL')
  const [desc, setDesc] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [jump, setJump] = useState('')
  const [jumpOpen, setJumpOpen] = useState(false)
  const [enemy, setEnemy] = useState<TEnemy | null>(null)

  useEffect(() => {
    apiFetch('/api/infinity-tower').then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: TowerIndex) => setData(d)).catch(() => setFailed(true))
  }, [])

  // ไม่ให้ Google เก็บหน้านี้ระหว่างที่ยังทำไม่เสร็จ (static export ตั้ง metadata ในหน้า client ไม่ได้)
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex'
    document.head.appendChild(m)
    return () => { m.remove() }
  }, [])

  const headerRef = useRef<HTMLElement>(null)
  /** ชั้นที่รอเลื่อนไปหา หลัง render รอบหน้า (goTo / เปิดชั้น) */
  const pendingAlign = useRef<{ code: string; smooth: boolean } | null>(null)
  const alignStop = useRef<(() => void) | null>(null)
  /**
   * เลื่อนให้ขอบบนการ์ดชั้นนั้นอยู่ใต้แถบเมนูพอดี (ไม่โดนบัง)
   * ระยะ = ขอบล่างจริงของแถบเมนู (มือถือแถบเดียว · คอมมีแถวตัวกรองด้วย) + 8px
   * หลังเลื่อน: ชั้นเดิมที่หุบลง / รูปที่โหลดตามมา ทำให้หน้าขยับ → คอยปรับซ้ำ ~1.8 วิ
   * ผู้ใช้เลื่อนเอง (ล้อเมาส์/แตะ/ปุ่ม) = หยุดปรับทันที · ระยะไกลมาก = กระโดดทันที (ไม่ smooth ยาวๆ)
   */
  const alignFloor = useCallback((code: string, smooth = true) => {
    alignStop.current?.()
    const el = document.getElementById(code)
    if (!el) return
    const target = () => {
      const bar = headerRef.current?.getBoundingClientRect().bottom ?? 0
      return Math.max(0, el.getBoundingClientRect().top + window.scrollY - bar - 8)
    }
    const far = Math.abs(target() - window.scrollY) > window.innerHeight * 2.5
    window.scrollTo({ top: target(), behavior: smooth && !far ? 'smooth' : 'auto' })
    let done = false
    const stop = () => {
      done = true
      removeEventListener('wheel', stop); removeEventListener('touchstart', stop); removeEventListener('keydown', stop)
      if (alignStop.current === stop) alignStop.current = null
    }
    alignStop.current = stop
    addEventListener('wheel', stop, { passive: true }); addEventListener('touchstart', stop, { passive: true }); addEventListener('keydown', stop)
    const t0 = performance.now()
    const tick = () => {
      if (done) return
      const t = performance.now() - t0
      if (t > 1800) { stop(); return }
      // ระหว่าง smooth scroll ปล่อยให้เลื่อนไปก่อน แล้วค่อยแก้ส่วนที่คลาด
      if (t > (smooth && !far ? 650 : 0)) {
        const want = target()
        if (Math.abs(want - window.scrollY) > 2) window.scrollTo({ top: want, behavior: 'auto' })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])

  const goTo = (no: number, smooth = true) => {
    if (!data) return
    const f = data.floors.find(x => x.no === no)
    if (!f) return
    setJumpOpen(false)
    setJump('')
    setFilter('ALL')
    setOpen(new Set([f.code]))
    // เลื่อนทันทีหลัง React วาดรายการ (ตัวกรอง 'ทั้งหมด') + การ์ดที่กางเสร็จ — ดู useLayoutEffect ด้านล่าง
    pendingAlign.current = { code: f.code, smooth }
    const url = new URL(location.href)
    url.searchParams.set('f', String(no))
    history.replaceState(null, '', url)
  }
  const first = useRef(true)
  useEffect(() => {
    if (!data || !first.current) return
    first.current = false
    const f = Number(new URL(location.href).searchParams.get('f'))
    if (f) goTo(f, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const floors = useMemo(() => {
    if (!data) return []
    const list = filter === 'ALL' ? data.floors : data.floors.filter(f => f.battle === filter)
    return desc ? [...list].reverse() : list
  }, [data, filter, desc])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of data?.floors ?? []) c[f.battle] = (c[f.battle] ?? 0) + 1
    return c
  }, [data])

  // เปิดได้ทีละชั้น — เปิดชั้นใหม่ = ปิดชั้นเดิม แล้วเลื่อนชั้นที่เปิดมาไว้ใต้แถบเมนู
  const openRef = useRef(open)
  openRef.current = open
  const toggle = useCallback((code: string) => {
    const opening = !openRef.current.has(code)
    setOpen(opening ? new Set([code]) : new Set())
    if (opening) pendingAlign.current = { code, smooth: true }
  }, [])

  // หลัง DOM อัปเดต (ก่อนจอวาด) — เลื่อนไปชั้นที่รอไว้ ไม่ต้องรอเฟรมอนิเมชัน (เครื่องช้า/แท็บที่ถูกหน่วงก็ไม่ค้าง)
  useLayoutEffect(() => {
    const p = pendingAlign.current
    if (!p) return
    pendingAlign.current = null
    alignFloor(p.code, p.smooth)
  }, [open, filter, alignFloor])


  const towerName = T('หอคอยอนันต์', 'Infinity Tower')
  /** ชื่อสั้นสำหรับแถบล่างมือถือ — ชื่อทางการของเกมตัดคำว่า "สเตจ/Stage" ออก */
  const shortLabel = (b: TBattle) => data ? tx(data.battles[b].title, lang).replace(/สเตจ|\s*Stage\s*/g, '').trim() : ''
  const pickFilter = (v: TBattle | 'ALL') => { setFilter(v); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const titleLogo: TIcon = { atlas: 'main16', frame: `ml_endless_main_title_${lang === 'th' ? 'th' : 'en'}.png` }

  return (
    <div className="min-h-screen pb-[calc(96px+env(safe-area-inset-bottom))] sm:pb-16 bg-[radial-gradient(120%_60%_at_50%_0%,#2a0d4d_0%,#12061f_55%,#0b0414_100%)]">
      <header ref={headerRef} className="sticky top-0 z-40 bg-[#14071f]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors" aria-label={tStat('Back')}>
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <GameIcon icon={titleLogo} className="h-8 w-[132px] justify-start" alt={towerName} />
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>

        {/* แถบเมนูคอม/แท็บเล็ต — มือถือใช้แถบล่าง MobileBar แทน */}
        {data && (
          <div className="hidden sm:flex max-w-6xl mx-auto px-4 pb-2.5 items-center gap-3">
            {/* ประเภทด่าน (แท็บแบบกลุ่ม) */}
            <div role="tablist" aria-label={T('ประเภทด่าน', 'Stage types')}
              className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl bg-black/35 p-1 ring-1 ring-white/10">
              <BarTab on={filter === 'ALL'} onClick={() => pickFilter('ALL')} icon={IC.star} label={T('ทั้งหมด', 'All')} n={data.floors.length} />
              {(Object.keys(data.battles) as TBattle[]).map(b => (
                <BarTab key={b} on={filter === b} onClick={() => pickFilter(b)} icon={data.battles[b].icon}
                  label={shortLabel(b)} n={counts[b] ?? 0} badge={b === 'TIMEATTACK' ? IC.timer : undefined} />
              ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button onClick={() => setDesc(v => !v)} title={desc ? T('บนลงล่าง', 'Top down') : T('ล่างขึ้นบน', 'Bottom up')}
                aria-label={T('สลับลำดับชั้น', 'Reverse floor order')}
                className="flex items-center gap-1.5 h-10 rounded-xl bg-black/35 px-3 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10 hover:text-white transition-colors">
                <span className="material-icons-round text-[18px]">{desc ? 'south' : 'north'}</span>
                <span className="hidden lg:inline whitespace-nowrap">{desc ? T('บนลงล่าง', 'Top down') : T('ล่างขึ้นบน', 'Bottom up')}</span>
              </button>
              <DesktopJump T={T} max={data.floors.length} value={jump} onChange={setJump} onGo={n => goTo(n)} />
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 pt-3 sm:pt-5">
        {/* ── เรื่องราวของโหมด (ข้อความเกม) ── */}
        <section className="relative overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-[#33125a] via-[#1f0b3a] to-[#120620] p-4 sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-fuchsia-600/25 blur-3xl" />
          <div className="relative flex items-center gap-3 sm:gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="sr-only">{towerName}</h1>
              <GameIcon icon={titleLogo} className="h-12 sm:h-16 w-full max-w-[300px] justify-start" alt="" />
              {data && (
                <p className="mt-1.5 text-[13px] sm:text-[15px] leading-relaxed text-fuchsia-100/80">
                  {tx(data.ui.INFINITY_TOWER_STORY_01, lang)} {tx(data.ui.INFINITY_TOWER_STORY_02, lang)}
                </p>
              )}
            </div>
            <GameIcon icon={IC.sallyCaught} className="w-20 h-24 sm:w-32 sm:h-36 -my-2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]" />
          </div>
        </section>

        {failed && <p className="mt-10 text-center text-rose-300">{T('โหลดข้อมูลหอคอยไม่ได้', 'Could not load the tower data')}</p>}
        {!data && !failed && <TowerLoader text={T('กำลังเปิดประตูหอคอย', 'Opening the tower gate')} />}

        {data && (
          <ol className="mt-3 space-y-2.5 sm:space-y-3">
            {floors.map(f => (
              <FloorCard key={f.code} f={f} data={data} lang={lang} T={T} open={open.has(f.code)} onToggle={toggle} onEnemy={setEnemy} />
            ))}
          </ol>
        )}
      </main>

      {data && (
        <MobileBar data={data} T={T} filter={filter} counts={counts} shortLabel={shortLabel}
          onFilter={pickFilter} onJump={() => setJumpOpen(true)} />
      )}
      {jumpOpen && data && (
        <JumpSheet T={T} max={data.floors.length} value={jump} onChange={setJump} desc={desc} onDesc={setDesc}
          onGo={n => goTo(n)} onTop={() => { setJumpOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onClose={() => setJumpOpen(false)} />
      )}
      {enemy && data && (
        <TowerEnemyPopup enemy={enemy} name={tx(enemy.name, lang)} bossLabel={tx(data.ui.ENDLESS_TIP_BOSS_ICON, lang)} T={T} onClose={() => setEnemy(null)} />
      )}
    </div>
  )
}

/** แท็บประเภทด่านของแถบเมนูคอม */
function BarTab({ on, onClick, icon, label, n, badge }: { on: boolean; onClick: () => void; icon: TIcon; label: string; n: number; badge?: TIcon }) {
  return (
    <button role="tab" aria-selected={on} onClick={onClick}
      className={`relative shrink-0 flex items-center gap-2 h-10 rounded-xl pl-1.5 pr-3 text-sm whitespace-nowrap transition-all ${on
        ? 'bg-gradient-to-b from-fuchsia-500/45 to-purple-700/35 text-white ring-1 ring-fuchsia-300/40 shadow-[0_4px_14px_rgba(168,85,247,0.35)]'
        : 'text-gray-300 hover:bg-white/[0.07] hover:text-white'}`}>
      <span className="relative flex items-center justify-center w-8 h-8">
        <GameIcon icon={icon} size={28} />
        {badge && <span className="absolute -right-1 -top-1"><GameIcon icon={badge} size={14} /></span>}
      </span>
      <span className="font-semibold">{label}</span>
      <span className={`rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'}`}>{n}</span>
    </button>
  )
}

/** ไปชั้น (คอม): ช่องพิมพ์เลขชั้น + ปุ่มไป + เมนูลัด (ชั้น 1/50/…/330 · กลับบนสุด) */
function DesktopJump({ T, max, value, onChange, onGo }: {
  T: Tfn; max: number; value: string; onChange: (v: string) => void; onGo: (n: number) => void
}) {
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const off = (ev: MouseEvent) => { if (box.current && !box.current.contains(ev.target as Node)) setMenu(false) }
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(false) }
    addEventListener('mousedown', off); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', off); removeEventListener('keydown', esc) }
  }, [menu])
  const n = parseInt(value, 10)
  const ok = n >= 1 && n <= max
  const go = (x: number) => { setMenu(false); onGo(x) }
  return (
    <div ref={box} className="relative">
      <form onSubmit={e => { e.preventDefault(); if (ok) go(n) }}
        className="flex items-center h-10 rounded-xl bg-black/35 ring-1 ring-white/10 focus-within:ring-fuchsia-400/60 transition-shadow">
        <span className="pl-1.5"><GameIcon icon={IC.base} size={26} /></span>
        <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" enterKeyHint="go"
          onFocus={() => setMenu(true)} placeholder={T(`ไปชั้น 1–${max}`, `Go to floor 1–${max}`)} aria-label={T('ไปชั้น', 'Go to floor')}
          className="w-32 lg:w-36 bg-transparent px-2 text-sm text-white placeholder:text-gray-500 focus:outline-none" />
        <button type="submit" disabled={!ok}
          className="h-8 mr-1 rounded-lg bg-fuchsia-500 px-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-fuchsia-400 transition-colors">{T('ไป', 'Go')}</button>
        <button type="button" onClick={() => setMenu(v => !v)} aria-expanded={menu} aria-label={T('ชั้นลัด', 'Quick floors')}
          className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-gray-300 hover:bg-white/10">
          <span className={`material-icons-round text-[20px] transition-transform ${menu ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
      </form>
      {menu && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-fuchsia-400/25 bg-[#1b1030] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200/80">{T('ชั้นลัด', 'Quick floors')}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 50, 100, 150, 200, 250, 300, max].map(q => (
              <button key={q} onClick={() => go(q)} className="h-9 rounded-lg bg-white/5 text-sm text-gray-100 ring-1 ring-white/10 hover:bg-fuchsia-500/25 hover:text-white">
                {q}
              </button>
            ))}
          </div>
          <button onClick={() => { setMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="mt-2 w-full h-9 rounded-lg text-sm text-gray-300 hover:bg-white/10 flex items-center justify-center gap-1">
            <span className="material-icons-round text-[18px]">vertical_align_top</span>{T('กลับบนสุด', 'Back to top')}
          </button>
        </div>
      )}
    </div>
  )
}

/** ประตูชั้น (อนิเมชันเกม เปิดค้าง) + เลขชั้นตัวเลขของเกมกลางพอร์ทัล (endless_main_tower_num_0N) */
function Gate({ f }: { f: TFloor }) {
  return (
    <div className="relative aspect-[328/197] w-full">
      <TowerGate battle={f.battle} />
      {/* กลางพอร์ทัล · สูง ~28% ของกรอบประตู (แบบหน้าหอคอยในเกม) — ตั้งด้วย style ตรงๆ ให้คำนวณจากกรอบเสมอ */}
      <span className="absolute flex items-center justify-center" aria-label={String(f.no)}
        style={{ left: '50%', top: '50%', height: '21%', transform: 'translate(-50%, -50%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
        {String(f.no).split('').map((d, i) => <Digit key={i} d={d} />)}
      </span>
    </div>
  )
}

function Digit({ d }: { d: string }) {
  const url = useIconUrl({ atlas: 'main16', frame: `endless_main_tower_num_0${d}.png` })
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} style={{ height: '100%', width: 'auto', maxWidth: 'none', margin: '0 -0.5px' }} /> : null
}

function Amount({ r, data }: { r: TReward; data: TowerIndex }) {
  const it = data.items[r.item]
  return <>{it?.type === 'COIN' ? fmt(r.amount) : `×${fmt(r.amount)}`}</>
}

const FloorCard = memo(function FloorCard({ f, data, lang, T, open, onToggle, onEnemy }: {
  f: TFloor; data: TowerIndex; lang: L; T: Tfn; open: boolean; onToggle: (code: string) => void; onEnemy: (e: TEnemy) => void
}) {
  const b = data.battles[f.battle]
  const clear = f.reward.item ? data.items[f.reward.item.item] : null
  return (
    <li id={f.code}>
      <article className={`rounded-2xl border bg-[#181026]/95 overflow-hidden transition-colors ${open ? 'border-fuchsia-400/45 shadow-[0_0_0_1px_rgba(217,70,239,0.15),0_10px_30px_rgba(0,0,0,0.35)]' : TONE[f.battle].ring}`}>
        <button onClick={() => onToggle(f.code)} aria-expanded={open} className="block w-full text-left active:bg-white/[0.03] sm:hover:bg-white/[0.02]">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,176px))]">
            {/* ── ส่วนหัว: ประตู + ประเภทด่าน + รางวัลผ่านชั้น ── */}
            <div className="flex gap-3 p-3">
              <div className="w-[112px] sm:w-[150px] shrink-0 self-start">
                <Gate f={f} />
                {/* ประเภทด่าน: ไอคอนชัยชนะของเกม (endless_battle_victory_icon_*) + ชื่อชั้น */}
                <div className={`mt-1.5 flex items-center gap-1.5 rounded-xl border px-1.5 py-1 ${TONE[f.battle].chip}`}>
                  <span className="relative shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-black/35 ring-1 ring-white/10">
                    <GameIcon icon={b.icon} className="w-8 h-8 sm:w-9 sm:h-9 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" alt="" />
                  </span>
                  <span className="min-w-0 text-[11px] sm:text-[12px] font-semibold leading-tight">{floorName(data.names[f.name], lang)}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 flex flex-col">
                <div className="flex items-start gap-1.5">
                  <p className="flex-1 font-[family-name:var(--font-line)] text-[15px] sm:text-[17px] leading-snug text-white">{tx(b.desc, lang)}</p>
                  <span className={`material-icons-round shrink-0 text-gray-500 text-xl transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
                </div>

                {/* ข้อมูลย่อ (ไอคอนเกม) — จอใหญ่: ชิดล่างให้เต็มความสูงการ์ด */}
                <div className="mt-2 lg:mt-auto lg:pt-1.5 flex flex-wrap items-center gap-1.5">
                  <Meta icon={IC.feather} label={T('ใช้ขนนก', 'Feathers')}>×{f.needHeart}</Meta>
                  {f.timeLimit != null && <Meta icon={IC.timer} label={T('เวลาจำกัด', 'Time limit')}>{f.timeLimit}{T(' วิ', 's')}</Meta>}
                  {f.saveCount != null && <Meta icon={IC.sally} label={T('ชาวเมืองที่ต้องช่วย', 'Citizens to rescue')}>{f.saveCount}</Meta>}
                  {f.boss && <Meta icon={IC.boss} label={T('บอส', 'Boss')} tone="text-rose-200">{tx(f.boss.name, lang)}</Meta>}
                  {f.gimmicks.map(g => (
                    <GameIcon key={g.key} icon={data.gimmicks[g.key]?.icon} alt={tx(data.gimmicks[g.key]?.title, lang)} className="rounded w-[22px] h-[22px] lg:w-6 lg:h-6" />
                  ))}
                </div>

                {/* รางวัลผ่านชั้น */}
                {f.reward.item && (
                  <div className="mt-2 hidden lg:flex items-center gap-2 lg:gap-2.5 rounded-xl bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent ring-1 ring-amber-300/10 px-2 py-1 lg:px-2.5 lg:py-1">
                    <GameIcon icon={IC.trophy} className="w-5 h-5 lg:w-6 lg:h-6" />
                    <GameIcon icon={clear?.icon} className="w-[30px] h-[30px] lg:w-8 lg:h-8" alt={tx(clear?.name, lang)} />
                    <span className="min-w-0 truncate text-[12px] lg:text-[13px] text-amber-100">{tx(clear?.name, lang)}</span>
                    <span className="ml-auto font-[family-name:var(--font-line)] text-[13px] lg:text-[15px] text-white"><Amount r={f.reward.item} data={data} /></span>
                  </div>
                )}
              </div>
            </div>

            {/* ── รางวัลผ่านชั้น (มือถือ/แท็บเล็ต): แถวเต็มความกว้างแบบเดียวกับภารกิจ แต่เด่นกว่า ── */}
            {f.reward.item && (
              <div className="lg:hidden relative overflow-hidden flex items-center gap-2.5 border-t border-amber-300/15 px-3 py-2.5
                bg-gradient-to-r from-amber-400/[0.16] via-amber-400/[0.06] to-transparent">
                <span className="pointer-events-none absolute -left-6 top-1/2 -translate-y-1/2 h-16 w-24 rounded-full bg-amber-400/20 blur-2xl" />
                <span className="relative shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-black/30 ring-1 ring-amber-300/25">
                  <GameIcon icon={IC.trophy} className="w-8 h-8" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-amber-200/80">{tx(data.ui.ENDLESS_ENTRY_ACQUIRABLE_REWARD, lang)}</span>
                  <span className="block truncate text-[13px] text-amber-50">{tx(clear?.name, lang)}</span>
                </span>
                <span className="relative shrink-0 flex items-center gap-1.5">
                  <GameIcon icon={clear?.icon} className="w-9 h-9" alt={tx(clear?.name, lang)} />
                  <span className="font-[family-name:var(--font-line)] text-[15px] text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.7)]"><Amount r={f.reward.item} data={data} /></span>
                </span>
              </div>
            )}

            {/* ── ภารกิจ 3 ข้อ — มือถือ: แถวละข้อ · จอใหญ่: 3 คอลัมน์แบบในเกม ── */}
            {f.missions.map(m => {
              const md = data.missions[m.code], it = data.items[m.reward.item]
              return (
                <div key={m.no} className="flex lg:flex-col items-center lg:items-stretch lg:justify-start gap-2.5 lg:gap-1.5 border-t lg:border-t-0 lg:border-l border-white/[0.07] px-3 py-2 lg:px-2.5 lg:py-2">
                  <GameIcon icon={md?.icon} alt={m.code} className="w-10 h-10 lg:w-14 lg:h-14 lg:self-center" />
                  <p className="flex-1 lg:flex-none min-w-0 text-[12.5px] lg:text-[12px] leading-snug text-gray-200 lg:text-center">{fillD(tx(md?.text, lang), m.value)}</p>
                  <span className="shrink-0 flex items-center gap-1 lg:justify-center lg:mt-auto" title={tx(it?.name, lang)}>
                    <GameIcon icon={it?.icon} alt={tx(it?.name, lang)} className="w-7 h-7" />
                    <span className="font-[family-name:var(--font-line)] text-[13px] lg:text-[14px] text-white"><Amount r={m.reward} data={data} /></span>
                  </span>
                </div>
              )
            })}
          </div>
        </button>

        {open && <FloorDetail f={f} data={data} lang={lang} T={T} onEnemy={onEnemy} />}
      </article>
    </li>
  )
})

function Meta({ icon, label, children, tone = 'text-gray-200' }: { icon: TIcon; label: string; children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-black/30 pl-0.5 pr-2 lg:pr-2.5 h-6 lg:h-7 text-[11.5px] lg:text-[12.5px] ${tone}`} title={label} aria-label={label}>
      <GameIcon icon={icon} className="w-5 h-5 lg:w-6 lg:h-6" />{children}
    </span>
  )
}

function FloorDetail({ f, data, lang, T, onEnemy }: { f: TFloor; data: TowerIndex; lang: L; T: Tfn; onEnemy: (e: TEnemy) => void }) {
  const [enemies, setEnemies] = useState<TEnemy[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    apiFetch(`/api/infinity-tower/${f.code}`).then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { enemies: TEnemy[] }) => { if (live) setEnemies(d.enemies) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [f.code])

  const clear = f.reward.item ? data.items[f.reward.item.item] : null
  return (
    <div className="border-t border-white/10 bg-black/25 p-3 sm:p-4 space-y-4">
      {/* กลไก */}
      {f.gimmicks.length > 0 && (
        <section>
          <H>{tx(data.ui.ENDLESS_GIMMICK, lang)}</H>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {f.gimmicks.map(g => {
              const gi = data.gimmicks[g.key]
              return (
                <div key={g.key} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <GameIcon icon={gi?.icon} size={42} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-white leading-snug">
                      {tx(gi?.title, lang)}
                      {g.value != null && <span className="ml-1.5 font-semibold text-rose-300">−{pct(1 - g.value)}</span>}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{tx(gi?.desc, lang)}</p>
                    {g.value != null && <p className="mt-0.5 text-[10px] text-gray-500">{T('ค่าในเกม', 'Game value')} ×{g.value}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* รางวัลผ่านชั้น */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <H>{tx(data.ui.ENDLESS_ENTRY_ACQUIRABLE_REWARD, lang)}</H>
          <ul className="space-y-1.5 text-[13px]">
            {f.reward.item && (
              <li className="flex items-center gap-2">
                <GameIcon icon={clear?.icon} size={32} /><span className="flex-1 min-w-0 truncate text-gray-200">{tx(clear?.name, lang)}</span>
                <span className="font-semibold text-white"><Amount r={f.reward.item} data={data} /></span>
              </li>
            )}
            <li className="flex items-center gap-2"><GameIcon icon={IC.coin} size={26} className="mx-[3px]" /><span className="flex-1 text-gray-400">{tx(data.items['COIN:ni-01']?.name, lang) || T('เหรียญ', 'Coin')}</span><span className="font-semibold text-white">{fmt(f.reward.coin)}</span></li>
            <li className="flex items-center gap-2"><GameIcon icon={IC.exp} size={26} className="mx-[3px]" /><span className="flex-1 text-gray-400">EXP</span><span className="font-semibold text-white">{fmt(f.reward.exp)}</span></li>
            <li className="flex items-center gap-2"><span className="w-8 text-center text-[10px] font-bold text-gray-400">UNIT</span><span className="flex-1 text-gray-400">{T('EXP เรนเจอร์', 'Ranger EXP')}</span><span className="font-semibold text-white">{fmt(f.reward.unitExp)}</span></li>
          </ul>
        </section>

        {/* ข้อมูลด่าน */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <H>{T('ข้อมูลด่าน', 'Stage info')}</H>
          <dl className="space-y-1.5 text-[13px]">
            <Info icon={IC.feather} k={T('ใช้ขนนก', 'Feathers')} v={`×${f.needHeart}`} />
            {f.timeLimit != null && <Info icon={IC.timer} k={T('เวลาจำกัด', 'Time limit')} v={`${f.timeLimit} ${T('วินาที', 'sec')}`} />}
            {f.saveCount != null && <Info icon={IC.sally} k={T('ชาวเมืองที่ต้องช่วย', 'Citizens to rescue')} v={fmt(f.saveCount)} />}
            {f.sally && <Info icon={IC.sallyFree} k={T('ชาวเมืองโผล่ทุก', 'Citizens appear every')} v={`${f.sally[0]}–${f.sally[1]} ${T('วินาที', 'sec')}`} />}
            {f.enemyTowerHp != null && <Info icon={IC.base} k={T('HP ฐานศัตรู', 'Enemy base HP')} v={fmt(f.enemyTowerHp)} />}
            {f.boss && <Info icon={IC.boss} k={T('บอส', 'Boss')} v={tx(f.boss.name, lang)} />}
            {f.boss?.moveTime != null && <Info icon={IC.boss} k={T('บอสย้ายเลนทุก', 'Boss changes lane every')} v={`${f.boss.moveTime} ${T('วินาที', 'sec')}`} />}
            {f.boss?.backRate != null && <Info icon={IC.boss} k={T('บอสถอยกลับ', 'Boss knock-back rate')} v={pct(f.boss.backRate)} />}
            {f.distance != null && <Info k={T('ระยะสนาม', 'Field length')} v={fmt(f.distance)} />}
          </dl>
        </section>
      </div>

      {/* ศัตรู — มือถือ: การ์ด · จอใหญ่: ตาราง */}
      <section>
        <H>{T('ศัตรู', 'Enemies')} · {f.enemyCount}</H>
        {err && <p className="text-sm text-rose-300">{T('โหลดศัตรูไม่ได้', 'Could not load enemies')}</p>}
        {!enemies && !err && <EnemySkeleton />}
        {enemies && (
          <>
            <ul className="sm:hidden space-y-1.5">
              {enemies.map(e => (
                <li key={e.slot}>
                  <button onClick={() => onEnemy(e)} className={`w-full flex items-center gap-2.5 rounded-xl border p-2 text-left active:bg-white/10 ${e.boss ? 'border-rose-400/40 bg-rose-500/[0.08]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <GameIcon icon={thumbOf(e.unitCode)} className="w-11 h-11" />
                    <span className="min-w-0 flex-1">
                      <EnemyName e={e} data={data} lang={lang} />
                      <span className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-gray-400">
                        <span><b className="block text-[12.5px] font-semibold text-white">{e.initDelay}{T(' วิ', 's')}</b>{T('ออกครั้งแรก', 'First')}</span>
                        <span><b className="block text-[12.5px] font-semibold text-white">{respawn(e)}{T(' วิ', 's')}</b>{T('เกิดใหม่', 'Respawn')}</span>
                        <span><b className="block text-[12.5px] font-semibold text-white">{fmt(e.maxCount)}</b>{T('สูงสุด', 'Max')}</span>
                      </span>
                    </span>
                    <span className="material-icons-round text-gray-500">chevron_right</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-[13px]">
                <thead className="bg-white/[0.05] text-[11px] text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{T('ศัตรู', 'Enemy')}</th>
                    <th className="px-3 py-2 text-left font-medium">{T('ออกครั้งแรก', 'First spawn')}</th>
                    <th className="px-3 py-2 text-left font-medium">{T('เกิดใหม่ทุก', 'Respawn every')}</th>
                    <th className="px-3 py-2 text-left font-medium">{T('จำนวนสูงสุด', 'Max count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {enemies.map(e => (
                    <tr key={e.slot} onClick={() => onEnemy(e)} tabIndex={0} role="button" aria-label={tx(e.name, lang)}
                      onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEnemy(e) } }}
                      className={`border-t border-white/5 cursor-pointer transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400 ${e.boss ? 'bg-rose-500/[0.07]' : ''}`}>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <GameIcon icon={thumbOf(e.unitCode)} className="w-10 h-10" />
                          <EnemyName e={e} data={data} lang={lang} />
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-200">{e.initDelay}{T(' วิ', 's')}</td>
                      <td className="px-3 py-1.5 text-gray-200">{respawn(e)}{T(' วิ', 's')}</td>
                      <td className="px-3 py-1.5 text-gray-200">{fmt(e.maxCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const respawn = (e: TEnemy) => (e.minSec === e.maxSec ? `${e.minSec}` : `${e.minSec}–${e.maxSec}`)

function EnemyName({ e, data, lang }: { e: TEnemy; data: TowerIndex; lang: L }) {
  return (
    <span className="min-w-0 block">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-[13.5px] text-white">{tx(e.name, lang)}</span>
        {e.boss && <span className="shrink-0 rounded bg-rose-500/85 px-1 text-[9.5px] font-bold leading-[1.5] text-white">{tx(data.ui.ENDLESS_TIP_BOSS_ICON, lang)}</span>}
        {TYPE_ICON[e.type] && <SmallImg src={TYPE_ICON[e.type]} alt={e.type} />}
        {ELEMENT_ICON[e.element] && <SmallImg src={`/tierlist/el-${ELEMENT_ICON[e.element]}.png`} alt={e.element} />}
      </span>
    </span>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200/80">{children}</h3>
}

/** ไอคอนเล็กของเว็บ (ชนิด / ธาตุ) */
function SmallImg({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-4 w-4 shrink-0" />
}

function Info({ icon, k, v }: { icon?: TIcon; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon ? <GameIcon icon={icon} size={22} className="mx-[5px]" /> : <span className="w-8" />}
      <dt className="flex-1 text-gray-400">{k}</dt>
      <dd className="font-semibold text-white">{v}</dd>
    </div>
  )
}

/**
 * แถบล่างของมือถือ (นิ้วโป้งเอื้อมถึง) — แท็บประเภทด่าน 5 แท็บ + ปุ่มไปชั้นลอยเหนือแถบ
 * แท็บเล็ต/คอมใช้แถบกรองด้านบนแทน
 */
function MobileBar({ data, T, filter, counts, shortLabel, onFilter, onJump }: {
  data: TowerIndex; T: Tfn; filter: TBattle | 'ALL'; counts: Record<string, number>
  shortLabel: (b: TBattle) => string; onFilter: (v: TBattle | 'ALL') => void; onJump: () => void
}) {
  const tabs: { v: TBattle | 'ALL'; icon: TIcon; label: string; n: number; time?: boolean }[] = [
    { v: 'ALL', icon: IC.star, label: T('ทั้งหมด', 'All'), n: data.floors.length },
    ...(Object.keys(data.battles) as TBattle[]).map(b => ({ v: b, icon: data.battles[b].icon, label: shortLabel(b), n: counts[b] ?? 0, time: b === 'TIMEATTACK' })),
  ]
  return (
    <>
      <button onClick={onJump} aria-label={T('ไปชั้น', 'Go to floor')}
        className="sm:hidden fixed right-3 z-40 bottom-[calc(76px+env(safe-area-inset-bottom))] flex items-center gap-1.5 rounded-full
          bg-gradient-to-b from-fuchsia-500 to-purple-700 pl-2 pr-3.5 h-12 text-white shadow-[0_8px_24px_rgba(168,85,247,0.45)] ring-1 ring-white/20 active:scale-95 transition-transform">
        <GameIcon icon={IC.base} size={30} />
        <span className="font-[family-name:var(--font-line)] text-[14px]">{T('ไปชั้น', 'Floor')}</span>
      </button>
      <nav aria-label={T('ประเภทด่าน', 'Stage types')}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#140a22]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {tabs.map(t => {
            const on = filter === t.v
            return (
              <button key={t.v} onClick={() => onFilter(t.v)} aria-pressed={on}
                className={`relative flex flex-col items-center justify-center gap-0.5 h-[64px] px-0.5 transition-colors ${on ? 'text-white' : 'text-gray-400 active:bg-white/5'}`}>
                {on && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full bg-fuchsia-400" />}
                <span className={`relative flex items-center justify-center h-8 w-11 rounded-2xl transition-colors ${on ? 'bg-fuchsia-500/25' : ''}`}>
                  <GameIcon icon={t.icon} size={26} />
                  {t.time && <span className="absolute -right-0.5 -top-0.5"><GameIcon icon={IC.timer} size={14} /></span>}
                </span>
                <span className="max-w-full truncate text-[10.5px] leading-tight">{t.label}</span>
                <span className={`text-[9.5px] leading-none ${on ? 'text-fuchsia-200' : 'text-gray-500'}`}>{t.n}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}

/** แผ่นไปชั้น (มือถือ): พิมพ์เลขชั้น · ปุ่มลัด · ลำดับชั้น · กลับบนสุด */
function JumpSheet({ T, max, value, onChange, desc, onDesc, onGo, onTop, onClose }: {
  T: Tfn; max: number; value: string; onChange: (v: string) => void; desc: boolean; onDesc: (v: boolean) => void
  onGo: (n: number) => void; onTop: () => void; onClose: () => void
}) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  const n = parseInt(value, 10)
  const ok = n >= 1 && n <= max
  const quick = [1, 50, 100, 150, 200, 250, 300, max]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={T('ไปชั้น', 'Go to floor')}>
      <div className="w-full rounded-t-3xl border-t border-fuchsia-400/30 bg-[#1b1030] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ok) onGo(n) }}>
          <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" enterKeyHint="go"
            placeholder={`1 – ${max}`} aria-label={T('เลขชั้น', 'Floor number')}
            className="min-w-0 flex-1 h-12 rounded-2xl border border-white/15 bg-white/5 px-4 text-lg text-white placeholder:text-gray-500 focus:border-fuchsia-400/70 focus:outline-none" />
          <button type="submit" disabled={!ok} className="h-12 rounded-2xl bg-fuchsia-500 px-5 font-semibold text-white disabled:opacity-40 active:bg-fuchsia-600">{T('ไป', 'Go')}</button>
        </form>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {quick.map(q => (
            <button key={q} onClick={() => onGo(q)} className="h-10 rounded-xl border border-white/10 bg-white/5 text-sm text-gray-100 active:bg-white/15">
              {T(`ชั้น ${q}`, `${q}F`)}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 text-sm">
          {[false, true].map(v => (
            <button key={String(v)} onClick={() => onDesc(v)} aria-pressed={desc === v}
              className={`flex items-center justify-center gap-1 h-9 rounded-lg ${desc === v ? 'bg-fuchsia-500/30 text-white' : 'text-gray-400'}`}>
              <span className="material-icons-round text-[16px]">{v ? 'south' : 'north'}</span>
              {v ? T('บนลงล่าง', 'Top down') : T('ล่างขึ้นบน', 'Bottom up')}
            </button>
          ))}
        </div>
        <button onClick={onTop} className="mt-3 w-full h-10 rounded-xl text-sm text-gray-300 active:bg-white/10 flex items-center justify-center gap-1">
          <span className="material-icons-round text-[18px]">vertical_align_top</span>{T('กลับบนสุด', 'Back to top')}
        </button>
      </div>
    </div>
  )
}
