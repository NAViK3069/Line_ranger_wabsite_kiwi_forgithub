'use client'

// ====================================================
// /main-stage — ด่านหลัก (ปกติ / Hard / Extreme) ทุกพื้นที่ จากข้อมูลเกมของเรา
//   ข้อมูล: /api/main-stage (พื้นที่ + ด่านทั้งหมด) + /api/main-stage/<stage> (ศัตรูแบ่งตามช่วง — โหลดตอนเปิดด่าน)
//   ที่มา/กติกาของข้อมูล: src/lib/mainStage.ts
//   การ์ดพื้นที่ = แผนที่ของเกม (area_bg) + ฉากอนิเมชัน new_arNN + ปุ่มด่านวางตามตำแหน่งในเกม (AreaMap.tsx) + ปุ่มด่าน 12 ปุ่ม
//   (area3-btn-* / area-btn-hard-* / area-btn-extreme-*) → กดแล้วรายละเอียดด่านกางลงมาใต้การ์ด
//
// ออกแบบมือถือก่อน: ค่าเริ่มของ class = จอมือถือ · sm:/lg: = จอใหญ่ขึ้น
// ?m=hard&s=hs12 → เปิดโหมด Hard และกางด่าน hs12 ให้เลย
// ====================================================

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch, LERICO_ORIGIN } from '@/lib/staticApi'
import type { TEnemy, TIcon, TReward, TText } from '@/lib/infinityTower'
import type { MainStageDetail, MainStageIndex, MSArea, MSEnemy, MSStage, MSTreasure, MSTrigger, MSWave, StageMode } from '@/lib/mainStage'
import { GameIcon, useIconUrl } from '../infinity-tower/atlas'
import TowerEnemyPopup from '../infinity-tower/TowerEnemyPopup'
import { EnemySkeleton, SamLoop, Shimmer } from '../infinity-tower/TowerLoading'

// canvas + โหลดไฟล์ .sam → ฝั่ง browser เท่านั้น
const AreaMap = dynamic(() => import('./AreaMap'), { ssr: false })
const StageScene = dynamic(() => import('./StageScene'), { ssr: false })

type L = 'en' | 'th'
type Tfn = (th: string, en: string) => string
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const tx = (t: TText | undefined | null, lang: L) => (t ? t[lang] || t.en : '')
const MODES: StageMode[] = ['normal', 'hard', 'extreme']
/** ความยาวสนามที่ใช้วาดฉากหัวด่าน (pt) — เท่ากันทุกด่าน ฉากเดียวกันจึงไม่ย่อ/ขยายต่างกันตามระยะสนามของแต่ละด่าน */
const SCENE_FIELD = 1600

// ── ไอคอนของเกม ──
const IC: Record<string, TIcon> = {
  heart: { atlas: 'popup', frame: 'pop_gift_icon_03.png' },
  coin: { atlas: 'popup', frame: 'pop_gift_icon_02.png' },
  exp: { atlas: 'popup', frame: 'pop_gift_icon_09.png' },
  base: { atlas: 'ui', frame: 'endless_battle_top_tower_img.png' },
  timer: { atlas: 'main', frame: 'endless_main_timer.png' },
  trophy: { atlas: 'main', frame: 'endless_reward_icon_trophy.png' },
  boss: { atlas: 'ui', frame: 'endless_battle_track_boss_icon.png' },
  tip: { atlas: 'entry', frame: 'entry_tip_icon.png' },
  coverSquare: { atlas: 'commonui', frame: 'entry_popup_gimmick_cover_on01.png' },
  coverRound: { atlas: 'commonui', frame: 'entry_popup_gimmick_cover_on02.png' },
  treasureCard: { atlas: 'treasure', frame: 'treasure_detail_item_bg.png' },
  treasureArrow: { atlas: 'treasure16', frame: 'treasure_arrow.png' },
  star: { atlas: 'treasure16', frame: 'treasure_img_star.png' },
  starDim: { atlas: 'treasure16', frame: 'treasure_img_star_dim.png' },
}
/** ไอคอนโหมด (area_hard_mode: intro_mode_*_icon) */
const MODE_ICON: Record<StageMode, TIcon> = {
  normal: { atlas: 'areahard', frame: 'intro_mode_normal_icon.png' },
  hard: { atlas: 'areahard', frame: 'intro_mode_hard_icon.png' },
  extreme: { atlas: 'areahard', frame: 'intro_mode_extreme_icon.png' },
}
/** ปุ่มด่านของเกมตามโหมด (ปกติ = ทอง · Hard = ม่วง · Extreme = ส้ม · บอส = แดงหัวกะโหลก) + ตัวเลขของโหมดนั้น */
type Btn = { on: TIcon; off: TIcon; boss: TIcon; bossOff: TIcon; num: (d: string) => TIcon }
/** โหมดปกติ: ปุ่มต่างกันตามซีซั่นของพื้นที่ (1 = ทอง · 2 = ฟ้า · 3 = ทองแบบใหม่) */
const SEASON_BTN: Record<number, Btn> = {
  1: {
    on: { atlas: 'area', frame: 'area-btn-on.png' }, off: { atlas: 'area', frame: 'area-btn-off.png' },
    boss: { atlas: 'area', frame: 'area-btn-boss-on.png' }, bossOff: { atlas: 'area', frame: 'area-btn-boss-off.png' },
    num: d => ({ atlas: 'area', frame: `area-num-0${d}.png` }),
  },
  2: {
    on: { atlas: 'area2', frame: 'area2-btn-on.png' }, off: { atlas: 'area2', frame: 'area2-btn-off.png' },
    boss: { atlas: 'area2', frame: 'area2-btn-boss-on.png' }, bossOff: { atlas: 'area2', frame: 'area2-btn-boss-off.png' },
    num: d => ({ atlas: 'area', frame: `area2-num-0${d}.png` }),
  },
}
const btnOf = (a: MSArea): Btn => (a.mode === 'normal' ? SEASON_BTN[a.season] ?? BTN.normal : BTN[a.mode])
/** หัวโหมด: ไอคอนใหญ่ของหน้าต่างเข้าด่าน (entry_icon_hard01 / extreme01) · ปกติใช้ Sally ของแท็บโหมด */
const HERO_ICON: Record<StageMode, TIcon> = {
  normal: { atlas: 'areahard', frame: 'intro_mode_normal_icon.png' },
  hard: { atlas: 'entryico', frame: 'entry_icon_hard01.png' },
  extreme: { atlas: 'entryico', frame: 'entry_icon_extreme01.png' },
}
const BTN: Record<StageMode, Btn> = {
  normal: {
    on: { atlas: 'area3', frame: 'area3-btn-on.png' }, off: { atlas: 'area3', frame: 'area3-btn-off.png' },
    boss: { atlas: 'area3', frame: 'area3-btn-boss-on.png' }, bossOff: { atlas: 'area3', frame: 'area3-btn-boss-off.png' },
    num: d => ({ atlas: 'area3', frame: `area3-num-0${d}.png` }),
  },
  hard: {
    on: { atlas: 'areahard', frame: 'area-btn-hard-on.png' }, off: { atlas: 'areahard', frame: 'area-btn-hard-off.png' },
    boss: { atlas: 'areahard', frame: 'area-btn-hard-boss-on.png' }, bossOff: { atlas: 'areahard', frame: 'area-btn-hard-boss-off.png' },
    num: d => ({ atlas: 'areahard', frame: `area-num-hard-0${d}.png` }),
  },
  extreme: {
    on: { atlas: 'areahard', frame: 'area-btn-extreme-on.png' }, off: { atlas: 'areahard', frame: 'area-btn-extreme-off.png' },
    boss: { atlas: 'areahard', frame: 'area-btn-extreme-boss-on.png' }, bossOff: { atlas: 'areahard', frame: 'area-btn-extreme-boss-off.png' },
    num: d => ({ atlas: 'areahard', frame: `area-num-extreme-0${d}.png` }),
  },
}
/** สีของแต่ละโหมด */
const TONE: Record<StageMode, { ring: string; open: string; tab: string; glow: string; chip: string; land: string }> = {
  normal: {
    ring: 'border-amber-300/20', open: 'border-amber-300/50', glow: 'bg-amber-400/25',
    tab: 'from-amber-400/45 to-orange-600/35 ring-amber-200/40 shadow-[0_4px_14px_rgba(251,191,36,0.3)]',
    chip: 'bg-amber-400/15 text-amber-100 ring-amber-300/25', land: '',
  },
  hard: {
    ring: 'border-violet-400/25', open: 'border-violet-400/55', glow: 'bg-violet-500/30',
    tab: 'from-violet-500/50 to-purple-800/40 ring-violet-300/40 shadow-[0_4px_14px_rgba(139,92,246,0.35)]',
    chip: 'bg-violet-500/15 text-violet-100 ring-violet-300/25', land: 'saturate-[.85] hue-rotate-[-12deg]',
  },
  extreme: {
    ring: 'border-orange-400/25', open: 'border-orange-400/55', glow: 'bg-orange-500/30',
    tab: 'from-orange-500/50 to-red-700/40 ring-orange-300/40 shadow-[0_4px_14px_rgba(249,115,22,0.35)]',
    chip: 'bg-orange-500/15 text-orange-100 ring-orange-300/25', land: 'saturate-[1.15]',
  },
}
const ELEMENT_ICON: Record<string, string> = { fire: 'fire', water: 'water', tree: 'wood', wood: 'wood', light: 'light', dark: 'dark' }
const TYPE_ICON: Record<string, string> = { STR: '/gacha/images/Str.png', AGI: '/gacha/images/Agi.png', INT: '/gacha/images/Int.png' }
const thumbOf = (code: string): TIcon => ({ url: `${LERICO_ORIGIN}/res/${code}/${code}-thum.png` })

export default function MainStagePage() {
  const { lang: siteLang, tStat } = useLanguage()
  const lang = siteLang as L
  const T: Tfn = useCallback((th, en) => (lang === 'th' ? th : en), [lang])

  const [data, setData] = useState<MainStageIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<StageMode>('normal')
  const [open, setOpen] = useState<string | null>(null)
  const [enemy, setEnemy] = useState<TEnemy | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  /** ของที่กำลังหา (รหัสไอเทม "UNIT:u014e-cony") — ซ่อนพื้นที่ที่ไม่มี + ปุ่มด่านที่ไม่ดรอปมืดลง */
  const [find, setFind] = useState<string | null>(null)
  /** แผ่นมือถือ / กล่องคอมที่เปิดอยู่ */
  const [sheet, setSheet] = useState<'find' | 'jump' | null>(null)

  useEffect(() => {
    apiFetch('/api/main-stage').then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MainStageIndex) => setData(d)).catch(() => setFailed(true))
  }, [])

  // ไม่ให้ Google เก็บหน้านี้ระหว่างที่ยังทำไม่เสร็จ
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex'
    document.head.appendChild(m)
    return () => { m.remove() }
  }, [])

  // ?m=hard&s=hs12 → เปิดโหมด/ด่านนั้น (ครั้งแรกที่ข้อมูลมา)
  const first = useRef(true)
  useEffect(() => {
    if (!data || !first.current) return
    first.current = false
    const q = new URLSearchParams(location.search)
    const m = q.get('m') as StageMode | null
    const s = q.get('s')
    const found = s ? MODES.find(md => data.modes[md].some(a => a.stages.some(st => st.code === s))) : null
    if (found) { setMode(found); setOpen(s) } else if (m && MODES.includes(m)) setMode(m)
    if (found && s) requestAnimationFrame(() => alignTo(s))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const syncUrl = (m: StageMode, s: string | null) => {
    const url = new URL(location.href)
    url.searchParams.set('m', m)
    if (s) url.searchParams.set('s', s); else url.searchParams.delete('s')
    history.replaceState(null, '', url)
  }
  const pickMode = (m: StageMode) => {
    if (m === mode) return
    setMode(m); setOpen(null); setTreasure(null); setFind(null); syncUrl(m, null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  /**
   * เลื่อนให้ขอบบนการ์ดพื้นที่อยู่ใต้แถบเมนูพอดี (แบบหน้าหอคอย)
   * การ์ดอื่นที่เพิ่งหุบ / รูปที่โหลดตามมา ทำให้หน้าขยับ → คอยปรับซ้ำ ~1.5 วิ · ผู้ใช้เลื่อนเอง = หยุดทันที
   */
  const alignStop = useRef<(() => void) | null>(null)
  const alignArea = useCallback((areaCode: string) => {
    alignStop.current?.()
    const el = document.getElementById(`area-${areaCode}`)
    if (!el) return
    const target = () => {
      const bar = headerRef.current?.getBoundingClientRect().bottom ?? 0
      return Math.max(0, el.getBoundingClientRect().top + window.scrollY - bar - 8)
    }
    window.scrollTo({ top: target(), behavior: 'smooth' })
    let done = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const stop = () => {
      done = true
      timers.forEach(clearTimeout)
      removeEventListener('wheel', stop); removeEventListener('touchstart', stop); removeEventListener('keydown', stop)
      if (alignStop.current === stop) alignStop.current = null
    }
    alignStop.current = stop
    addEventListener('wheel', stop, { passive: true }); addEventListener('touchstart', stop, { passive: true }); addEventListener('keydown', stop)
    // ให้ smooth scroll ไปก่อน แล้วค่อยแก้ส่วนที่คลาด (ไม่ใช้ requestAnimationFrame — จอที่ถูกหน่วงจะค้าง)
    for (const t of [650, 900, 1200, 1500]) timers.push(setTimeout(() => {
      if (done) return
      const want = target()
      if (Math.abs(want - window.scrollY) > 2) window.scrollTo({ top: want, behavior: 'auto' })
      if (t === 1500) stop()
    }, t))
  }, [])
  const alignTo = (stage: string) => {
    const area = document.getElementById(`st-${stage}`)?.closest('article')?.id.replace(/^area-/, '')
    if (area) alignArea(area)
  }
  /** สมบัติที่กางอยู่ (รหัสพื้นที่) — เปิดได้ทีละพื้นที่ */
  const [treasure, setTreasure] = useState<string | null>(null)
  const pendingAlign = useRef<string | null>(null)
  const toggleTreasure = useCallback((areaCode: string) => {
    setTreasure(cur => {
      const next = cur === areaCode ? null : areaCode
      if (next) pendingAlign.current = next
      return next
    })
  }, [])
  // ค่าล่าสุดของด่านที่เปิด (ให้ toggle คงที่ — AreaCard เป็น memo) · อัปเดต URL นอกตัวอัปเดต state
  // (history.replaceState ระหว่าง render ทำให้ Router ของ Next อัปเดตซ้อน → React ฟ้อง)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])
  const toggle = useCallback((code: string) => {
    const next = openRef.current === code ? null : code
    openRef.current = next
    setOpen(next)
    syncUrl(mode, next)
    // เปิดด่าน → การ์ดพื้นที่นั้นชิดบนจอ (หลัง render — การ์ดเดิมที่หุบลงจะไม่ทำให้คลาด)
    if (next) pendingAlign.current = document.getElementById(`st-${next}`)?.closest('article')?.id.replace(/^area-/, '') ?? null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useLayoutEffect(() => {
    const a = pendingAlign.current
    if (!a) return
    pendingAlign.current = null
    alignArea(a)
  }, [open, treasure, alignArea])

  const allAreas = useMemo(() => data?.modes[mode] ?? [], [data, mode])
  /** ของทั้งหมดที่ดรอปในโหมดนี้ (สำหรับช่องหาของ) */
  const modeItems = useMemo(() => collectItems(allAreas), [allAreas])
  const areas = useMemo(() => (find ? allAreas.filter(a => a.stages.some(st => stageHas(st, find))) : allAreas), [allAreas, find])
  const findInfo = find ? modeItems.find(x => x.key === find) ?? null : null
  const stageRange = useMemo(() => {
    const nos = allAreas.flatMap(a => a.stages.map(st => st.no))
    return nos.length ? [Math.min(...nos), Math.max(...nos)] as [number, number] : [1, 1] as [number, number]
  }, [allAreas])
  /** ไปด่าน (เลขด่านของโหมดนี้) — เปิดรายละเอียดด่าน แล้วเลื่อนการ์ดพื้นที่ชิดบนจอ */
  const goStage = (no: number) => {
    const area = allAreas.find(a => a.stages.some(st => st.no === no))
    const st = area?.stages.find(x => x.no === no)
    if (!area || !st) return false
    if (find && !area.stages.some(x => stageHas(x, find))) setFind(null)
    setSheet(null)
    openRef.current = st.code
    setOpen(st.code)
    syncUrl(mode, st.code)
    pendingAlign.current = area.code
    return true
  }
  const pickFind = (key: string | null) => {
    setFind(key); setSheet(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const counts = useMemo(() => Object.fromEntries(MODES.map(m => [m, data?.modes[m].reduce((n, a) => n + a.stages.length, 0) ?? 0])) as Record<StageMode, number>, [data])
  const modeName = (m: StageMode) => (data ? tx(m === 'normal' ? data.ui.SPECIAL_AREA_DIFF_TEXT_NORMAL : m === 'hard' ? data.ui.SPECIAL_AREA_DIFF_TEXT_HARD : data.ui.FRIEND_HOME_EXTREME_STAGE, lang) : '')
    || ({ normal: 'Normal', hard: 'Hard', extreme: 'Extreme' })[m]

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <header ref={headerRef} className="sticky top-0 z-30 border-b border-white/10 bg-[#120a20]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-gray-300 hover:bg-white/10 hover:text-white">
            <span className="material-icons-round text-[22px]">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home-icons/mission-main-stage.webp" alt="" width={34} height={34} className="rounded-lg ring-1 ring-white/15" />
          <h1 className="font-[family-name:var(--font-line)] text-[17px] sm:text-lg text-white truncate">Main Stage</h1>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>
        {/* แท็บโหมด — คอม: อยู่ในแถบบน · มือถือ: แถบล่าง */}
        <div className="hidden sm:flex max-w-6xl mx-auto px-4 pb-2.5">
          <div role="tablist" aria-label={T('ระดับความยาก', 'Difficulty')} className="flex items-center gap-1 rounded-2xl bg-black/35 p-1 ring-1 ring-white/10">
            {MODES.map(m => (
              <ModeTab key={m} m={m} on={mode === m} label={modeName(m)} n={counts[m]} onClick={() => pickMode(m)} />
            ))}
          </div>
          {data && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <FindBox items={modeItems} data={data} lang={lang} T={T} value={find} onPick={pickFind}
                open={sheet === 'find'} onOpen={v => setSheet(v ? 'find' : null)} />
              <JumpBox T={T} range={stageRange} areas={allAreas} lang={lang} onGo={goStage}
                open={sheet === 'jump'} onOpen={v => setSheet(v ? 'jump' : null)} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 pt-3 sm:pt-5">
        {/* ── หัวโหมด ── */}
        <ModeHero mode={mode} data={data} lang={lang} T={T} name={modeName(mode)} />

        {failed && <p className="mt-10 text-center text-rose-300">{T('โหลดข้อมูลด่านไม่ได้', 'Could not load the stage data')}</p>}
        {!data && !failed && <AreasSkeleton />}

        {/* กำลังหาของ: บอกว่าเจอกี่ด่าน/พื้นที่ + ล้าง */}
        {data && findInfo && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent p-2.5">
            <span className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-black/30 ring-1 ring-amber-300/40">
              <ItemIcon icon={data.items[findInfo.key]?.icon} alt="" className="w-10 h-10" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-white">{tx(data.items[findInfo.key]?.name, lang)}</p>
              <p className="text-[11.5px] text-amber-100/80">
                {T(`ดรอปใน ${findInfo.stages} ด่าน · ${findInfo.areas} พื้นที่`, `Drops in ${findInfo.stages} stages · ${findInfo.areas} areas`)}
              </p>
            </div>
            <button onClick={() => pickFind(null)} className="shrink-0 flex items-center gap-1 h-9 rounded-xl px-3 text-sm text-amber-100 ring-1 ring-amber-300/30 hover:bg-white/10">
              <span className="material-icons-round text-[18px]">close</span>{T('ล้าง', 'Clear')}
            </button>
          </div>
        )}

        {data && (
          <ol key={`${mode}:${find ?? ''}`} className="it-stagger mt-3 space-y-3 sm:space-y-4">
            {areas.map((a, i) => (
              <AreaCard key={a.code} a={a} data={data} lang={lang} T={T} order={Math.min(i, 10)}
                open={a.stages.some(s => s.code === open) ? open : null} onToggle={toggle} onEnemy={setEnemy}
                treasureOpen={treasure === a.code} onTreasure={toggleTreasure} findItem={find} />
            ))}
          </ol>
        )}
      </main>

      {/* แถบล่างมือถือ: โหมด */}
      {data && (
        <nav className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#120a20]/95 backdrop-blur px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
          <div role="tablist" aria-label={T('ระดับความยาก', 'Difficulty')} className="grid grid-cols-3 gap-1">
            {MODES.map(m => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => pickMode(m)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 transition-all ${mode === m ? `bg-gradient-to-b ring-1 text-white ${TONE[m].tab}` : 'text-gray-400'}`}>
                <GameIcon icon={MODE_ICON[m]} size={26} />
                <span className="text-[11px] font-semibold leading-none">{modeName(m)}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* มือถือ: ปุ่มลอย หาของ / ไปด่าน (เหนือแถบโหมด) */}
      {data && (
        <div className="sm:hidden fixed right-3 z-40 bottom-[calc(72px+env(safe-area-inset-bottom))] flex flex-col items-end gap-2">
          <button onClick={() => setSheet('find')} aria-label={T('หาของ', 'Find item')}
            className={`flex items-center gap-1.5 rounded-full h-11 pl-1.5 pr-3.5 text-white ring-1 ring-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-95 transition-transform ${find ? 'bg-gradient-to-b from-amber-500 to-orange-700' : 'bg-[#2a1846]/95'}`}>
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/25">
              {findInfo ? <ItemIcon icon={data.items[findInfo.key]?.icon} alt="" className="w-7 h-7" /> : <span className="material-icons-round text-[20px]">search</span>}
            </span>
            <span className="font-[family-name:var(--font-line)] text-[13.5px]">{T('หาของ', 'Find')}</span>
          </button>
          <button onClick={() => setSheet('jump')} aria-label={T('ไปด่าน', 'Go to stage')}
            className="flex items-center gap-1.5 rounded-full h-11 pl-1.5 pr-3.5 text-white ring-1 ring-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-95 transition-transform bg-gradient-to-b from-fuchsia-500 to-purple-700">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/25"><GameIcon icon={BTN[mode].on} className="w-7 h-7" /></span>
            <span className="font-[family-name:var(--font-line)] text-[13.5px]">{T('ไปด่าน', 'Stage')}</span>
          </button>
        </div>
      )}
      {data && sheet === 'find' && (
        <Sheet onClose={() => setSheet(null)} label={T('หาของ', 'Find item')}>
          <ItemPicker items={modeItems} data={data} lang={lang} T={T} value={find} onPick={pickFind} tall />
        </Sheet>
      )}
      {data && sheet === 'jump' && (
        <Sheet onClose={() => setSheet(null)} label={T('ไปด่าน', 'Go to stage')}>
          <JumpPanel T={T} range={stageRange} areas={allAreas} lang={lang} onGo={goStage} autoFocus={false} />
        </Sheet>
      )}

      {enemy && (
        <TowerEnemyPopup enemy={enemy} name={tx(enemy.name, lang)} bossLabel={T('บอส', 'Boss')} T={T} onClose={() => setEnemy(null)} />
      )}
    </div>
  )
}

// ── หาของ / ไปด่าน ──

const stageHas = (s: MSStage, key: string) => s.first.some(r => r.item === key) || s.drops.some(r => r.item === key)
/** ลำดับชนิดของ: วัสดุ Potential/วิวัฒนาการ → เรนเจอร์ → เกียร์ → ตั๋ว/ไอเทม → อื่นๆ */
const TYPE_RANK: Record<string, number> = { EV_MTRL: 0, UNIT: 1, UNIT_EQUIP: 2, P_GACHA: 3, CLS_GACHA: 3, SHORTEN_TIME: 4, ITEM: 5 }
interface ModeItem { key: string; stages: number; areas: number; rank: number }
function collectItems(areas: MSArea[]): ModeItem[] {
  const m = new Map<string, { stages: Set<string>; areas: Set<string> }>()
  for (const a of areas) for (const s of a.stages) for (const r of [...s.first, ...s.drops]) {
    let e = m.get(r.item)
    if (!e) m.set(r.item, e = { stages: new Set(), areas: new Set() })
    e.stages.add(s.code); e.areas.add(a.code)
  }
  return [...m.entries()].map(([key, e]) => ({ key, stages: e.stages.size, areas: e.areas.size, rank: TYPE_RANK[key.split(':')[0]] ?? 9 }))
    .sort((x, y) => x.rank - y.rank || x.key.localeCompare(y.key))
}
const TYPE_LABEL: Record<number, [string, string]> = {
  0: ['วัสดุ', 'Materials'], 1: ['เรนเจอร์', 'Rangers'], 2: ['เกียร์', 'Gear'], 3: ['ตั๋วกาชา', 'Gacha tickets'],
  4: ['ตั๋วลดเวลา', 'Time tickets'], 5: ['ไอเทมต่อสู้', 'Battle items'], 9: ['อื่นๆ', 'Other'],
}

/** รายการของให้เลือก + ช่องค้นหาชื่อ (ไทย/อังกฤษ) — จัดกลุ่มตามชนิด */
function ItemPicker({ items, data, lang, T, value, onPick, tall = false }: {
  items: ModeItem[]; data: MainStageIndex; lang: L; T: Tfn; value: string | null; onPick: (key: string | null) => void; tall?: boolean
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? items.filter(x => { const n = data.items[x.key]?.name; return `${n?.en ?? ''} ${n?.th ?? ''} ${x.key}`.toLowerCase().includes(needle) })
    : items
  const groups = [...new Set(shown.map(x => x.rank))]
  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 h-11 rounded-xl bg-white/5 px-3 ring-1 ring-white/15 focus-within:ring-amber-300/60">
        <span className="material-icons-round text-[20px] text-gray-400">search</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('พิมพ์ชื่อของ เช่น Cony, Potential', 'Type a name, e.g. Cony, Potential')}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-gray-500 focus:outline-none" />
        {q && <button type="button" onClick={() => setQ('')} aria-label={T('ล้าง', 'Clear')} className="text-gray-400"><span className="material-icons-round text-[18px]">close</span></button>}
      </label>
      <div className={`mt-2 overflow-y-auto overscroll-contain pr-1 ${tall ? 'max-h-[55vh]' : 'max-h-[60vh]'}`}>
        {value && (
          <button type="button" onClick={() => onPick(null)} className="mb-2 w-full flex items-center justify-center gap-1 h-9 rounded-xl text-sm text-amber-100 ring-1 ring-amber-300/30 hover:bg-white/10">
            <span className="material-icons-round text-[18px]">filter_alt_off</span>{T('ไม่กรอง (แสดงทุกพื้นที่)', 'No filter (show all areas)')}
          </button>
        )}
        {!shown.length && <p className="py-6 text-center text-sm text-gray-500">{T('ไม่เจอของชื่อนี้', 'Nothing matches')}</p>}
        {groups.map(g => (
          <section key={g} className="mb-2">
            <p className="sticky top-0 z-10 bg-[#1b1030]/95 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{T(...(TYPE_LABEL[g] ?? TYPE_LABEL[9]))}</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {shown.filter(x => x.rank === g).map(x => {
                const it = data.items[x.key]
                const on = value === x.key
                return (
                  <li key={x.key}>
                    <button type="button" onClick={() => onPick(on ? null : x.key)} aria-pressed={on}
                      className={`w-full flex items-center gap-2 rounded-xl p-1.5 text-left transition-colors ${on ? 'bg-amber-400/20 ring-1 ring-amber-300/60' : 'hover:bg-white/[0.06] active:bg-white/10'}`}>
                      <ItemIcon icon={it?.icon} alt="" className="w-9 h-9 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-white">{tx(it?.name, lang)}</span>
                        <span className="block text-[11px] text-gray-400">{T(`${x.stages} ด่าน · ${x.areas} พื้นที่`, `${x.stages} stages · ${x.areas} areas`)}</span>
                      </span>
                      {on && <span className="material-icons-round text-[18px] text-amber-300">check_circle</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/** ไปด่าน: พิมพ์เลขด่าน + ปุ่มลัดไปด่านแรกของแต่ละพื้นที่ */
function JumpPanel({ T, range, areas, lang, onGo, autoFocus = true }: {
  T: Tfn; range: [number, number]; areas: MSArea[]; lang: L; onGo: (no: number) => boolean; autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  const [miss, setMiss] = useState(false)
  const n = parseInt(v, 10)
  const ok = n >= range[0] && n <= range[1]
  const go = (x: number) => { if (!onGo(x)) setMiss(true) }
  return (
    <div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ok) go(n) }}>
        <input value={v} autoFocus={autoFocus} onChange={e => { setV(e.target.value.replace(/\D/g, '').slice(0, 3)); setMiss(false) }}
          inputMode="numeric" enterKeyHint="go" placeholder={T(`ด่าน ${range[0]}-${range[1]}`, `Stage ${range[0]}-${range[1]}`)} aria-label={T('เลขด่าน', 'Stage number')}
          className="min-w-0 flex-1 h-11 rounded-xl border border-white/15 bg-white/5 px-3.5 text-[16px] text-white placeholder:text-gray-500 focus:border-fuchsia-400/70 focus:outline-none" />
        <button type="submit" disabled={!ok} className="h-11 rounded-xl bg-fuchsia-500 px-5 font-semibold text-white disabled:opacity-40 hover:bg-fuchsia-400 active:bg-fuchsia-600">{T('ไป', 'Go')}</button>
      </form>
      {miss && <p className="mt-1 text-xs text-rose-300">{T('ไม่มีด่านนี้ในโหมดนี้', 'No such stage in this mode')}</p>}
      <p className="mt-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{T('ไปพื้นที่', 'Jump to area')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[45vh] overflow-y-auto overscroll-contain pr-1">
        {areas.map(a => (
          <button key={a.code} type="button" onClick={() => go(a.stages[0].no)}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 text-left ring-1 ring-white/10 hover:bg-fuchsia-500/20 active:bg-white/15">
            <span className="shrink-0 rounded-md bg-black/30 px-1.5 text-[11px] font-bold leading-5 text-amber-200">{a.no}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] text-white">{tx(a.name, lang)}</span>
              <span className="block text-[10.5px] tabular-nums text-gray-400">{a.stages[0].no}-{a.stages[a.stages.length - 1].no}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** กล่องลอยของแถบบน (คอม) — ปิดเมื่อคลิกข้างนอก / Esc */
function Popover({ open, onOpen, button, width, children }: {
  open: boolean; onOpen: (v: boolean) => void; button: React.ReactNode; width: string; children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (ev: MouseEvent) => { if (box.current && !box.current.contains(ev.target as Node)) onOpen(false) }
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onOpen(false) }
    addEventListener('mousedown', off); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', off); removeEventListener('keydown', esc) }
  }, [open, onOpen])
  return (
    <div ref={box} className="relative">
      {button}
      {open && (
        <div className={`absolute right-0 top-full mt-2 ${width} rounded-2xl border border-white/15 bg-[#1b1030] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.6)]`}>
          {children}
        </div>
      )}
    </div>
  )
}

function FindBox({ items, data, lang, T, value, onPick, open, onOpen }: {
  items: ModeItem[]; data: MainStageIndex; lang: L; T: Tfn; value: string | null; onPick: (key: string | null) => void
  open: boolean; onOpen: (v: boolean) => void
}) {
  const it = value ? data.items[value] : null
  return (
    <Popover open={open} onOpen={onOpen} width="w-[540px]" button={
      <button type="button" onClick={() => onOpen(!open)} aria-expanded={open}
        className={`flex items-center gap-2 h-10 rounded-xl pl-1.5 pr-3 text-sm ring-1 transition-colors ${value ? 'bg-amber-400/20 text-white ring-amber-300/50' : 'bg-black/35 text-gray-200 ring-white/10 hover:bg-white/10'}`}>
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/25">
          {it ? <ItemIcon icon={it.icon} alt="" className="w-7 h-7" /> : <span className="material-icons-round text-[20px]">search</span>}
        </span>
        <span className="max-w-[160px] truncate">{it ? tx(it.name, lang) : T('หาของที่ดรอป', 'Find a drop')}</span>
        <span className={`material-icons-round text-[18px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
    }>
      <ItemPicker items={items} data={data} lang={lang} T={T} value={value} onPick={onPick} />
    </Popover>
  )
}

function JumpBox({ T, range, areas, lang, onGo, open, onOpen }: {
  T: Tfn; range: [number, number]; areas: MSArea[]; lang: L; onGo: (no: number) => boolean; open: boolean; onOpen: (v: boolean) => void
}) {
  return (
    <Popover open={open} onOpen={onOpen} width="w-[420px]" button={
      <button type="button" onClick={() => onOpen(!open)} aria-expanded={open}
        className="flex items-center gap-1.5 h-10 rounded-xl bg-black/35 pl-2 pr-3 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10">
        <span className="material-icons-round text-[19px]">my_location</span>{T('ไปด่าน', 'Go to stage')}
        <span className={`material-icons-round text-[18px] text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
    }>
      <JumpPanel T={T} range={range} areas={areas} lang={lang} onGo={onGo} />
    </Popover>
  )
}

/** แผ่นเลื่อนขึ้นจากล่าง (มือถือ) */
function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className="w-full rounded-t-3xl border-t border-white/15 bg-[#1b1030] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <p className="mb-2 font-[family-name:var(--font-line)] text-[16px] text-white">{label}</p>
        {children}
      </div>
    </div>
  )
}

function ModeTab({ m, on, label, n, onClick }: { m: StageMode; on: boolean; label: string; n: number; onClick: () => void }) {
  return (
    <button role="tab" aria-selected={on} onClick={onClick}
      className={`flex items-center gap-2 h-10 rounded-xl pl-1.5 pr-3 text-sm whitespace-nowrap transition-all ${on
        ? `bg-gradient-to-b text-white ring-1 ${TONE[m].tab}` : 'text-gray-300 hover:bg-white/[0.07] hover:text-white'}`}>
      <span className="flex items-center justify-center w-8 h-8"><GameIcon icon={MODE_ICON[m]} size={28} /></span>
      <span className="font-semibold">{label}</span>
      <span className={`rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'}`}>{n}</span>
    </button>
  )
}

/** หัวของโหมด: ชื่อ + จำนวนพื้นที่/ด่าน · Extreme มีเรื่องราวของเกม */
function ModeHero({ mode, data, lang, T, name }: { mode: StageMode; data: MainStageIndex | null; lang: L; T: Tfn; name: string }) {
  const areas = data?.modes[mode] ?? []
  const stages = areas.reduce((n, a) => n + a.stages.length, 0)
  const bg = mode === 'normal' ? 'from-[#3a2a0c] via-[#22160a] to-[#140c06] border-amber-300/20'
    : mode === 'hard' ? 'from-[#2d1458] via-[#1b0b36] to-[#100620] border-violet-400/25'
      : 'from-[#4a160a] via-[#2a0c08] to-[#160604] border-orange-400/25'
  return (
    <section className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 sm:p-5 ${bg}`}>
      <div className={`pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full blur-3xl ${TONE[mode].glow}`} />
      <div className="relative flex items-center gap-3 sm:gap-4">
        <span className="shrink-0 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/35 ring-1 ring-white/10">
          <GameIcon icon={HERO_ICON[mode]} className="w-11 h-11 sm:w-14 sm:h-14" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-line)] text-xl sm:text-2xl text-white">{name}</h2>
          <p className="text-[12.5px] sm:text-sm text-white/70">
            {data ? T(`${areas.length} พื้นที่ · ${stages} ด่าน`, `${areas.length} areas · ${stages} stages`) : ' '}
          </p>
        </div>
      </div>
      {mode === 'extreme' && data && (
        <p className="relative mt-3 text-[12.5px] sm:text-[14px] leading-relaxed text-orange-50/80">
          {tx(data.ui.EXTREME_MODE_STORY_01, lang)} {tx(data.ui.EXTREME_MODE_STORY_02, lang)}
        </p>
      )}
    </section>
  )
}

function AreasSkeleton() {
  return (
    <div aria-busy="true" className="mt-3 space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex gap-3 rounded-2xl border border-white/10 bg-[#181026]/90 p-3" style={{ opacity: 1 - i * 0.25 }}>
          <Shimmer className="w-[112px] sm:w-[160px] h-[128px] sm:h-[170px] shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-5 w-2/5" />
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{Array.from({ length: 12 }, (_, k) => <Shimmer key={k} className="aspect-[90/76] rounded-full" />)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const AreaCard = memo(function AreaCard({ a, data, lang, T, order, open, onToggle, onEnemy, treasureOpen, onTreasure, findItem }: {
  a: MSArea; data: MainStageIndex; lang: L; T: Tfn; order: number
  /** ด่านที่กางอยู่ในพื้นที่นี้ (null = ไม่มี) */
  open: string | null
  onToggle: (code: string) => void; onEnemy: (e: TEnemy) => void
  treasureOpen: boolean; onTreasure: (areaCode: string) => void
  /** ของที่หาอยู่ทั้งหน้า (ช่องหาของ) — ใช้เป็นตัวกรองของพื้นที่นี้ ถ้าไม่ได้กด Key drops เอง */
  findItem: string | null
}) {
  const st = open ? a.stages.find(s => s.code === open) ?? null : null
  /** ของสำคัญที่เลือกอยู่ (กดไอคอนใน Key drops) → ปุ่มด่านที่ไม่ดรอปของนี้มืดลง · กดซ้ำ = ยกเลิก */
  const [ownPick, setPick] = useState<string | null>(null)
  const pick = ownPick ?? findItem
  const hasPick = (s: MSStage) => !!pick && stageHas(s, pick)
  const first = a.stages[0]?.no, last = a.stages[a.stages.length - 1]?.no
  return (
    <li style={{ ['--i' as string]: order }}>
      <article id={`area-${a.code}`} className={`rounded-2xl border bg-[#181026]/95 overflow-hidden transition-colors ${st ? `${TONE[a.mode].open} shadow-[0_10px_30px_rgba(0,0,0,0.35)]` : TONE[a.mode].ring}`}>
        {/* มือถือ: แถวบน = ฉาก + ชื่อ/เรื่องราว · แถวล่าง = ปุ่มด่านเต็มความกว้าง (6 ปุ่ม × 2 แถว)
            จอใหญ่: ฉากซ้าย (สูงเต็มการ์ด) · ชื่อ + ปุ่มด่านขวา */}
        <div className="grid grid-cols-[150px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-3">
          {/* ── ฉากพื้นที่ (อนิเมชันเกม) ── */}
          <div className="sm:row-span-3">
            <div className="relative overflow-hidden rounded-xl ring-1 ring-white/15 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]">
              <AreaMap land={a.land} tower={a.tower} mode={a.mode} className="w-full" />
              <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_-18px_24px_-12px_rgba(0,0,0,0.55)]" />
              <span className={`absolute left-1.5 top-1.5 rounded-md px-1.5 text-[10px] font-bold leading-5 ring-1 backdrop-blur ${TONE[a.mode].chip}`}>
                {T('พื้นที่', 'AREA')} {a.no}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-line)] text-[16px] sm:text-[19px] leading-tight text-white">{tx(a.name, lang)}</h3>
            <p className="text-[11px] sm:text-[12px] tabular-nums text-gray-400">{T('ด่าน', 'Stage')} {first}-{last}</p>
            {a.story && <p className="mt-1 text-[11.5px] sm:text-[12.5px] leading-snug text-gray-400 line-clamp-3 sm:line-clamp-2 lg:max-w-[760px]">{tx(a.story, lang)}</p>}
          </div>
          {/* ของสำคัญ — มือถือ: แถวเต็มความกว้างใต้ฉาก · จอใหญ่: ใต้ชื่อ */}
          <KeyDrops a={a} data={data} lang={lang} T={T} picked={pick} onPick={k => setPick(p => ((p ?? findItem) === k ? (findItem && findItem !== k ? findItem : null) : k))} />
          {/* ── ปุ่มด่าน 12 ปุ่ม (ของเกม) ── */}
          <div className="col-span-2 sm:col-span-1 grid grid-cols-6 lg:grid-cols-12 gap-x-1.5 gap-y-1 sm:gap-x-2 sm:gap-y-1.5 sm:max-w-[520px] lg:max-w-none">
            {a.stages.map(s => (
              <StageButton key={s.code} s={s} b={btnOf(a)} on={s.code === open} dim={pick ? !hasPick(s) : !!open && s.code !== open} onClick={() => onToggle(s.code)} T={T} />
            ))}
          </div>
        </div>
        {a.treasure && <TreasureBar t={a.treasure} land={a.land} stages={a.stages} lang={lang} T={T} open={treasureOpen} onToggle={() => onTreasure(a.code)} />}
        {st && <StageDetail key={st.code} s={st} a={a} data={data} lang={lang} T={T} onEnemy={onEnemy} />}
      </article>
    </li>
  )
})

/**
 * ของสำคัญที่ดรอปในพื้นที่ (รวมทุกด่าน: รางวัลเคลียร์ครั้งแรก + ของที่อาจได้รับ)
 * วัสดุ Potential / วิวัฒนาการ (EV_MTRL) ก่อน แล้วตามด้วยเรนเจอร์ (ไม่นับ Dr. Leonard ที่เป็นเรนเจอร์ EXP) และเกียร์
 */
function KeyDrops({ a, data, lang, T, picked, onPick }: {
  a: MSArea; data: MainStageIndex; lang: L; T: Tfn; picked: string | null; onPick: (key: string) => void
}) {
  const list = useMemo(() => {
    const seen = new Map<string, { key: string; rank: number }>()
    for (const s of a.stages) for (const r of [...s.first, ...s.drops]) {
      const type = r.item.split(':')[0]
      if (seen.has(r.item) || /-leonard$/.test(r.item)) continue
      const rank = type === 'EV_MTRL' ? 0 : type === 'UNIT' ? 1 : type === 'UNIT_EQUIP' ? 2 : -1
      if (rank >= 0) seen.set(r.item, { key: r.item, rank })
    }
    return [...seen.values()].sort((x, y) => x.rank - y.rank || x.key.localeCompare(y.key))
  }, [a])
  if (!list.length) return null
  return (
    <div className="col-span-2 sm:col-span-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 rounded-xl bg-black/20 px-2 py-1.5 ring-1 ring-white/[0.06] sm:bg-transparent sm:p-0 sm:ring-0">
      <p className="shrink-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-gray-400">{T('ของสำคัญ', 'Key drops')}</p>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {list.map(({ key }) => {
          const it = data.items[key]
          return (
            <li key={key} className="shrink-0">
              <button type="button" onClick={() => onPick(key)} title={tx(it?.name, lang)} aria-pressed={picked === key}
                aria-label={`${tx(it?.name, lang)} — ${T('ดูด่านที่ดรอป', 'show stages that drop it')}`}
                className={`flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl transition-all active:scale-95 ${picked === key
                  ? 'bg-amber-400/25 ring-2 ring-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.45)]'
                  : picked ? 'bg-black/30 ring-1 ring-white/10 opacity-55 hover:opacity-90' : 'bg-black/30 ring-1 ring-white/10 hover:ring-white/30'}`}>
                <ItemIcon icon={it?.icon} alt={tx(it?.name, lang)} className="w-10 h-10 sm:w-11 sm:h-11" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── สมบัติของพื้นที่ ──

/** รูปชิ้นส่วน — พื้นที่ใหม่ๆ มีแค่รูประดับ 3 (เกมก็ใช้ area%d_%d_3.png) → ไม่มีรูประดับ 1/2 ใช้ระดับ 3 แทน */
function PieceImg({ land, code, className }: { land: string; code: string; className: string }) {
  const base = `${LERICO_ORIGIN}/res/${land}_keyitem/`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${base}${code}.png`} alt="" draggable={false} loading="lazy" decoding="async" className={className}
      onError={e => { const im = e.currentTarget, alt = `${base}${code.replace(/_\d$/, '_3')}.png`; if (im.src !== alt) im.src = alt; else im.style.visibility = 'hidden' }} />
  )
}

function TreasureBar({ t, land, stages, lang, T, open, onToggle }: {
  t: MSTreasure; land: string; stages: MSStage[]; lang: L; T: Tfn; open: boolean; onToggle: () => void
}) {
  return (
    <div className="border-t border-amber-300/15 bg-gradient-to-r from-amber-400/[0.10] via-amber-400/[0.03] to-transparent">
      <button onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-white/[0.04] sm:hover:bg-white/[0.03]">
        <span className="relative shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-black/30 ring-1 ring-amber-300/25">
          <span className="pointer-events-none absolute inset-1 rounded-full bg-amber-300/20 blur-md" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.image} alt="" draggable={false} loading="lazy" decoding="async" className="relative w-10 h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-amber-200/80">{T('สมบัติของพื้นที่', 'Area treasure')}</span>
          <span className="block truncate text-[13.5px] text-amber-50">{tx(t.name, lang)}</span>
        </span>
        <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2.5 h-7 text-[12px] text-amber-100 ring-1 ring-amber-300/25">
          <span className="material-icons-round text-[15px] text-amber-300">auto_awesome</span>{tx(t.ability, lang)}
        </span>
        <span className={`material-icons-round shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {/* มือถือ: ความสามารถอยู่บรรทัดของมันเอง */}
      {!open && (
        <p className="sm:hidden -mt-1 px-3 pb-2 pl-[68px] text-[12px] text-amber-100/90">
          <span className="material-icons-round align-[-3px] mr-1 text-[14px] text-amber-300">auto_awesome</span>{tx(t.ability, lang)}
        </p>
      )}
      {open && (
        <div className="px-3 pb-3">
          {/* สมบัติ + ความสามารถ */}
          <div className="flex items-center gap-3 rounded-xl border border-amber-300/25 bg-black/25 p-2.5">
            <span className="relative shrink-0 flex items-center justify-center w-16 h-16">
              <span className="pointer-events-none absolute inset-0 rounded-full bg-amber-300/25 blur-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.image} alt={tx(t.name, lang)} draggable={false} className="relative w-16 h-16 object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)]" />
            </span>
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-line)] text-[16px] leading-tight text-white">{tx(t.name, lang)}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200/70">{T('ความสามารถของสมบัติ', 'Treasure ability')}</p>
              <p className="text-[13.5px] text-amber-50">{tx(t.ability, lang)}</p>
            </div>
          </div>
          {/* ชิ้นส่วน 3 กลุ่ม × 3 ระดับ */}
          <p className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">{T('ชิ้นส่วนสมบัติ', 'Treasure pieces')}</p>
          {/* กลุ่มละแถว: ด่านที่ดรอป (กลุ่ม 1 = ด่าน 1–4 ของพื้นที่ · 2 = 5–8 · 3 = 9–12 แบบหน้าสมบัติในเกม)
              + ชิ้น 3 ระดับบนกรอบไม้ของเกม ดาวบอกระดับ (★☆☆ → ★★★) */}
          {/* มือถือ: กลุ่มละแถว · คอม: 3 กลุ่มเรียงข้างกัน (ไม่เกะกะ) */}
          <ol className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            {t.groups.map((g, gi) => {
              const from = stages[gi * 4]?.no, to = stages[Math.min(stages.length, gi * 4 + 4) - 1]?.no
              return (
                <li key={g.code} className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.07]">
                  {from != null && to != null && (
                    <p className="mb-1.5 text-center text-[12px] font-semibold tabular-nums text-white">
                      {T('ด่าน', 'Stage')} {from}-{to}
                    </p>
                  )}
                  {/* แถวบน = กรอบชิ้น + ลูกศร (กึ่งกลางกรอบ) · แถวล่าง = ชื่อ */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-x-1 sm:gap-x-2 lg:gap-x-1">
                    {g.pieces.map((p, k) => (
                      <Fragment key={p.code}>
                        {k > 0 && <GameIcon icon={IC.treasureArrow} className="w-3 h-5 lg:w-2.5 lg:h-4 -scale-x-100" />}
                        <span className="relative mx-auto block w-full max-w-[104px] lg:max-w-[76px] aspect-[158/150]">
                          <GameIcon icon={IC.treasureCard} className="absolute inset-0 w-full h-full" />
                          <PieceImg land={land} code={p.code} className="absolute left-[16%] top-[8%] w-[68%] h-[62%] object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
                          {/* ดาวระดับ — วางทับขอบล่างของรูปชิ้น แบบในเกม */}
                          <span className="absolute inset-x-0 bottom-[12%] flex justify-center">
                            {[0, 1, 2].map(i => <GameIcon key={i} icon={i <= k ? IC.star : IC.starDim} className="w-[22%] aspect-square -mx-[1%]" />)}
                          </span>
                        </span>
                      </Fragment>
                    ))}
                    {g.pieces.map((p, k) => (
                      <Fragment key={`${p.code}-name`}>
                        {k > 0 && <span />}
                        <span className="mt-1 self-start text-center text-[10.5px] sm:text-[11.5px] lg:text-[10.5px] leading-tight text-gray-200 line-clamp-2">{tx(p.name, lang)}</span>
                      </Fragment>
                    ))}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}

/** on = ด่านที่เปิดอยู่ (สว่าง + ใหญ่ขึ้นนิดหน่อย) · dim = ด่านอื่นในพื้นที่เดียวกันตอนมีด่านเปิด (มืดลงนิดหน่อย ให้ด่านที่เปิดเด่น) */
function StageButton({ s, b, on, dim, onClick, T }: { s: MSStage; b: Btn; on: boolean; dim: boolean; onClick: () => void; T: Tfn }) {
  return (
    <button id={`st-${s.code}`} onClick={onClick} aria-expanded={on}
      aria-label={`${T('ด่าน', 'Stage')} ${s.no}${s.boss ? ` (${T('บอส', 'Boss')})` : ''}`}
      className="group relative flex flex-col items-center rounded-xl pt-0.5 transition-transform active:scale-95">
      <span className={`relative block w-full aspect-[90/76] transition-[transform,filter] duration-200 ${on ? 'z-10 scale-[1.14]' : dim ? 'brightness-[0.5] saturate-[0.7] group-hover:brightness-90' : ''}`}>
        <GameIcon icon={on ? (s.boss ? b.boss : b.on) : (s.boss ? b.bossOff : b.off)}
          className={`absolute inset-0 w-full h-full transition-[filter] ${on ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.45)]' : 'group-hover:brightness-110'}`} />
        {/* เลขด่าน (ตัวเลขของเกม) — ด่านบอสมีหัวกะโหลกอยู่แล้ว เลขไปอยู่ใต้ปุ่ม */}
        {!s.boss && (
          <span className="absolute inset-x-0 top-[22%] h-[38%] flex items-center justify-center" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}>
            {String(s.no).split('').map((d, i) => <Digit key={i} icon={b.num(d)} />)}
          </span>
        )}
      </span>
    </button>
  )
}

function Digit({ icon }: { icon: TIcon }) {
  const url = useIconUrl(icon)
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} style={{ height: '100%', width: 'auto', maxWidth: 'none', margin: '0 -1px' }} /> : null
}

// ── รายละเอียดด่าน ──

const TRIGGER_TONE: Record<MSTrigger, string> = {
  START: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30',
  FRONT: 'bg-sky-500/15 text-sky-200 ring-sky-400/30',
  ENEMY_HP: 'bg-rose-500/15 text-rose-200 ring-rose-400/30',
  TIME: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  SPECIAL: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30',
}
const TRIGGER_ICON: Record<MSTrigger, string> = { START: 'flag', FRONT: 'directions_run', ENEMY_HP: 'castle', TIME: 'schedule', SPECIAL: 'auto_awesome' }
function triggerText(w: MSWave, T: Tfn) {
  switch (w.trigger) {
    case 'START': return T('เริ่มด่าน', 'Battle start')
    case 'FRONT': return T(`เมื่อเรนเจอร์บุกถึง ${w.value}% ของสนาม`, `When Rangers reach ${w.value}% of the field`)
    case 'ENEMY_HP': return T(`เมื่อ HP ป้อมศัตรูเหลือ ${w.value}%`, `When the enemy castle drops to ${w.value}% HP`)
    case 'TIME': return T(`เมื่อผ่านไป ${w.value} วินาที`, `After ${w.value} seconds`)
    default: return T(`เงื่อนไขพิเศษ (${w.value})`, `Special condition (${w.value})`)
  }
}

function StageDetail({ s, a, data, lang, T, onEnemy }: { s: MSStage; a: MSArea; data: MainStageIndex; lang: L; T: Tfn; onEnemy: (e: TEnemy) => void }) {
  const [detail, setDetail] = useState<MainStageDetail | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    apiFetch(`/api/main-stage/${s.code}`).then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MainStageDetail) => { if (live) setDetail(d) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [s.code])

  return (
    <div className="border-t border-white/10 bg-black/25">
      {/* ── หัวด่าน: ฉากต่อสู้ของเกม (bg + ออปเจค วางแบบในเกม — StageScene.tsx) ── */}
      <div className="relative overflow-hidden min-h-[150px] sm:min-h-[190px] lg:min-h-0 flex flex-col justify-end bg-[#120a20]">
        {/* ฉากเดียวกัน = ภาพเดียวกันทุกด่าน: ความยาวแสดงคงที่ + สุ่มตำแหน่งออปเจคตามชื่อฉาก (ไม่ใช่ตามด่าน) */}
        <StageScene bg={s.bg} field={SCENE_FIELD} seed={s.bg} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 to-transparent" />
        {/* ขนนกที่ใช้ — แยกไว้มุมบน: มือถือขวาบน · คอมซ้ายบน */}
        <span className="absolute right-2 top-2 lg:right-auto lg:left-4 lg:top-3 z-10">
          <Chip icon={IC.heart} label={T('ใช้หัวใจ', 'Hearts')}>×{s.needHeart}</Chip>
        </span>
        {/* มือถือ: ชื่อด่านชิดซ้ายบน · ป้อมขวาล่างบนพื้น (แถวสูงเต็มแถบ) · คอม: ชิดล่างแถวเดียวกับการ์ดรางวัล */}
        <div className="relative flex flex-1 items-end gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-w-0 flex-1 self-stretch flex flex-col lg:justify-end">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{tx(a.name, lang)} · {T('พื้นที่', 'Area')} {a.no}-{s.idx}</p>
            <p className="font-[family-name:var(--font-line)] text-[22px] sm:text-[26px] leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {T('ด่าน', 'Stage')} {s.no}
              {s.boss && <span className="ml-2 align-middle rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[11px] font-bold text-white">{T('บอส', 'BOSS')}</span>}
            </p>
            {/* มือถือ: HP / ระยะ ซ้อนคนละบรรทัด ชิดล่าง · คอม: แถวเดียว */}
            <div className="mt-auto pt-1.5 lg:mt-1.5 lg:pt-0 flex flex-col items-start lg:flex-row lg:flex-wrap lg:items-center gap-1.5">
              {s.enemyTowerHp != null && (
                <Chip label={T('HP ป้อมศัตรู', 'Enemy castle HP')}>
                  <span className="pl-1.5 text-[11px] font-bold text-rose-300">HP</span>{fmt(s.enemyTowerHp)}
                </Chip>
              )}
              {s.distance != null && (
                <Chip label={T('ระยะสนาม', 'Field length')}>
                  <span className="pl-1.5 text-[11px] text-gray-300">{T('ระยะ', 'Distance')}</span>{fmt(s.distance)}<span className="text-[11px] text-gray-300">pt</span>
                </Chip>
              )}
            </div>
          </div>
          {/* คอม: รางวัลลอยอยู่บนฉาก (ที่ว่างด้านขวา) — มือถืออยู่ข้างล่างตามเดิม */}
          <div className="hidden lg:flex shrink-0 items-stretch gap-2">
            {/* มากกว่า 2 ชิ้น → 2 คอลัมน์ (การ์ดไม่สูงเกินฉาก) */}
            {s.first.length > 0 && (
              <div className={`relative ${s.first.length > 2 ? 'w-[400px]' : 'w-[250px]'} overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/30 via-black/55 to-black/60 p-2.5 ring-1 ring-amber-300/40 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]`}>
                <span className="pointer-events-none absolute -left-6 -top-8 h-20 w-24 rounded-full bg-amber-400/30 blur-2xl" />
                <H icon={IC.trophy}>{T('รางวัลเคลียร์ครั้งแรก', 'First clear reward')}</H>
                <RewardList list={s.first} data={data} lang={lang} cols={s.first.length > 2 ? 2 : 1} />
              </div>
            )}
            <div className="w-[230px] rounded-xl bg-black/55 p-2.5 ring-1 ring-white/15 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
              <H>{T('รางวัลเคลียร์ด่าน', 'Clear reward')}</H>
              <ClearReward s={s} T={T} />
            </div>
          </div>
          {/* ป้อมศัตรูของด่าน (res/<tw>/<tw>-body.sam ท่า normal_idle) — ขวาสุดของฉาก ยืนบนพื้น */}
          {s.tower && (
            <SamLoop key={s.tower} base={`${s.tower}/${s.tower}-body`} clip="normal_idle"
              className="shrink-0 -mb-1 -mr-1 sm:-mr-2 w-[92px] h-[86px] sm:w-[130px] sm:h-[118px] lg:w-[140px] lg:h-[124px] drop-shadow-[0_4px_8px_rgba(0,0,0,0.55)]" />
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        {/* เคล็ดลับ (ข้อความเกม <stage>_tip — ส่วนใหญ่โหมด Hard) */}
        {s.tip && (
          <div className="flex items-start gap-2.5 rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-2.5">
            <GameIcon icon={IC.tip} className="w-9 h-9 -my-1 shrink-0" />
            <p className="text-[13px] leading-snug text-sky-50/90">
              <b className="mr-1 text-sky-200">{tx(data.ui.HARD_MODE_TIP_NM, lang) || T('เคล็ดลับ', 'Hint!')}</b>{tx(s.tip, lang)}
            </p>
          </div>
        )}

        {/* กลไก Extreme */}
        {(s.passive.length > 0 || s.active) && <Gimmicks s={s} data={data} lang={lang} T={T} />}

        {/* รางวัล */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {s.first.length > 0 && (
            <section className="lg:hidden relative overflow-hidden rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-400/[0.14] via-amber-400/[0.04] to-transparent p-3">
              <span className="pointer-events-none absolute -left-6 -top-6 h-20 w-24 rounded-full bg-amber-400/20 blur-2xl" />
              <H icon={IC.trophy}>{T('รางวัลเคลียร์ครั้งแรก', 'First clear reward')}</H>
              <RewardList list={s.first} data={data} lang={lang} />
            </section>
          )}
          <section className="lg:hidden rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <H>{T('รางวัลเคลียร์ด่าน', 'Clear reward')}</H>
            <ClearReward s={s} T={T} />
          </section>
          {s.drops.length > 0 && (
            <section className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:col-span-2 ${s.first.length ? 'md:col-span-2' : ''}`}>
              <H>{T('ของที่อาจได้รับ', 'Possible drops')}</H>
              <RewardGrid list={s.drops} data={data} lang={lang} />
            </section>
          )}
        </div>

        {/* ศัตรูตามช่วง */}
        <section>
          <H>{T('ศัตรู', 'Enemies')} · {s.enemyCount}</H>
          {err && <p className="text-sm text-rose-300">{T('โหลดศัตรูไม่ได้', 'Could not load enemies')}</p>}
          {!detail && !err && <EnemySkeleton />}
          {detail && (
            <ol className="space-y-3">
              {detail.waves.map((w, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold ring-1 ${TRIGGER_TONE[w.trigger] ?? TRIGGER_TONE.SPECIAL}`}>{i + 1}</span>
                    <span className={`material-icons-round text-[17px] ${(TRIGGER_TONE[w.trigger] ?? '').split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-300'}`}>{TRIGGER_ICON[w.trigger] ?? 'bolt'}</span>
                    <span className="min-w-0 flex-1 text-[13px] text-white">{triggerText(w, T)}</span>
                    {w.delay > 0 && <span className="shrink-0 text-[11px] text-gray-400">+{w.delay}{T(' วิ', 's')}</span>}
                    <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[11px] leading-5 text-gray-300 tabular-nums">{w.enemies.length}</span>
                  </div>
                  <EnemyList list={w.enemies} lang={lang} T={T} onEnemy={onEnemy} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function ClearReward({ s, T }: { s: MSStage; T: Tfn }) {
  return (
    <ul className="relative space-y-1.5 text-[13px]">
      <li className="flex items-center gap-2"><GameIcon icon={IC.coin} size={26} className="mx-[3px]" /><span className="flex-1 text-gray-300">{T('เหรียญ', 'Coin')}</span><span className="font-semibold text-white">{fmt(s.reward.coin)}</span></li>
      <li className="flex items-center gap-2"><GameIcon icon={IC.exp} size={26} className="mx-[3px]" /><span className="flex-1 text-gray-300">EXP</span><span className="font-semibold text-white">{fmt(s.reward.exp)}</span></li>
      <li className="flex items-center gap-2"><span className="w-8 text-center text-[10px] font-bold text-gray-400">UNIT</span><span className="flex-1 text-gray-300">{T('EXP เรนเจอร์', 'Ranger EXP')}</span><span className="font-semibold text-white">{fmt(s.reward.unitExp)}</span></li>
    </ul>
  )
}

function Gimmicks({ s, data, lang, T }: { s: MSStage; data: MainStageIndex; lang: L; T: Tfn }) {
  return (
    <section className="rounded-xl border border-orange-400/25 bg-gradient-to-br from-orange-500/[0.10] to-transparent p-3">
      <H>{T('กลไกของด่าน', 'Stage gimmicks')}</H>
      {s.passive.length > 0 && (
        <>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-200/70">{T('ตลอดทั้งด่าน', 'Always active')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {s.passive.map(g => {
              const gi = data.gimmicks[g.key]
              const f = gi?.factor
              return (
                <div key={g.key} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <GimmickIcon icon={gi?.icon} shape="square" fallback="warning" />
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-snug text-white">
                      {tx(gi?.title, lang)}
                      {f != null && f < 1 && <span className="ml-1.5 font-semibold text-rose-300">−{pct(1 - f)}</span>}
                      {f != null && f > 1 && <span className="ml-1.5 font-semibold text-rose-300">+{pct(f - 1)}</span>}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{tx(gi?.desc, lang)}</p>
                    <p className="mt-0.5 text-[10px] text-gray-500">{T('ค่าในเกม', 'Game value')} ×{f ?? '-'}{g.value != null ? ` · ${g.value}` : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {s.active && (
        <>
          <p className="mt-3 mb-1.5 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wider text-orange-200/70">
            {T('สุ่มใช้ระหว่างต่อสู้', 'Triggered during battle')}
            {s.active.start != null && <span className="normal-case tracking-normal font-normal text-gray-400">· {T(`เริ่มที่ ${s.active.start} วิ`, `starts at ${s.active.start}s`)}</span>}
            {s.active.cool != null && <span className="normal-case tracking-normal font-normal text-gray-400">· {T(`ทุก ${s.active.cool} วิ`, `every ${s.active.cool}s`)}</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {s.active.keys.map(k => {
              const gi = data.gimmicks[k]
              return (
                <div key={k} className="flex items-start gap-2.5 rounded-xl border border-orange-300/15 bg-black/20 p-2.5">
                  <GimmickIcon icon={gi?.icon} shape="round" fallback={ACTIVE_ICON[k.split('_')[2]] ?? 'bolt'} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-snug text-white">{tx(gi?.title, lang)}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{tx(gi?.desc, lang)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
const ACTIVE_ICON: Record<string, string> = { beast: 'pets', blizzard: 'ac_unit', hellfire: 'local_fire_department', storm: 'thunderstorm', tower: 'fort', unbeat: 'shield' }

/** ไอคอนกลไกในกรอบทองแบบหน้าต่างเข้าด่านของเกม (common_ui: entry_popup_gimmick_cover_on01 สี่เหลี่ยม / on02 วงกลม) */
function GimmickIcon({ icon, shape, fallback }: { icon: TIcon | null | undefined; shape: 'square' | 'round'; fallback: string }) {
  return (
    <span className="relative shrink-0 flex items-center justify-center w-12 h-12">
      {icon
        ? <GameIcon icon={icon} className={shape === 'round' ? 'w-[42px] h-[42px]' : 'w-[38px] h-[38px]'} />
        : <span className="material-icons-round text-[28px] text-orange-300">{fallback}</span>}
      <GameIcon icon={shape === 'round' ? IC.coverRound : IC.coverSquare} className="pointer-events-none absolute inset-0 w-full h-full" />
    </span>
  )
}

function H({ children, icon }: { children: React.ReactNode; icon?: TIcon }) {
  return (
    <h4 className="relative mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-gray-300">
      {icon && <GameIcon icon={icon} size={22} />}{children}
    </h4>
  )
}

function Chip({ icon, label, children }: { icon?: TIcon; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/45 pl-1 pr-2.5 h-7 text-[12.5px] text-white ring-1 ring-white/10 backdrop-blur" title={label} aria-label={label}>
      {icon && <GameIcon icon={icon} className="w-5 h-5" />}{children}
    </span>
  )
}

function ItemIcon({ icon, alt, className }: { icon: TIcon | null | undefined; alt: string; className: string }) {
  if (!icon) return <span className={`inline-flex items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10 ${className}`}><span className="material-icons-round text-[18px] text-gray-400">inventory_2</span></span>
  return <GameIcon icon={icon} alt={alt} className={className} />
}

function RewardList({ list, data, lang, cols = 1 }: { list: TReward[]; data: MainStageIndex; lang: L; cols?: 1 | 2 }) {
  return (
    <ul className={`relative text-[13px] ${cols === 2 ? 'grid grid-cols-2 gap-x-3 gap-y-1.5' : 'space-y-1.5'}`}>
      {list.map((r, i) => {
        const it = data.items[r.item]
        return (
          <li key={i} className="flex items-center gap-2">
            <ItemIcon icon={it?.icon} alt={tx(it?.name, lang)} className="w-9 h-9" />
            <span className="flex-1 min-w-0 truncate text-amber-50">{tx(it?.name, lang)}</span>
            <span className="font-[family-name:var(--font-line)] text-[15px] text-white">×{fmt(r.amount)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function RewardGrid({ list, data, lang }: { list: TReward[]; data: MainStageIndex; lang: L }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {list.map((r, i) => {
        const it = data.items[r.item]
        return (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-black/20 p-1.5 ring-1 ring-white/[0.06]" title={tx(it?.name, lang)}>
            <ItemIcon icon={it?.icon} alt={tx(it?.name, lang)} className="w-9 h-9 shrink-0" />
            <span className="min-w-0 flex-1 text-[12px] leading-tight text-gray-200 line-clamp-2">{tx(it?.name, lang)}</span>
            {r.amount > 1 && <span className="shrink-0 text-[12px] font-semibold text-white">×{fmt(r.amount)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

const respawn = (e: TEnemy) => (e.minSec === e.maxSec ? `${e.minSec}` : `${e.minSec}-${e.maxSec}`)
const short = (n: number) => (n >= 1e9 ? `${Math.round(n / 1e8) / 10}B` : n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e4 ? `${Math.round(n / 100) / 10}K` : fmt(n))

function EnemyList({ list, lang, T, onEnemy }: { list: MSEnemy[]; lang: L; T: Tfn; onEnemy: (e: TEnemy) => void }) {
  return (
    <>
      {/* มือถือ: การ์ด */}
      <ul className="sm:hidden divide-y divide-white/[0.06]">
        {list.map(e => (
          <li key={e.slot}>
            <button onClick={() => onEnemy(e)} className="w-full flex items-center gap-2.5 p-2 text-left active:bg-white/10">
              <GameIcon icon={thumbOf(e.unitCode)} className="w-11 h-11" />
              <span className="min-w-0 flex-1">
                <EnemyName e={e} lang={lang} />
                <span className="mt-1 grid grid-cols-4 gap-1 text-[10.5px] text-gray-400">
                  <span><b className="block text-[12px] font-semibold text-white">{short(e.hp)}</b>HP</span>
                  <span><b className="block text-[12px] font-semibold text-white">{short(Math.max(e.attack, e.specialAttack))}</b>{T('โจมตี', 'ATK')}</span>
                  <span><b className="block text-[12px] font-semibold text-white">{e.initDelay}{T('วิ', 's')}</b>{T('ออกแรก', 'First')}</span>
                  <span><b className="block text-[12px] font-semibold text-white">×{e.maxCount}</b>{T('สูงสุด', 'Max')}</span>
                </span>
              </span>
              <span className="material-icons-round text-gray-500">chevron_right</span>
            </button>
          </li>
        ))}
      </ul>
      {/* จอใหญ่: ตาราง */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-[11px] text-gray-400">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">{T('ศัตรู', 'Enemy')}</th>
              <th className="px-2 py-1.5 text-right font-medium">HP</th>
              <th className="px-2 py-1.5 text-right font-medium">{T('โจมตีกายภาพ', 'Phys ATK')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{T('โจมตีเวท', 'Magic ATK')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{T('ออกครั้งแรก', 'First')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{T('เกิดใหม่ทุก', 'Respawn')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{T('สูงสุด', 'Max')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.slot} onClick={() => onEnemy(e)} tabIndex={0} role="button" aria-label={tx(e.name, lang)}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEnemy(e) } }}
                className="border-t border-white/5 cursor-pointer transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400">
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <GameIcon icon={thumbOf(e.unitCode)} className="w-10 h-10" />
                    <EnemyName e={e} lang={lang} />
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-100">{fmt(e.hp)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">{e.attack ? fmt(e.attack) : '-'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">{e.specialAttack ? fmt(e.specialAttack) : '-'}</td>
                <td className="px-2 py-1.5 text-right text-gray-200">{e.initDelay}{T(' วิ', 's')}</td>
                <td className="px-2 py-1.5 text-right text-gray-200">{respawn(e)}{T(' วิ', 's')}</td>
                <td className="px-3 py-1.5 text-right text-gray-200">{fmt(e.maxCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function EnemyName({ e, lang }: { e: MSEnemy; lang: L }) {
  const el = ELEMENT_ICON[e.element?.toLowerCase()]
  return (
    <span className="min-w-0 block">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-[13.5px] text-white">{tx(e.name, lang)}</span>
        {e.unique && <span className="shrink-0 rounded bg-amber-400/85 px-1 text-[9.5px] font-bold leading-[1.5] text-black">UNIQUE</span>}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
        <span className="tabular-nums">Lv.{fmt(e.level)}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {TYPE_ICON[e.type] && <img src={TYPE_ICON[e.type]} alt={e.type} className="w-3.5 h-3.5" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {el && <img src={`/tierlist/el-${el}.png`} alt={e.element} className="w-3.5 h-3.5" />}
        {e.buff && <span className="rounded bg-rose-500/20 px-1 text-[10px] text-rose-200">{e.buff.type} +{fmt(e.buff.value)}</span>}
      </span>
    </span>
  )
}
