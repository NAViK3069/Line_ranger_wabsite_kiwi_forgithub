'use client'

// ====================================================
// วิดีโอสอนอัตราสุ่มของ "ตีปกติ" 3 ค่า (ฉากเดียวกับ skill-rates · ซ้าย = ตัวใส่เกียร์):
//   evade     อัตราการหลบหลีก   — Brown ตำนานร็อค ตีปกติใส่ Ares Cony (ใส่เกียร์หลบ): โดน / MISS
//   hit-rate  อัตราความแม่นยำ   — Brown ตำนานร็อค (ใส่เกียร์แม่นยำ) ตีปกติใส่ Ares Cony: โดน / MISS
//   elem-hit  ความแม่นยำธาตุ    — Brown ตำนานร็อค (แสง · ใส่ Candy Drum +10) ตีปกติใส่ Brown นักรบช้าง (มืด · ใส่เกียร์หลบเต็ม 99%)
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-skillrate-scene.cjs (ROLLS / EQUIP_AT ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ (0xd5d490): Evade Rate (AVD_PROB_MUL 0x0f) บวกตรงเข้า avoidProbability (UnitData 0xa30)
//                      Hit Rate (ANTI_AVD_PROB_MUL 0x19) บวกตรงเข้า antiAvoidProbability (UnitData 0xa70)
//   ตีปกติโดนไหม (UnitNode 0xced0e0 — เรียกจากดาเมจตีปกติ 0xcec3f4):
//     หลบ = min(MAX_AVOID_FACTOR 0.99, avoid + โบนัส + บัฟ)
//     โอกาสโดน % = (100 − หลบ%) × (1 + แม่นยำของผู้ตี [antiAvoid + โบนัส + บัฟ]) + โบนัสคู่ธาตุ × 100
//     โบนัสคู่ธาตุ (UnitNode 0xd076d8) = unit_elmt_cntrry.bas_atk_acc (ผู้ตี → เป้า) × (1 + Elemental Hit)
//       Elemental Hit (EHIT_MUL 0x21) = Basic ทุกชิ้น + Switchable ที่ตรงเงื่อนไขตัวสูงสุด (0x111d8c8) — ทุกเกียร์ในเกมมีแต่ใน Switchable (+6–10)
//       แสง → น้ำ 0.05 (ธาตุไม่ชนะทาง) · แสง → มืด 0.3 (ชนะทาง)
//     สุ่ม 1–100 ≤ โอกาสโดน → โดน · โอกาสโดน ≤ 0 → หลบโดยไม่สุ่ม · ไม่งั้น MISS (ป้าย ml_guild_raid_miss)
//   เกียร์ +5 = นับเฉพาะ Basic (Switchable ปลดล็อกที่ +6) · ความแม่นยำธาตุใช้เกียร์ +10 (Switchable เต็ม)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import { MissPop } from './battleui'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, switchableFor, useTutorialData,
  type GearKind, type RangerStats, type SlotGear, equipSlots,
} from './kit'
import { Wheel, skillHitChance } from './skill-rates'

export type NormalRateMode = 'evade' | 'hit-rate' | 'elem-hit'
type Tr = (th: string, en: string) => string

const ALLY = 'ak1zzx9ceu', ENEMY = 'a9ijjdi134'
/** เวลาในวิดีโอ — ตรงกับ build-skillrate-scene.cjs */
const ROLLS = [18.6, 23.0, 30.6, 35.0]
const SPIN = { from: 0.3, to: 1.9 }
const ACT = 2.1
const EQUIP_AT = 28.6
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], summary: [40.2, 48] } as const

interface GearDef { code: string; kind: GearKind; grade: number; en: string }
interface ModeCfg {
  scene: string
  type: string
  nameKey: string
  kind: 'evade' | 'hit' | 'elem'
  wearer: string
  other: string
  gears: GearDef[]
  /** เลเวลเกียร์ของตัวใส่ (+5 = Basic เต็ม · +10 = Switchable เต็ม) */
  level: number
  /** เกียร์หลบของอีกตัว (เป้า) — ความแม่นยำธาตุ: ให้เป้าหลบเต็มเพดาน */
  otherGears?: GearDef[]
  title: [string, string]
  /** bas_atk_acc ของคู่ธาตุ ผู้ตี → เป้า */
  pair: number
}
const EVADE_SET: GearDef[] = [
  { code: 'eq_ace_wpn_26', kind: 'weapon', grade: 6, en: "[AA]Godot's Mug" },
  { code: 'eq_amr_16metal', kind: 'armor', grade: 6, en: "[FA] Edward's Coat" },
  { code: 'eq_acc_0106', kind: 'acc', grade: 6, en: 'Glorious Tear Belt' },
]
const MODES: Record<NormalRateMode, ModeCfg> = {
  evade: {
    scene: 'evade', type: 'AVD_PROB_MUL', nameKey: 'GEAR_ATTR_AVD_PROB_MUL_nm', kind: 'evade', wearer: 'u1002e-cony', other: 'u1260e-brown',
    gears: EVADE_SET, level: GEAR_LEVEL, title: ['อัตราการหลบหลีก', 'Evade Rate'], pair: 0.05,
  },
  'hit-rate': {
    scene: 'hit-rate', type: 'ANTI_AVD_PROB_MUL', nameKey: 'GEAR_ATTR_ANTI_AVD_PROB_MUL_nm', kind: 'hit', wearer: 'u1260e-brown', other: 'u1002e-cony',
    // ไม่มีเกราะชิ้นไหนมี Hit Rate ใน Basic → ชุดสูงสุดมี 2 ชิ้น
    gears: [
      { code: 'eq_wpn_0067', kind: 'weapon', grade: 7, en: 'Azure Sky Wing Boomerang' },
      { code: 'eq_acc_evt_017', kind: 'acc', grade: 7, en: "Leonard's Delicate Device" },
    ],
    level: GEAR_LEVEL, title: ['อัตราความแม่นยำ', 'Hit Rate'], pair: 0.05,
  },
  'elem-hit': {
    scene: 'elem-hit', type: 'EHIT_MUL', nameKey: 'GEAR_ATTR_EHIT_MUL_nm', kind: 'elem', wearer: 'u1260e-brown', other: 'u1483e-brown',
    // Elemental Hit มีแต่ใน Switchable (เงื่อนไขธาตุผู้ใส่) → Candy Drum (แสง) +10 = 30% + 10% × 5 = 80%
    gears: [{ code: 'eq_2310_est_18', kind: 'acc', grade: 8, en: 'Candy Drum' }],
    level: 10, otherGears: EVADE_SET, title: ['ความแม่นยำธาตุ', 'Elemental Hit'], pair: 0.3,
  },
}

const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1002e-cony': 'Ares Cony', 'u1483e-brown': 'Elephant Soldier Brown' }
const f = Math.fround

type Stats = RangerStats & { rates: RangerStats['rates'] & { evadeRate?: number; hitRate?: number } }

async function loadData(mode: NormalRateMode) {
  const m = MODES[mode]
  const [wearer, other, ...gs] = await Promise.all([
    loadStats(m.wearer) as Promise<Stats>, loadStats(m.other) as Promise<Stats>,
    ...m.gears.map(g => loadGear(g.code, m.level)), ...(m.otherGears ?? []).map(g => loadGear(g.code)),
  ])
  const mine = gs.slice(0, m.gears.length), theirs = gs.slice(m.gears.length)
  const basicOf = (g: (typeof gs)[number]['gear'], type: string) =>
    g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const swLv = Math.max(0, Math.min(5, m.level - 5))   // Switchable ปลดล็อกที่ +6
  const per = mine.map(g => {
    const swEff = g.gear.switchable?.allEffects.some(o => o.effect.nameKey === m.nameKey) ? switchableFor(g.gear, m.nameKey, wearer) : null
    const sw = m.level > 5 && swEff?.switchableGrowth ? f(swEff.switchableGrowth.baseMax + swEff.switchableGrowth.unlimitStep * swLv) : 0
    return { basic: basicOf(g.gear, m.type), sw, swEff }
  })
  // Basic ทุกชิ้นบวกกัน + Switchable ตรงเงื่อนไขนับตัวสูงสุดตัวเดียว (มีผลเฉพาะ +6 ขึ้นไป)
  const total = per.reduce((s, p) => s + p.basic, 0) + Math.max(0, ...per.map(p => p.sw))
  const otherEvGear = theirs.reduce((s, x) => s + basicOf(x.gear, 'AVD_PROB_MUL'), 0)
  return { wearer, other, gears: mine.map(g => g.gear), per, total, otherEvGear }
}
type Data = Awaited<ReturnType<typeof loadData>>
type HitRes = ReturnType<typeof skillHitChance>
/** before / afterChance = % ผลดีของตัวใส่เกียร์ (หลบ = MISS · แม่นยำ = โดน) */
interface Nums { base: number; after: number; before: number; afterChance: number; b: HitRes; a: HitRes; hit: number; ev: number; pairB: number; pairA: number }
function numbers(mode: NormalRateMode, d: Data): Nums {
  const m = MODES[mode]
  if (m.kind === 'evade') {
    const ev = d.wearer.rates.evadeRate ?? 0, hit = d.other.rates.hitRate ?? 0
    const b = skillHitChance(ev, hit, m.pair), a = skillHitChance(f(ev) + f(d.total), hit, m.pair)
    return { base: ev, after: f(ev) + f(d.total), hit, ev, b, a, before: 100 - b.real, afterChance: 100 - a.real, pairB: m.pair, pairA: m.pair }
  }
  const ev = f(d.other.rates.evadeRate ?? 0) + f(d.otherEvGear), hit = d.wearer.rates.hitRate ?? 0
  if (m.kind === 'hit') {
    const b = skillHitChance(ev, hit, m.pair), a = skillHitChance(ev, f(hit) + f(d.total), m.pair)
    return { base: hit, after: f(hit) + f(d.total), hit, ev, b, a, before: b.real, afterChance: a.real, pairB: m.pair, pairA: m.pair }
  }
  const pairA = f(m.pair * f(1 + d.total))
  const b = skillHitChance(ev, hit, m.pair), a = skillHitChance(ev, hit, pairA)
  return { base: 0, after: d.total, hit, ev, b, a, before: b.real, afterChance: a.real, pairB: m.pair, pairA }
}

const pc = (v: number, dp = 1) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(dp)}%` }
const num = (v: number) => (Math.round(v * 100) / 100).toString()

export default function NormalRateTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: NormalRateMode }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = MODES[mode]
  const N = numbers(mode, d)
  const gearName = (i: number) => tGear(m.gears[i].code, m.gears[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const wearerName = tRanger(m.wearer, EN_NAMES[m.wearer] ?? m.wearer), otherName = tRanger(m.other, EN_NAMES[m.other] ?? m.other)
  const shown = d.gears[0]
  const tested = m.kind === 'elem' ? [] : shown.basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const slots = Object.fromEntries(m.gears.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade, level: m.level }])) as Partial<Record<GearKind, SlotGear>>
  const totalTxt = `+${pc(d.total)}`
  const labels = m.kind === 'evade'
    ? { good: T('หลบ (MISS)', 'Evade (MISS)'), bad: T('โดน', 'Hit'), goodRes: T('หลบได้! MISS', 'Evaded! MISS'), badRes: T('หลบไม่พ้น → โดน', 'Not evaded → hit') }
    : { good: T('โดน', 'Hit'), bad: 'MISS', goodRes: T('โดน!', 'Hit!'), badRes: T('พลาด → MISS', 'Missed → MISS') }

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rolls = ROLLS.map((start, k) => {
      const cue = c.scene.cues.find(x => x.id === `roll_${k}`) as { flash?: boolean } | undefined
      const ok = cue?.flash !== false   // โดน
      const hits = c.hitsOf(`roll_${k}`)
      return { start, k, after: k >= 2, ok, good: m.kind === 'evade' ? !ok : ok, hitAt: hits[0] ?? start + ACT + 1.5 }
    })
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T(m.title[0], m.title[1])} />
        <GearCard t={t} T={T} gear={shown} icon={gearIconUrl(m.gears[0].code)} name={gearName(0)} effName={effName}
          switchable={d.per[0].swEff} kind={m.gears[0].kind} grade={m.gears[0].grade} tested={tested}
          testSwitchable={m.kind === 'elem'} level={m.level} />

        <RangerCard T={T} r={d.wearer} name={wearerName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<RangerRows mode={mode} t={t} T={T} N={N} otherName={otherName} />}
          slots={<GearSlots t={t} />} />

        <FormulaCard mode={mode} t={t} T={T} N={N} optName={optName} totalTxt={totalTxt} />

        <EquipSetCard t={t} T={T} m={m} names={m.gears.map((_, i) => gearName(i))} per={d.per} totalTxt={totalTxt} slots={slots}
          optName={optName} before={N.before} after={N.afterChance} goodLabel={labels.good} />

        {rolls.map(r => (
          <RollUi key={r.k} c={c} T={T} kind={m.kind} r={r} chance={(r.after ? N.afterChance : N.before) / 100} labels={labels} lang={lang} />
        ))}

        <Summary mode={mode} t={t} T={T} N={N} rolls={rolls} labels={labels} optName={optName} totalTxt={totalTxt} wearerName={wearerName} otherName={otherName} />
      </>
    )
  }
  return <ScenePlayer src={`/gear-options/scenes/${m.scene}.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

// ── แถวในการ์ดเรนเจอร์ ──
function RangerRows({ mode, t, T, N, otherName }: { mode: NormalRateMode; t: number; T: Tr; N: Nums; otherName: string }) {
  const k = MODES[mode].kind
  if (k === 'evade') return <>
    <StatRow t={t} label={T('อัตราหลบหลีก', 'Evade rate')} value={pc(N.base)} hlAt={8.6} note={T('ค่าเดิมของเรนเจอร์', 'Base value')} />
    <StatRow t={t} label={T('ผู้ตี: ความแม่นยำ', 'Attacker: hit rate')} value={pc(N.hit)} hlAt={9.6} note={otherName} />
    <StatRow t={t} label={T('โอกาสหลบได้', 'Evade chance')} value={`${N.before}%`} dim />
  </>
  if (k === 'hit') return <>
    <StatRow t={t} label={T('ความแม่นยำ', 'Hit rate')} value={pc(N.base)} hlAt={8.6} note={T('ค่าเดิมของเรนเจอร์', 'Base value')} />
    <StatRow t={t} label={T('เป้า: อัตราหลบหลีก', 'Target: evade rate')} value={pc(N.ev)} hlAt={9.6} note={otherName} />
    <StatRow t={t} label={T('โอกาสโดน', 'Hit chance')} value={`${N.before}%`} dim />
  </>
  return <>
    <StatRow t={t} label={T('ธาตุ', 'Element')} value={T('แสง → มืด', 'Light → Dark')} hlAt={8.6} note={T(`ชนะทาง · โบนัสความแม่นยำคู่ธาตุ ${pc(N.pairB)}`, `Advantage · element pair hit bonus ${pc(N.pairB)}`)} />
    <StatRow t={t} label={T('เป้า: อัตราหลบหลีก', 'Target: evade rate')} value={`${pc(N.ev)} → 99%`} hlAt={9.6} note={T(`${otherName} ใส่เกียร์หลบเต็ม (สูงสุด 99%)`, `${otherName} in full evade gear (max 99%)`)} />
    <StatRow t={t} label={T('โอกาสโดน', 'Hit chance')} value={`${N.before}%`} dim />
  </>
}

// ── การ์ดสูตร ──
function FormulaCard({ mode, t, T, N, optName, totalTxt }: { mode: NormalRateMode; t: number; T: Tr; N: Nums; optName: string; totalTxt: string }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const k = MODES[mode].kind
  const a = TL.formula[0]
  const box = 'rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3'
  const gold = 'rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3'
  const P = (v: number) => num(v * 100)
  const line = (r: HitRes, hit: number, pair: number) => `(100 − ${pc(r.evadeCapped)}) × ${num(1 + hit)} + ${P(pair)} = ${r.raw.toFixed(1)}`
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">
        {k === 'evade' ? T('เกมสุ่มหลบตีปกติแบบนี้', 'How the game rolls an evade') : k === 'hit' ? T('เกมสุ่มว่าตีปกติโดนไหมแบบนี้', 'How the game rolls a normal hit') : T('ความแม่นยำธาตุทำงานแบบนี้', 'How Elemental Hit works')}
      </span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[26px] font-black text-white">{T('หลบ', 'Evade')} = {T('อัตราหลบหลีกของเป้า', "target's evade rate")} <span className="text-rose-300">({T('สูงสุด 99%', 'max 99%')})</span></span></Fit1>
        <Fit1 className="text-center mt-1"><span className="text-[29px] font-black text-amber-200">{T('โอกาสโดน', 'Hit chance')} = (100% − {T('หลบ', 'evade')}) × (1 + {T('ความแม่นยำผู้ตี', "attacker's hit rate")}) + {T('โบนัสคู่ธาตุ', 'element pair bonus')}</span></Fit1>
        {k === 'elem'
          ? <Fit1 className="text-center mt-1"><span className="text-[27px] font-black text-fuchsia-200">{T('โบนัสคู่ธาตุ', 'Element pair bonus')} = {T('ค่าในตารางธาตุ', 'element table value')} × (1 + {optName})</span></Fit1>
          : null}
        <div className="mt-1 text-center text-[19px] font-bold text-gray-300 text-balance">
          {k === 'elem'
            ? T('ตารางธาตุ: ชนะทาง 30% · คู่อื่นๆ ส่วนใหญ่ 5% · สุ่มเลข 1–100 ได้ไม่เกินโอกาสโดน = โดน · เกิน = MISS', 'Element table: advantage 30% · most other pairs 5% · roll 1–100 · at or below the hit chance = hit · above = MISS')
            : T(`โบนัสคู่ธาตุ แสง → น้ำ = ${P(N.pairB)}% (ตารางธาตุของเกม) · สุ่มเลข 1–100 · ได้ไม่เกินโอกาสโดน = โดน · เกิน = MISS`, `Light → Water pair bonus = ${P(N.pairB)}% (game element table) · roll 1–100 · at or below the hit chance = hit · above = MISS`)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{line(N.b, N.hit, N.pairB)}</span></Fit1>
          <div className="text-[40px] font-black text-white leading-tight">{T('โดน', 'Hit')} {N.b.real}%</div></div>
        <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">
            {k === 'evade' ? `${T('หลบ', 'evade')} ${pc(N.after)} → 99% · ${line(N.a, N.hit, N.pairA)}`
              : k === 'hit' ? line(N.a, N.after, N.pairA)
                : `(100 − 99%) × ${num(1 + N.hit)} + ${P(N.pairB)} × ${num(1 + N.after)} = ${N.a.raw.toFixed(1)}`}
          </span></Fit1>
          <div className="text-[40px] font-black text-amber-300 leading-tight">{T('โดน', 'Hit')} {N.a.real}%</div></div>
      </div>
      <div className="mt-3 text-center text-[20px] font-black text-sky-300 text-balance" style={step(t, a + 2.8)}>
        {k === 'evade' ? T('หลบได้สูงสุด 99% เสมอ แต่ผู้ตีที่แม่นยำสูงยังคูณโอกาสโดนขึ้นได้', 'Evade tops out at 99%, and an accurate attacker still multiplies the hit chance up')
          : k === 'hit' ? T('ความแม่นยำคูณโอกาสโดน — เกิน 100% เมื่อไหร่ ตีปกติพลาดไม่ได้อีกเลย', 'Hit rate multiplies the hit chance — once it passes 100%, normal attacks can no longer miss')
            : T('ความแม่นยำธาตุขยายแค่โบนัสคู่ธาตุ — เห็นผลชัดเมื่อเป้าหลบเกือบเต็ม และตีชนะทางธาตุ', 'Elemental Hit only boosts the element pair bonus — it matters most against high-evade targets you beat on element')}
      </div>
    </FitCard>
  )
}

// ── การ์ดใส่เกียร์ ──
function EquipSetCard({ t, T, m, names, per, totalTxt, slots, optName, before, after, goodLabel }: {
  t: number; T: Tr; m: ModeCfg; names: string[]; per: Data['per']; totalTxt: string; slots: Partial<Record<GearKind, SlotGear>>
  optName: string; before: number; after: number; goodLabel: string
}) {
  const s = span(t, TL.equip[0], TL.equip[1], 0.4, 0.35)
  if (!s.on) return null
  const at = EQUIP_AT
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, TL.equip[0] + 0.15 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(m.gears[i].code)} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n} +{m.level}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">+{pc(per[i].basic + per[i].sw)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName} {T('รวม', 'total')}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-1 text-right text-[22px] font-bold text-gray-300 tabular-nums">
        {goodLabel} {before}% → <span className="text-amber-300 font-black">{after}%</span>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={equipSlots(slots, at)} />
      </div>
    </FitCard>
  )
}

// ── วงล้อสุ่ม + ผล + ป้าย MISS ──
type Roll = { start: number; k: number; after: boolean; ok: boolean; good: boolean; hitAt: number }
type Labels = { good: string; bad: string; goodRes: string; badRes: string }
const LAND = [0.62, 0.38, 0.55, 0.7]

function RollUi({ c, T, kind, r, chance, labels, lang }: { c: OverlayCtx; T: Tr; kind: ModeCfg['kind']; r: Roll; chance: number; labels: Labels; lang: string }) {
  const t = c.t
  const st = r.start
  const vis = span(t, st, st + 4.2, 0.25, 0.3)
  const gDeg = Math.max(0, Math.min(1, chance)) * 360
  const theta = r.good ? gDeg * LAND[r.k] : gDeg + (360 - gDeg) * LAND[r.k]
  const rot = (360 * 5 - theta) * (1 - Math.pow(1 - prog(t, st + SPIN.from, st + SPIN.to), 3))
  const landed = t >= st + SPIN.to
  const goodColor: [string, string] = kind === 'evade' ? ['#7dd3fc', '#0284c7'] : ['#fde047', '#d97706']
  const badColor: [string, string] = kind === 'evade' ? ['#fb7185', '#be123c'] : ['#94a3b8', '#475569']
  const res = span(t, st + SPIN.to, st + 4.2, 0.2, 0.3)
  const targetId = kind === 'evade' ? ALLY : ENEMY
  const goodPct = Math.round(chance * 100)
  const chip = (color: [string, string], txt: string) => (
    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/65">
      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${color[0]}, ${color[1]})` }} />
      <span className="text-[17px] font-black text-white whitespace-nowrap">{txt}</span>
    </div>
  )
  return (
    <>
      {vis.on && (
        <div className="absolute left-1/2 top-[12px] -translate-x-1/2 flex flex-col items-center" style={{ opacity: vis.alpha }}>
          <div className="px-3 py-0.5 rounded-lg bg-black/70 text-[16px] font-bold text-gray-200 whitespace-nowrap">
            {r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · {T(`สุ่มครั้งที่ ${(r.k % 2) + 1}`, `Roll ${(r.k % 2) + 1}`)}
          </div>
          <div className="mt-3">
            <Wheel chance={chance} rot={rot} goodColor={goodColor} badColor={badColor} scale={easeOutBack(Math.min(1, (t - st) / 0.3))}
              center={`${goodPct}%`} sub={labels.good} />
          </div>
          <div className="mt-2 flex gap-2">
            {chip(goodColor, `${labels.good} ${goodPct}%`)}
            {chip(badColor, `${labels.bad} ${100 - goodPct}%`)}
          </div>
          {landed && res.on && (
            <div className={`mt-2 px-4 py-1.5 rounded-xl border-2 text-center ${r.good ? 'bg-emerald-600/95 border-emerald-200/70' : 'bg-slate-700/95 border-white/25'}`}
              style={{ opacity: res.alpha, transform: `scale(${easeOutBack(prog(t, st + SPIN.to, st + SPIN.to + 0.3))})` }}>
              <span className="text-[19px] font-black text-white whitespace-nowrap">{r.good ? labels.goodRes : labels.badRes}</span>
            </div>
          )}
        </div>
      )}
      {!r.ok && <MissPop c={c} actorId={targetId} at={r.hitAt} lang={lang} />}
    </>
  )
}

// ── สรุป ──
function Summary({ mode, t, T, N, rolls, labels, optName, totalTxt, wearerName, otherName }: {
  mode: NormalRateMode; t: number; T: Tr; N: Nums; rolls: Roll[]; labels: Labels; optName: string; totalTxt: string; wearerName: string; otherName: string
}) {
  const S = TL.summary[0]
  const m = MODES[mode]
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const rows = [{ label: T('ไม่ใส่เกียร์', 'No gear'), v: N.before }, { label: `${optName} ${totalTxt}`, v: N.afterChance }]
  const capHit = skillHitChance(0.99, N.after, m.pair)
  const note = m.kind === 'evade'
    ? T(`หลบได้สูงสุด 99% · ยังโดนได้ ${N.a.real}% เพราะผู้ตีแม่นยำ ${pc(N.hit)} คูณเป็น (100 − 99) × ${num(1 + N.hit)} + คู่ธาตุ ${num(m.pair * 100)} = ${N.a.raw.toFixed(1)}`, `Evade caps at 99% · you can still be hit ${N.a.real}% of the time: the attacker's ${pc(N.hit)} hit rate and the element pair make it (100 − 99) × ${num(1 + N.hit)} + ${num(m.pair * 100)} = ${N.a.raw.toFixed(1)}`)
    : m.kind === 'hit'
      ? T(`ความแม่นยำคูณโอกาสโดน (ไม่ใช่บวก) · เป้าที่หลบเต็ม 99% ยังโดนแค่ (100 − 99) × ${num(1 + N.after)} + ${num(m.pair * 100)} = ${capHit.raw.toFixed(1)} → ${capHit.real}%`, `Hit rate multiplies (not adds) · against a target at the 99% evade cap it is only (100 − 99) × ${num(1 + N.after)} + ${num(m.pair * 100)} = ${capHit.raw.toFixed(1)} → ${capHit.real}%`)
      : T(`ความแม่นยำธาตุคูณโบนัสคู่ธาตุ ${num(m.pair * 100)}% × ${num(1 + N.after)} = ${num(N.pairA * 100)}% · คู่ธาตุไม่ชนะทาง (5%) ได้แค่ ${num(5 * (1 + N.after))}% · มีแต่ใน Switchable จึงต้องอัปเกียร์ +6 ขึ้นไป และธาตุผู้ใส่ต้องตรงเงื่อนไข`, `Elemental Hit multiplies the ${num(m.pair * 100)}% pair bonus × ${num(1 + N.after)} = ${num(N.pairA * 100)}% · on a non-advantage pair (5%) it only reaches ${num(5 * (1 + N.after))}% · it only exists as a Switchable, so the gear needs +6 or more and the wearer's element must match`)
  const title = m.kind === 'evade' ? T(`โอกาสที่ ${wearerName} หลบได้`, `${wearerName}'s chance to evade`)
    : m.kind === 'hit' ? T(`โอกาสที่ ${wearerName} ตีโดน`, `Chance ${wearerName} lands a hit`)
      : T(`โอกาสที่ ${wearerName} ตีโดน ${otherName} (หลบ 99%)`, `Chance ${wearerName} hits ${otherName} (99% evade)`)
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330} title={title}>
      {rows.map((row, i) => (
        <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
          <div className="flex justify-between items-baseline text-[26px]">
            <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
            <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>{Math.round(row.v * bar(S + 0.5 + i * 0.5))}%</span>
          </div>
          <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`} style={{ width: `${row.v * bar(S + 0.5 + i * 0.5)}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, TL.summary[1], 0.5, 0.6))}>
        {[false, true].map(after => (
          <div key={String(after)} className={`rounded-2xl border-2 p-3 text-center ${after ? 'bg-[#2a1f08] border-amber-400/50' : 'bg-white/[0.05] border-white/10'}`}>
            <div className="text-[20px] text-gray-300 font-bold">{T('ผลสุ่มในคลิป', 'Rolls in this clip')} · {after ? T('ใส่เกียร์', 'gear') : T('ไม่ใส่', 'no gear')}</div>
            <div className="mt-2 flex justify-center gap-3">
              {rolls.filter(r => r.after === after).map(r => (
                <span key={r.k} className={`px-3 py-1 rounded-lg text-[20px] font-black ${r.good ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-gray-100'}`}>{r.good ? labels.good : labels.bad}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
        {note}
      </div>
      <div className="mt-2 text-center text-[18px] text-gray-500">
        {m.level > 5
          ? T(`เกียร์ +${m.level} (Switchable เต็ม) · ใช้ได้เฉพาะผู้ใส่ธาตุแสง`, `Gear +${m.level} (full Switchable) · works only for Light wearers`)
          : T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · ชุด ${optName} สูงสุดที่ใส่ได้จริง`, `Gear +${GEAR_LEVEL} (Basic only) · the highest real ${optName} set`)}
      </div>
    </SummaryShell>
  )
}

export const EvadeTutorial = ({ autoPlay }: { autoPlay: boolean }) => <NormalRateTutorial autoPlay={autoPlay} mode="evade" />
export const HitRateTutorial = ({ autoPlay }: { autoPlay: boolean }) => <NormalRateTutorial autoPlay={autoPlay} mode="hit-rate" />
export const ElemHitTutorial = ({ autoPlay }: { autoPlay: boolean }) => <NormalRateTutorial autoPlay={autoPlay} mode="elem-hit" />
