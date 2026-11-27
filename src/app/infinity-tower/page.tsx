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
import { useEffect, useMemo, useRef, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch } from '@/lib/staticApi'
import type { TBattle, TEnemy, TFloor, TIcon, TowerIndex, TText, TReward } from '@/lib/infinityTower'
import { GameIcon } from './atlas'

// canvas + โหลดไฟล์ .sam → ฝั่ง browser เท่านั้น
const TowerGate = dynamic(() => import('./TowerGate'), { ssr: false })

type L = 'en' | 'th'
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const tx = (t: TText | undefined, lang: L) => (t ? t[lang] || t.en : '')
const fillD = (s: string, v: number | null) => (v == null ? s : s.replace('%d', fmt(v)))

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
const TONE: Record<TBattle, { chip: string; ring: string; num: string }> = {
  OFFENCE: { chip: 'bg-sky-500/15 border-sky-400/40 text-sky-200', ring: 'border-sky-400/25', num: 'from-sky-300 to-indigo-500' },
  TIMEATTACK: { chip: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200', ring: 'border-emerald-400/25', num: 'from-emerald-300 to-teal-600' },
  SIEGE: { chip: 'bg-amber-500/15 border-amber-400/40 text-amber-200', ring: 'border-amber-400/25', num: 'from-amber-300 to-orange-600' },
  BOSS: { chip: 'bg-rose-500/15 border-rose-400/50 text-rose-200', ring: 'border-rose-400/35', num: 'from-rose-300 to-red-700' },
}
const ELEMENT_ICON: Record<string, string> = { fire: 'fire', water: 'water', tree: 'wood', wood: 'wood', light: 'light', dark: 'dark' }
const TYPE_ICON: Record<string, string> = { STR: '/gacha/images/Str.png', AGI: '/gacha/images/Agi.png', INT: '/gacha/images/Int.png' }
const thumbOf = (code: string): TIcon => ({ url: `https://rangers.lerico.net/res/${code}/${code}-thum.png` })

type Tfn = (th: string, en: string) => string

export default function InfinityTowerPage() {
  const { lang: siteLang, tStat } = useLanguage()
  const lang = siteLang as L
  const T: Tfn = (th, en) => (lang === 'th' ? th : en)

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
  const battleLabel = (b: TBattle) => data ? `${tx(data.battles[b].title, lang)}${b === 'TIMEATTACK' ? ' ⏱' : ''}` : ''

  return (
    <div className="min-h-screen pb-16 bg-[radial-gradient(120%_60%_at_50%_0%,#2a0d4d_0%,#12061f_55%,#0b0414_100%)]">
      <header className="sticky top-0 z-40 bg-[#14071f]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors" aria-label={tStat('Back')}>
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <GameIcon icon={IC.star} size={20} />
          <span className="font-[family-name:var(--font-line)] text-[15px] text-white truncate">{towerName}</span>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>

        {/* ตัวกรอง — มือถือ: แถวเดียวเลื่อนข้าง · จอใหญ่: ตัดบรรทัด */}
        {data && (
          <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-3 px-3 sm:mx-0 sm:px-0">
              <Chip on={filter === 'ALL'} onClick={() => setFilter('ALL')}>{T('ทั้งหมด', 'All')} <b className="opacity-60 font-normal">{data.floors.length}</b></Chip>
              {(Object.keys(data.battles) as TBattle[]).map(b => (
                <Chip key={b} on={filter === b} onClick={() => setFilter(b)}>
                  <GameIcon icon={data.battles[b].icon} size={18} />{battleLabel(b)} <b className="opacity-60 font-normal">{counts[b] ?? 0}</b>
                </Chip>
              ))}
              <span className="w-px h-5 bg-white/10 shrink-0 mx-0.5" />
              <button onClick={() => setDesc(v => !v)} aria-label={T('สลับลำดับชั้น', 'Reverse floor order')}
                className="shrink-0 flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 h-8 text-xs text-gray-200 active:bg-white/15">
                <span className="material-icons-round text-[16px]">{desc ? 'south' : 'north'}</span>
                <span className="whitespace-nowrap">{desc ? T('บนลงล่าง', 'Top down') : T('ล่างขึ้นบน', 'Bottom up')}</span>
              </button>
              <form className="shrink-0 flex items-center" onSubmit={e => { e.preventDefault(); const n = parseInt(jump, 10); if (n) goTo(n) }}>
                <input value={jump} onChange={e => setJump(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" enterKeyHint="go"
                  placeholder={T('ชั้น', 'Floor')} aria-label={T('ไปชั้น', 'Go to floor')}
                  className="w-16 h-8 rounded-l-full border border-white/10 bg-white/5 pl-3 pr-1 text-xs text-white placeholder:text-gray-500 focus:border-fuchsia-400/60 focus:outline-none" />
                <button type="submit" className="h-8 rounded-r-full bg-fuchsia-500 active:bg-fuchsia-600 px-3 text-xs font-semibold text-white">{T('ไป', 'Go')}</button>
              </form>
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
              <h1 className="font-[family-name:var(--font-line)] text-[22px] sm:text-3xl text-white leading-tight">{towerName}</h1>
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
        {!data && !failed && (
          <div className="mt-10 flex justify-center text-gray-400"><span className="material-icons-round animate-spin">autorenew</span></div>
        )}

        {data && (
          <ol className="mt-3 space-y-2.5 sm:space-y-3">
            {floors.map(f => (
              <FloorCard key={f.code} f={f} data={data} lang={lang} T={T} open={open.has(f.code)} onToggle={() => toggle(f.code)} onEnemy={setEnemy} />
            ))}
          </ol>
        )}
      </main>

      {enemy && <EnemySheet e={enemy} lang={lang} T={T} onClose={() => setEnemy(null)} />}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`shrink-0 flex items-center gap-1 whitespace-nowrap rounded-full border px-3 h-8 text-xs sm:text-sm transition-colors ${on ? 'border-fuchsia-400/70 bg-fuchsia-500/25 text-white' : 'border-white/10 bg-white/5 text-gray-300 active:bg-white/15 sm:hover:bg-white/10'}`}>
      {children}
    </button>
  )
}

/** ประตูชั้น (อนิเมชันเกม) + เลขชั้น */
function Gate({ f, open }: { f: TFloor; open: boolean }) {
  return (
    <div className="relative aspect-[328/197] w-full">
      <TowerGate battle={f.battle} open={open} />
      <span className={`absolute left-1/2 -bottom-[8%] -translate-x-1/2 rounded-full bg-gradient-to-b ${TONE[f.battle].num} px-2 min-w-[2.4em] text-center
        font-[family-name:var(--font-line)] text-white text-[13px] sm:text-[15px] leading-[1.45] shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-white/30`}>
        {f.no}
      </span>
    </div>
  )
}

function Amount({ r, data }: { r: TReward; data: TowerIndex }) {
  const it = data.items[r.item]
  return <>{it?.type === 'COIN' ? fmt(r.amount) : `×${fmt(r.amount)}`}</>
}

function FloorCard({ f, data, lang, T, open, onToggle, onEnemy }: {
  f: TFloor; data: TowerIndex; lang: L; T: Tfn; open: boolean; onToggle: () => void; onEnemy: (e: TEnemy) => void
}) {
  const b = data.battles[f.battle]
  const clear = f.reward.item ? data.items[f.reward.item.item] : null
  return (
    <li id={f.code} className="scroll-mt-28">
      <article className={`rounded-2xl border bg-[#181026]/95 overflow-hidden transition-colors ${open ? 'border-fuchsia-400/45 shadow-[0_0_0_1px_rgba(217,70,239,0.15),0_10px_30px_rgba(0,0,0,0.35)]' : TONE[f.battle].ring}`}>
        <button onClick={onToggle} aria-expanded={open} className="block w-full text-left active:bg-white/[0.03] sm:hover:bg-white/[0.02]">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,176px))]">
            {/* ── ส่วนหัว: ประตู + ประเภทด่าน + รางวัลผ่านชั้น ── */}
            <div className="flex gap-3 p-3">
              <div className="w-[104px] sm:w-[140px] shrink-0 pt-1 pb-3"><Gate f={f} open={open} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none ${TONE[f.battle].chip}`}>
                    <GameIcon icon={b.icon} size={14} />{tx(data.names[f.name], lang)}
                  </span>
                  <span className={`material-icons-round ml-auto text-gray-500 text-xl transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
                <p className="mt-1.5 font-[family-name:var(--font-line)] text-[15px] sm:text-[17px] leading-snug text-white">{tx(b.desc, lang)}</p>

                {/* ข้อมูลย่อ (ไอคอนเกม) */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Meta icon={IC.feather} label={T('ใช้ขนนก', 'Feathers')}>×{f.needHeart}</Meta>
                  {f.timeLimit != null && <Meta icon={IC.timer} label={T('เวลาจำกัด', 'Time limit')}>{f.timeLimit}{T(' วิ', 's')}</Meta>}
                  {f.saveCount != null && <Meta icon={IC.sally} label={T('ชาวเมืองที่ต้องช่วย', 'Citizens to rescue')}>{f.saveCount}</Meta>}
                  {f.boss && <Meta icon={IC.boss} label={T('บอส', 'Boss')} tone="text-rose-200">{tx(f.boss.name, lang)}</Meta>}
                  {f.gimmicks.map(g => (
                    <GameIcon key={g.key} icon={data.gimmicks[g.key]?.icon} size={22} alt={tx(data.gimmicks[g.key]?.title, lang)} className="rounded" />
                  ))}
                </div>

                {/* รางวัลผ่านชั้น */}
                {f.reward.item && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400/10 to-transparent px-2 py-1">
                    <GameIcon icon={IC.trophy} size={20} />
                    <GameIcon icon={clear?.icon} size={30} alt={tx(clear?.name, lang)} />
                    <span className="min-w-0 truncate text-[12px] text-amber-100">{tx(clear?.name, lang)}</span>
                    <span className="ml-auto font-[family-name:var(--font-line)] text-[13px] text-white"><Amount r={f.reward.item} data={data} /></span>
                  </div>
                )}
              </div>
            </div>

            {/* ── ภารกิจ 3 ข้อ — มือถือ: แถวละข้อ · จอใหญ่: 3 คอลัมน์แบบในเกม ── */}
            {f.missions.map(m => {
              const md = data.missions[m.code], it = data.items[m.reward.item]
              return (
                <div key={m.no} className="flex lg:flex-col items-center lg:items-stretch gap-2.5 lg:gap-1.5 border-t lg:border-t-0 lg:border-l border-white/[0.07] px-3 py-2 lg:p-2.5">
                  <GameIcon icon={md?.icon} size={36} alt={m.code} className="lg:self-center" />
                  <p className="flex-1 min-w-0 text-[12.5px] leading-snug text-gray-200 lg:text-center lg:order-last">{fillD(tx(md?.text, lang), m.value)}</p>
                  <span className="shrink-0 flex items-center gap-1 lg:justify-center" title={tx(it?.name, lang)}>
                    <GameIcon icon={it?.icon} size={28} alt={tx(it?.name, lang)} />
                    <span className="font-[family-name:var(--font-line)] text-[13px] text-white"><Amount r={m.reward} data={data} /></span>
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
}

function Meta({ icon, label, children, tone = 'text-gray-200' }: { icon: TIcon; label: string; children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-black/30 pl-0.5 pr-2 h-6 text-[11.5px] ${tone}`} title={label} aria-label={label}>
      <GameIcon icon={icon} size={20} />{children}
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
        {!enemies && !err && <div className="py-4 flex justify-center text-gray-500"><span className="material-icons-round animate-spin">autorenew</span></div>}
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
                    <th className="px-3 py-2 text-right font-medium">{T('รายละเอียด', 'Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {enemies.map(e => (
                    <tr key={e.slot} className={`border-t border-white/5 ${e.boss ? 'bg-rose-500/[0.07]' : ''}`}>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <GameIcon icon={thumbOf(e.unitCode)} className="w-10 h-10" />
                          <EnemyName e={e} data={data} lang={lang} />
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-200">{e.initDelay}{T(' วิ', 's')}</td>
                      <td className="px-3 py-1.5 text-gray-200">{respawn(e)}{T(' วิ', 's')}</td>
                      <td className="px-3 py-1.5 text-gray-200">{fmt(e.maxCount)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => onEnemy(e)} className="rounded-lg bg-indigo-500/80 hover:bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">{T('ดู', 'View')}</button>
                      </td>
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

/** ค่าพลังศัตรู — มือถือ: แผ่นเลื่อนขึ้นจากล่าง · จอใหญ่: กล่องกลางจอ */
function EnemySheet({ e, lang, T, onClose }: { e: TEnemy; lang: L; T: Tfn; onClose: () => void }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  const groups: [string, [string, string][]][] = [
    [T('สเตตัส', 'Stats'), [
      ['HP', fmt(e.hp)],
      [T('พลังโจมตีกายภาพ', 'Physical ATK'), fmt(e.attack)],
      [T('พลังโจมตีเวท', 'Magic ATK'), fmt(e.specialAttack)],
      [T('ป้องกันกายภาพ', 'Physical DEF'), fmt(e.defence)],
      [T('ป้องกันเวท', 'Magic DEF'), fmt(e.specialDefence)],
      [T('ระยะโจมตี', 'Attack range'), fmt(e.range)],
      [T('ระยะกระจาย', 'Splash range'), fmt(e.splash)],
    ]],
    [T('โอกาส', 'Rates'), [
      [T('โอกาสคริติคอล', 'Crit rate'), pct(e.critRate)],
      [T('ตัวคูณคริติคอล', 'Crit multiplier'), `×${e.critRatio}`],
      [T('หลบการโจมตี', 'Evade'), pct(e.avoid)],
      [T('ต้านทานสกิล', 'Skill resistance'), pct(e.skillResist)],
      // ค่าที่ไม่ใช่สัดส่วน 0–1 เสมอ (เช่น antiAvoid 19, skillAvoid 2) แสดงตามตารางเกมตรงๆ ไม่แปลงเป็น %
      [T('หลบสกิล', 'Skill evade'), String(e.skillAvoid)],
      [T('ความแม่นยำ', 'Accuracy'), String(e.antiAvoid)],
      [T('ความแม่นยำสกิล', 'Skill accuracy'), String(e.antiSkillAvoid)],
    ]],
    [T('การเกิด', 'Spawning'), [
      [T('เลเวลศัตรู', 'Enemy level'), String(e.level)],
      [T('ออกครั้งแรก', 'First spawn'), `${e.initDelay} ${T('วินาที', 'sec')}`],
      [T('เกิดใหม่ทุก', 'Respawn every'), `${respawn(e)} ${T('วินาที', 'sec')}`],
      [T('จำนวนสูงสุด', 'Max count'), fmt(e.maxCount)],
    ]],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-fuchsia-400/30 bg-[#1b1030] shadow-2xl pb-[env(safe-area-inset-bottom)]" onClick={ev => ev.stopPropagation()}>
        <div className="sticky top-0 bg-[#1b1030]/95 backdrop-blur border-b border-white/10">
          <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
          <div className="flex items-center gap-3 p-4 pt-3 sm:pt-4">
            <GameIcon icon={thumbOf(e.unitCode)} className="w-14 h-14" />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-line)] text-lg text-white truncate">{tx(e.name, lang)}</p>
              <p className="text-[11px] text-gray-500">{e.unitCode}</p>
            </div>
            <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-gray-400 active:bg-white/10 sm:hover:bg-white/10 hover:text-white" aria-label={T('ปิด', 'Close')}>
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {groups.map(([title, rows]) => (
            <section key={title}>
              <H>{title}</H>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-400">{k}</dt>
                    <dd className="text-right font-medium text-white tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-[11px] text-gray-500">{T('ค่าจากตาราง endless_product_line ของเกม', 'Values from the game table endless_product_line')}</p>
        </div>
      </div>
    </div>
  )
}
