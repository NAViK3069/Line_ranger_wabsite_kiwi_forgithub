'use client'

// ====================================================
// /infinity-tower — หอคอยอนันต์ (โหมด endless ของเกม) ทุกชั้น จากข้อมูลเกมของเรา
//   ข้อมูล: /api/infinity-tower (ทุกชั้น) + /api/infinity-tower/<floor> (ศัตรูรายชั้น — โหลดตอนกางชั้น)
//   ที่มา/กติกาของข้อมูล: src/lib/infinityTower.ts
//
// ยังไม่มีปุ่มพามาหน้านี้ (กำลังทำ) — ไม่อยู่ใน sitemap และบอก Google ไม่ให้เก็บ
// ?f=300 → เปิดแล้วเลื่อนไปชั้น 300 และกางรายละเอียดให้เลย
// ====================================================

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch } from '@/lib/staticApi'
import type { TBattle, TEnemy, TFloor, TowerIndex, TText, TReward } from '@/lib/infinityTower'
import { GameIcon } from './atlas'

type L = 'en' | 'th'
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const tx = (t: TText | undefined, lang: L) => (t ? t[lang] || t.en : '')
const fillD = (s: string, v: number | null) => (v == null ? s : s.replace('%d', fmt(v)))

/** สีตามประเภทด่าน (ป้าย/ขอบ) */
const BATTLE_TONE: Record<TBattle, string> = {
  OFFENCE: 'from-sky-500/25 to-sky-500/5 border-sky-400/30 text-sky-200',
  TIMEATTACK: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/30 text-emerald-200',
  SIEGE: 'from-amber-500/25 to-amber-500/5 border-amber-400/30 text-amber-200',
  BOSS: 'from-rose-500/30 to-rose-500/5 border-rose-400/40 text-rose-200',
}
const ELEMENT_ICON: Record<string, string> = { fire: 'fire', water: 'water', tree: 'wood', wood: 'wood', light: 'light', dark: 'dark' }
const TYPE_ICON: Record<string, string> = { STR: '/gacha/images/Str.png', AGI: '/gacha/images/Agi.png', INT: '/gacha/images/Int.png' }

export default function InfinityTowerPage() {
  const { lang: siteLang, tStat } = useLanguage()
  const lang = siteLang as L
  const T = (th: string, en: string) => (lang === 'th' ? th : en)

  const [data, setData] = useState<TowerIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<TBattle | 'ALL'>('ALL')
  const [desc, setDesc] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [jump, setJump] = useState('')
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

  // ?f=<ชั้น> → กางชั้นนั้นแล้วเลื่อนไปหา
  const goTo = (no: number, smooth = true) => {
    if (!data) return
    const f = data.floors.find(x => x.no === no)
    if (!f) return
    setFilter('ALL')
    setOpen(s => new Set(s).add(f.code))
    const go = (behavior: ScrollBehavior) => document.getElementById(f.code)?.scrollIntoView({ behavior, block: 'start' })
    requestAnimationFrame(() => requestAnimationFrame(() => go(smooth ? 'smooth' : 'auto')))
    // รูปไอคอนโหลดตามมาทีหลังแล้วดันหน้าเลื่อน → เลื่อนซ้ำอีกครั้งตอนรูปนิ่งแล้ว
    setTimeout(() => go('auto'), smooth ? 900 : 700)
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

  const toggle = (code: string) => setOpen(s => {
    const n = new Set(s)
    if (n.has(code)) n.delete(code); else n.add(code)
    return n
  })

  const towerName = T('หอคอยอนันต์', 'Infinity Tower')

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <span className="text-white/20">|</span>
          <span className="material-icons-round text-fuchsia-300 text-xl">castle</span>
          <span className="text-sm font-bold text-white truncate">{towerName}</span>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6">
        {/* ── หัวหน้า: เรื่องราวของโหมด (ข้อความเกม) ── */}
        <section className="relative overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-[#2a0f4a] via-[#1d0b36] to-[#0f0620] p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-64 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <GameIcon icon={{ atlas: 'main', frame: 'endless_main_tower_boss.png' }} className="w-44 sm:w-56 h-24 sm:h-[118px] drop-shadow-[0_8px_24px_rgba(217,70,239,0.35)]" />
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-line)] text-2xl sm:text-3xl text-white tracking-wide">{towerName}</h1>
              {data && (
                <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-fuchsia-100/80">
                  {tx(data.ui.INFINITY_TOWER_STORY_01, lang)} {tx(data.ui.INFINITY_TOWER_STORY_02, lang)}
                </p>
              )}
              {data && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-white">{fmt(data.floors.length)} {T('ชั้น', 'floors')}</span>
                  {(Object.keys(data.battles) as TBattle[]).map(b => (
                    <span key={b} className={`rounded-full border bg-gradient-to-r px-2.5 py-1 ${BATTLE_TONE[b]}`}>
                      {tx(data.battles[b].title, lang)}{b === 'TIMEATTACK' ? ' ⏱' : ''} · {counts[b] ?? 0}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── ตัวกรอง / ไปชั้น ── */}
        {data && (
          <div className="sm:sticky top-12 z-30 -mx-3 sm:mx-0 mt-4 px-3 sm:px-0 py-2 bg-[#120720]/90 backdrop-blur-md sm:rounded-xl">
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]">
              <FilterChip on={filter === 'ALL'} onClick={() => setFilter('ALL')}>{T('ทั้งหมด', 'All')}</FilterChip>
              {(Object.keys(data.battles) as TBattle[]).map(b => (
                <FilterChip key={b} on={filter === b} onClick={() => setFilter(b)}>
                  <GameIcon icon={data.battles[b].icon} size={18} />
                  {tx(data.battles[b].title, lang)}{b === 'TIMEATTACK' ? ' ⏱' : ''}
                </FilterChip>
              ))}
              <div className="flex-1" />
              <form className="flex shrink-0 items-center gap-1" onSubmit={e => { e.preventDefault(); const n = parseInt(jump, 10); if (n) goTo(n) }}>
                <input value={jump} onChange={e => setJump(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric"
                  placeholder={T('ไปชั้น…', 'Go to floor…')} aria-label={T('ไปชั้น', 'Go to floor')}
                  className="w-28 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-fuchsia-400/60 focus:outline-none" />
                <button type="submit" className="rounded-lg bg-fuchsia-500/80 hover:bg-fuchsia-500 px-2.5 py-1.5 text-sm font-semibold text-white">{T('ไป', 'Go')}</button>
              </form>
              <button onClick={() => setDesc(v => !v)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-white/10"
                aria-label={T('สลับลำดับชั้น', 'Reverse floor order')}>
                <span className="material-icons-round text-base">{desc ? 'south' : 'north'}</span>
                {desc ? T('บนลงล่าง', 'Top down') : T('ล่างขึ้นบน', 'Bottom up')}
              </button>
            </div>
          </div>
        )}

        {failed && <p className="mt-10 text-center text-rose-300">{T('โหลดข้อมูลหอคอยไม่ได้', 'Could not load the tower data')}</p>}
        {!data && !failed && (
          <div className="mt-10 flex justify-center text-gray-400"><span className="material-icons-round animate-spin">autorenew</span></div>
        )}

        {/* ── ชั้นทั้งหมด ── */}
        {data && (
          <ol className="mt-3 space-y-3">
            {floors.map(f => (
              <FloorRow key={f.code} f={f} data={data} lang={lang} T={T} open={open.has(f.code)} onToggle={() => toggle(f.code)} onEnemy={setEnemy} />
            ))}
          </ol>
        )}
      </main>

      {enemy && <EnemyPopup e={enemy} lang={lang} T={T} onClose={() => setEnemy(null)} />}
    </div>
  )
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-fuchsia-400/70 bg-fuchsia-500/25 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}>
      {children}
    </button>
  )
}

// ── ป้ายชั้น: ประตูหอคอยของเกม + เลขชั้นกลางวง ──
function Gate({ f, data }: { f: TFloor; data: TowerIndex }) {
  const boss = f.battle === 'BOSS'
  return (
    <div className="relative w-full aspect-[328/174]">
      <GameIcon icon={data.battles[f.battle].gate} className="absolute inset-0 w-full h-full" fit="contain" />
      <span className={`absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full aspect-square w-[30%] min-w-[38px]
        border-2 shadow-[0_0_18px_rgba(0,0,0,0.6)] ${boss ? 'border-rose-300/80 bg-[radial-gradient(circle_at_40%_35%,#ff6a6a,#9b0f1f_70%)]' : 'border-indigo-200/70 bg-[radial-gradient(circle_at_40%_35%,#8f7bff,#2b1a7a_70%)]'}`}>
        <span className="font-[family-name:var(--font-line)] text-white text-[clamp(13px,2.4vw,20px)] leading-none drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">{f.no}</span>
      </span>
    </div>
  )
}

function RewardBadge({ r, data, lang, size = 40 }: { r: TReward; data: TowerIndex; lang: L; size?: number }) {
  const item = data.items[r.item]
  return (
    <span className="inline-flex items-center gap-1.5" title={tx(item?.name, lang)}>
      <GameIcon icon={item?.icon} size={size} alt={tx(item?.name, lang)} />
      <span className="font-[family-name:var(--font-line)] text-white text-sm drop-shadow-[0_1px_0_rgba(0,0,0,0.8)]">
        {item?.type === 'COIN' ? fmt(r.amount) : `×${fmt(r.amount)}`}
      </span>
    </span>
  )
}

function FloorRow({ f, data, lang, T, open, onToggle, onEnemy }: {
  f: TFloor; data: TowerIndex; lang: L; T: (th: string, en: string) => string
  open: boolean; onToggle: () => void; onEnemy: (e: TEnemy) => void
}) {
  const b = data.battles[f.battle]
  const item = f.reward.item ? data.items[f.reward.item.item] : null
  const floorLabel = fillD(tx(data.ui.ENDLESS_FLOOR_NUMBER, lang), f.no)
  return (
    <li id={f.code} className="scroll-mt-28">
      <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2 sm:gap-3 items-start">
        <button onClick={onToggle} aria-label={floorLabel} className="hidden sm:block rounded-xl border border-white/10 bg-[#171225] p-1.5 sm:p-2 hover:border-fuchsia-400/40 transition-colors">
          <Gate f={f} data={data} />
        </button>

        <div className={`rounded-xl border bg-[#171225]/95 overflow-hidden transition-colors ${open ? 'border-fuchsia-400/40' : 'border-white/10'}`}>
          <button onClick={onToggle} aria-expanded={open} className="w-full text-left grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,168px))] hover:bg-white/[0.02]">
            {/* รางวัลผ่านชั้น + ประเภทด่าน */}
            <div className="flex items-center gap-3 p-2.5 sm:p-3 min-w-0">
              <div className="sm:hidden shrink-0 w-[76px]"><Gate f={f} data={data} /></div>
              <div className="flex flex-col items-center shrink-0 w-[48px] sm:w-[56px]">
                <GameIcon icon={item?.icon} size={48} alt={tx(item?.name, lang)} />
                {f.reward.item && <span className="font-[family-name:var(--font-line)] text-white text-xs -mt-1 drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]">{item?.type === 'COIN' ? '' : '×'}{fmt(f.reward.item.amount)}</span>}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-r px-2 py-0.5 text-[11px] ${BATTLE_TONE[f.battle]}`}>
                    <GameIcon icon={b.icon} size={14} />{tx(data.names[f.name], lang)}
                  </span>
                  <span className="text-[11px] text-gray-500">{floorLabel}</span>
                </div>
                <p className="mt-1 font-[family-name:var(--font-line)] text-[15px] sm:text-base text-white leading-snug">{tx(b.desc, lang)}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                  <span className="inline-flex items-center gap-1"><GameIcon icon={{ atlas: 'popup', frame: 'pop_gift_icon_03.png' }} size={14} />×{f.needHeart}</span>
                  {f.timeLimit != null && <span className="inline-flex items-center gap-0.5"><span className="material-icons-round text-[13px]">timer</span>{f.timeLimit}{T(' วิ', 's')}</span>}
                  {f.saveCount != null && <span className="inline-flex items-center gap-0.5"><span className="material-icons-round text-[13px]">groups</span>{T('ช่วย', 'Rescue')} {f.saveCount}</span>}
                  {f.boss && <span className="inline-flex items-center gap-0.5 text-rose-300"><span className="material-icons-round text-[13px]">skull</span>{tx(f.boss.name, lang)}</span>}
                  {f.gimmicks.length > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      {f.gimmicks.map(g => <GameIcon key={g.key} icon={data.gimmicks[g.key]?.icon} size={16} alt={tx(data.gimmicks[g.key]?.title, lang)} />)}
                    </span>
                  )}
                </div>
              </div>
              <span className={`material-icons-round ml-auto text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
            </div>

            {/* ภารกิจ 3 ข้อ */}
            {f.missions.map(m => {
              const md = data.missions[m.code]
              return (
                <div key={m.no} className="border-t lg:border-t-0 lg:border-l border-white/10 p-2.5 flex lg:flex-col gap-2 lg:gap-1.5 items-center lg:items-stretch">
                  <div className="flex items-center justify-between gap-2 shrink-0 lg:shrink">
                    <GameIcon icon={md?.icon} size={38} alt={m.code} />
                    <RewardBadge r={m.reward} data={data} lang={lang} size={32} />
                  </div>
                  <p className="text-[12px] leading-snug text-gray-200 lg:text-center min-w-0">{fillD(tx(md?.text, lang), m.value)}</p>
                </div>
              )
            })}
          </button>

          {open && <FloorDetail f={f} data={data} lang={lang} T={T} onEnemy={onEnemy} />}
        </div>
      </div>
    </li>
  )
}

function FloorDetail({ f, data, lang, T, onEnemy }: {
  f: TFloor; data: TowerIndex; lang: L; T: (th: string, en: string) => string; onEnemy: (e: TEnemy) => void
}) {
  const [enemies, setEnemies] = useState<TEnemy[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    apiFetch(`/api/infinity-tower/${f.code}`).then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { enemies: TEnemy[] }) => { if (live) setEnemies(d.enemies) }).catch(() => { if (live) setErr(true) })
    return () => { live = false }
  }, [f.code])

  const item = f.reward.item ? data.items[f.reward.item.item] : null
  return (
    <div className="border-t border-white/10 bg-black/20 p-3 sm:p-4 space-y-4">
      {/* กลไก */}
      {f.gimmicks.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-200/80">{tx(data.ui.ENDLESS_GIMMICK, lang)}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {f.gimmicks.map(g => {
              const gi = data.gimmicks[g.key]
              return (
                <div key={g.key} className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <GameIcon icon={gi?.icon} size={40} />
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {tx(gi?.title, lang)}
                      {g.value != null && <span className="ml-1.5 font-semibold text-rose-300">−{pct(1 - g.value)}</span>}
                    </p>
                    <p className="text-[11px] leading-snug text-gray-400">{tx(gi?.desc, lang)}</p>
                    {g.value != null && <p className="text-[10px] text-gray-500 mt-0.5">{T('ค่าในเกม', 'Game value')} ×{g.value}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* รางวัลผ่านชั้น + ข้อมูลด่าน */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-200/80">{tx(data.ui.ENDLESS_ENTRY_ACQUIRABLE_REWARD, lang)}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-200">
            {f.reward.item && (
              <span className="inline-flex items-center gap-1.5">
                <GameIcon icon={item?.icon} size={36} />
                <span>{tx(item?.name, lang)} ×{fmt(f.reward.item.amount)}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1"><GameIcon icon={{ atlas: 'popup', frame: 'pop_gift_icon_02.png' }} size={22} />{fmt(f.reward.coin)}</span>
            <span className="inline-flex items-center gap-1"><GameIcon icon={{ atlas: 'popup', frame: 'pop_gift_icon_09.png' }} size={22} />{fmt(f.reward.exp)}</span>
            <span className="inline-flex items-center gap-1 text-gray-400">{T('EXP เรนเจอร์', 'Ranger EXP')} {fmt(f.reward.unitExp)}</span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-200/80">{T('ข้อมูลด่าน', 'Stage info')}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <Info k={T('ใช้ขนนก', 'Feathers')} v={`×${f.needHeart}`} />
            {f.timeLimit != null && <Info k={T('เวลาจำกัด', 'Time limit')} v={`${f.timeLimit} ${T('วินาที', 'sec')}`} />}
            {f.saveCount != null && <Info k={T('ชาวเมืองที่ต้องช่วย', 'Citizens to rescue')} v={fmt(f.saveCount)} />}
            {f.sally && <Info k={T('ชาวเมืองโผล่ทุก', 'Citizens appear every')} v={`${f.sally[0]}–${f.sally[1]} ${T('วินาที', 'sec')}`} />}
            {f.distance != null && <Info k={T('ระยะสนาม', 'Field length')} v={fmt(f.distance)} />}
            {f.enemyTowerHp != null && <Info k={T('HP ฐานศัตรู', 'Enemy base HP')} v={fmt(f.enemyTowerHp)} />}
            {f.boss && <Info k={T('บอส', 'Boss')} v={tx(f.boss.name, lang)} />}
            {f.boss?.moveTime != null && <Info k={T('บอสย้ายเลนทุก', 'Boss changes lane every')} v={`${f.boss.moveTime} ${T('วินาที', 'sec')}`} />}
            {f.boss?.backRate != null && <Info k={T('บอสถอยกลับ', 'Boss knock-back rate')} v={pct(f.boss.backRate)} />}
          </dl>
        </div>
      </section>

      {/* ศัตรู */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-200/80">{T('ศัตรู', 'Enemies')} · {f.enemyCount}</h3>
        {err && <p className="text-sm text-rose-300">{T('โหลดศัตรูไม่ได้', 'Could not load enemies')}</p>}
        {!enemies && !err && <div className="py-4 flex justify-center text-gray-500"><span className="material-icons-round animate-spin">autorenew</span></div>}
        {enemies && (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="bg-white/[0.05] text-[11px] text-gray-400">
                <tr>
                  <th className="px-2.5 py-2 text-left font-medium">{T('ศัตรู', 'Enemy')}</th>
                  <th className="px-2.5 py-2 text-left font-medium">{T('ออกครั้งแรก', 'First spawn')}</th>
                  <th className="px-2.5 py-2 text-left font-medium">{T('เกิดใหม่ทุก', 'Respawn every')}</th>
                  <th className="px-2.5 py-2 text-left font-medium">{T('จำนวนสูงสุด', 'Max count')}</th>
                  <th className="px-2.5 py-2 text-right font-medium">{T('รายละเอียด', 'Details')}</th>
                </tr>
              </thead>
              <tbody>
                {enemies.map(e => (
                  <tr key={e.slot} className={`border-t border-white/5 ${e.boss ? 'bg-rose-500/[0.07]' : ''}`}>
                    <td className="px-2.5 py-1.5">
                      <span className="flex items-center gap-2">
                        <GameIcon icon={{ url: `https://rangers.lerico.net/res/${e.unitCode}/${e.unitCode}-thum.png` }} className="w-9 h-9" />
                        <span className="min-w-0">
                          <span className="block text-white truncate">{tx(e.name, lang)}{e.boss && <span className="ml-1.5 rounded bg-rose-500/80 px-1 text-[10px] font-bold">{tx(data.ui.ENDLESS_TIP_BOSS_ICON, lang)}</span>}</span>
                          <span className="flex items-center gap-1 mt-0.5">
                            {TYPE_ICON[e.type] && <SmallImg src={TYPE_ICON[e.type]} alt={e.type} />}
                            {ELEMENT_ICON[e.element] && <SmallImg src={`/tierlist/el-${ELEMENT_ICON[e.element]}.png`} alt={e.element} />}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-200">{e.initDelay}{T(' วิ', 's')}</td>
                    <td className="px-2.5 py-1.5 text-gray-200">{e.minSec === e.maxSec ? e.minSec : `${e.minSec}–${e.maxSec}`}{T(' วิ', 's')}</td>
                    <td className="px-2.5 py-1.5 text-gray-200">{fmt(e.maxCount)}</td>
                    <td className="px-2.5 py-1.5 text-right">
                      <button onClick={() => onEnemy(e)} className="rounded-md bg-indigo-500/80 hover:bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white">{T('ดู', 'View')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/** ไอคอนเล็กของเว็บ (ชนิด / ธาตุ) */
function SmallImg({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-3.5 w-3.5" />
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-gray-400">{k}</dt>
      <dd className="text-white text-right sm:text-left">{v}</dd>
    </>
  )
}

function EnemyPopup({ e, lang, T, onClose }: { e: TEnemy; lang: L; T: (th: string, en: string) => string; onClose: () => void }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  const rows: [string, string][] = [
    ['HP', fmt(e.hp)],
    [T('พลังโจมตีกายภาพ', 'Physical ATK'), fmt(e.attack)],
    [T('พลังโจมตีเวท', 'Magic ATK'), fmt(e.specialAttack)],
    [T('ป้องกันกายภาพ', 'Physical DEF'), fmt(e.defence)],
    [T('ป้องกันเวท', 'Magic DEF'), fmt(e.specialDefence)],
    [T('ระยะโจมตี', 'Attack range'), fmt(e.range)],
    [T('ระยะกระจาย', 'Splash range'), fmt(e.splash)],
    [T('โอกาสคริติคอล', 'Crit rate'), pct(e.critRate)],
    [T('ตัวคูณคริติคอล', 'Crit multiplier'), `×${e.critRatio}`],
    [T('หลบการโจมตี', 'Evade'), pct(e.avoid)],
    // ค่าที่ไม่ใช่สัดส่วน 0–1 เสมอ (เช่น antiAvoid 19, skillAvoid 2) แสดงตามตารางเกมตรงๆ ไม่แปลงเป็น %
    [T('หลบสกิล', 'Skill evade'), String(e.skillAvoid)],
    [T('ต้านทานสกิล', 'Skill resistance'), pct(e.skillResist)],
    [T('ความแม่นยำ', 'Accuracy'), String(e.antiAvoid)],
    [T('ความแม่นยำสกิล', 'Skill accuracy'), String(e.antiSkillAvoid)],
    [T('เลเวลศัตรู', 'Enemy level'), String(e.level)],
    [T('ออกครั้งแรก', 'First spawn'), `${e.initDelay} ${T('วินาที', 'sec')}`],
    [T('เกิดใหม่ทุก', 'Respawn every'), `${e.minSec === e.maxSec ? e.minSec : `${e.minSec}–${e.maxSec}`} ${T('วินาที', 'sec')}`],
    [T('จำนวนสูงสุด', 'Max count'), fmt(e.maxCount)],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-fuchsia-400/30 bg-[#1b1030] shadow-2xl" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <GameIcon icon={{ url: `https://rangers.lerico.net/res/${e.unitCode}/${e.unitCode}-thum.png` }} className="w-14 h-14" />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-line)] text-lg text-white truncate">{tx(e.name, lang)}</p>
            <p className="text-[11px] text-gray-500">{e.unitCode}</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white" aria-label={T('ปิด', 'Close')}>
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 p-4 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-gray-400">{k}</dt>
              <dd className="text-right font-medium text-white tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="px-4 pb-4 text-[11px] text-gray-500">{T('ค่าจากตาราง endless_product_line ของเกม', 'Values from the game table endless_product_line')}</p>
      </div>
    </div>
  )
}
