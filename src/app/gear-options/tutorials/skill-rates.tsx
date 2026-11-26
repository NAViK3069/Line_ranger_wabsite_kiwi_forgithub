'use client'

// ====================================================
// วิดีโอสอนอัตราแบบสุ่ม 3 ค่า (ฉากเดียวกัน · ซ้าย = ตัวใส่เกียร์):
//   skill-use   อัตราการใช้ทักษะ       — Brown ตำนานร็อค ตี Brown อนูบิสเพชฌฆาต: ติด = ร่ายทักษะ · ไม่ติด = ตีปกติ
//   skill-evade อัตราการหลบทักษะ       — Brown ตำนานร็อค ยิงทักษะใส่ Ares Cony (ใส่เกียร์หลบ): โดน / MISS
//   skill-hit   อัตราความแม่นยำทักษะ    — Brown ตำนานร็อค (ใส่เกียร์แม่นยำ) ยิงทักษะใส่ Ares Cony: โดน / MISS
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-skillrate-scene.cjs (ROLLS / EQUIP_AT ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   ใช้ทักษะ: ทุกครั้งที่ถึงจังหวะโจมตี สุ่มทักษะทีละตัว · โอกาส = probability ของทักษะ + Skill Use Rate (บวกตรงเข้า probability)
//     ≥ 95% → 95% (เพดาน) · ตัดเศษเป็น % · สุ่ม 0–99 < โอกาส และต้องพ้นเวลารอทักษะ → ร่ายทักษะ · ไม่ติด → ตีปกติ
//   หลบ / แม่นยำทักษะ: หลบ = min(99% [MAX_SKILL_AVOID_FACTOR], หลบทักษะ + Skill Evade Rate)
//     โอกาสโดน % = (100 − หลบ%) × (1 + แม่นยำทักษะของผู้ยิง [antiSkillAvoidProb + Skill Hit Rate]) + โบนัสคู่ธาตุ × 100
//       โบนัสคู่ธาตุ = unit_elmt_cntrry.ski_atk_acc (ผู้ยิง → เป้า) × (1 + ความแม่นยำธาตุ) — UnitNode 0x4a0 (แสง → น้ำ = 0.05)
//     สุ่ม 1–100 ≤ โอกาสโดน → โดน · ไม่งั้น MISS (ป้าย ml_guild_raid_miss: ยืดสูง 1.8 → 1 ใน 0.13 วิ · ค้าง 0.4 · จาง 0.3)
//   ผลแต่ละรอบอ่านจากคิวในฉาก (roll_<k>): ใช้ทักษะ = ท่า s_attack · MISS = flash ปิด · ตัวเลขทั้งหมดคำนวณสดจากข้อมูลเกม
// ====================================================

import { useId } from 'react'
import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import { MissPop } from './battleui'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, switchableFor, useTutorialData,
  type GearKind, type RangerStats, type SlotGear,
} from './kit'

export type RateMode = 'skill-use' | 'skill-evade' | 'skill-hit'
type Tr = (th: string, en: string) => string

const ALLY = 'ak1zzx9ceu', ENEMY = 'a9ijjdi134'
/** เวลาในวิดีโอ — ROLLS / EQUIP_AT ตรงกับ build-skillrate-scene.cjs */
const ROLLS = [18.6, 23.0, 30.6, 35.0]
const SPIN = { from: 0.3, to: 1.9 }
const ACT = 2.1
const EQUIP_AT = 28.6
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], summary: [40.2, 48] } as const

interface GearDef { code: string; kind: GearKind; grade: number; en: string; sw?: boolean }
interface ModeCfg {
  scene: string
  type: string        // reinforceType ของเกียร์
  nameKey: string     // ชื่อออพชั่น (ใช้หา Switchable ที่ตรงเงื่อนไข)
  wearer: string      // ตัวใส่เกียร์ (ซ้าย)
  other: string       // อีกตัว (ขวา)
  gears: GearDef[]    // ชุด +5 ที่ค่ารวมสูงสุดตามกฎเกม (ค้นทุกเกียร์ในเกม · ตัดไอเทมทดสอบ [TST])
  shown: number       // การ์ดเกียร์ตอนต้น
  title: [string, string]
  /** โบนัสความแม่นยำของคู่ธาตุ ผู้ยิง → เป้า (unit_elmt_cntrry.ski_atk_acc × (1 + ความแม่นยำธาตุ) — UnitNode 0x4a0) · บวก ×100 เข้าโอกาสโดน */
  pair?: number
}
const MODES: Record<RateMode, ModeCfg> = {
  'skill-use': {
    scene: 'skill-use', type: 'SKL_PROB_MUL', nameKey: 'GEAR_ATTR_SKL_PROB_MUL_nm', wearer: 'u1260e-brown', other: 'u1242e-brown',
    gears: [
      { code: 'eq_wpn_26metal', kind: 'weapon', grade: 6, en: "[FA] Edward's Spear" },
      { code: 'eq_amr_06sf', kind: 'armor', grade: 6, en: "[SF]Ryu's Wear" },
      { code: 'eq_acc_est_0072', kind: 'acc', grade: 7, en: 'Brown Keychain of Light', sw: true },
    ],
    shown: 0, title: ['อัตราการใช้ทักษะ', 'Skill Use Rate'],
  },
  'skill-evade': {
    scene: 'skill-evade', type: 'SKLAVD_PROB_MUL', nameKey: 'GEAR_ATTR_SKLAVD_PROB_MUL_nm', wearer: 'u1002e-cony', other: 'u1260e-brown',
    gears: [
      { code: 'eq_wpn_sleg_008', kind: 'weapon', grade: 8, en: 'Awakening Axe' },
      { code: 'eq_2204_amr_17', kind: 'armor', grade: 7, en: "[RoR] Thor's Gloves", sw: true },
      { code: 'eq_acc_06sf', kind: 'acc', grade: 6, en: "[SF]Ryu's Headband" },
    ],
    shown: 2, title: ['อัตราการหลบทักษะ', 'Skill Evade Rate'], pair: 0.05,   // แสง → น้ำ
  },
  'skill-hit': {
    scene: 'skill-hit', type: 'ANTI_SKLAVD_PROB_MUL', nameKey: 'GEAR_ATTR_ANTI_SKLAVD_PROB_MUL_nm', wearer: 'u1260e-brown', other: 'u1002e-cony',
    // ไม่ใช้เกียร์ที่มี "อัตราโจมตีโดนแน่นอนของทักษะ" (CLN_SKLAVD) ใน Basic — กันสับสน (ค่ารวมเท่ากับชุดที่มี: 88.4%)
    gears: [
      { code: 'eq_2609_wpn_39', kind: 'weapon', grade: 9, en: '12.5th Anniv Star Harp' },
      { code: 'eq_amr_0087', kind: 'armor', grade: 7, en: 'Azure Sky Wing Gloves', sw: true },
      { code: 'eq_acc_est_28', kind: 'acc', grade: 8, en: "Sally's Binoculars" },
    ],
    shown: 0, title: ['อัตราความแม่นยำของทักษะ', 'Skill Hit Rate'], pair: 0.05,   // แสง → น้ำ
  },
}

/** ชื่ออังกฤษ (ภาษาไทยมาจากไฟล์ภาษาของเกม — tRanger คืนค่านี้ตอนเป็นภาษาอังกฤษ) */
const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1242e-brown': 'Executor Anubis Brown', 'u1002e-cony': 'Ares Cony' }

// ── สูตรเกม (float32 แบบเกม) ──
const f = Math.fround
/** โอกาสใช้ทักษะ (จำนวนเต็ม %) — ≥ 0.95 → 95 · ไม่งั้นตัดเศษ (0xd38934) */
export function skillUseChance(p: number): number {
  const v = f(p)
  if (v >= f(0.95)) return 95
  const n = Math.trunc(f(v * 100))
  return n < 1 ? 0 : n
}
/** หลบ (หลังเพดาน 99%) และโอกาสโดน (ดิบ % · จริง % ที่สุ่ม 1–100 ได้) (0xd01fd8) · pair = โบนัสคู่ธาตุ (บวก ×100) */
export function skillHitChance(evade: number, hit: number, pair = 0) {
  const e = Math.min(f(0.99), f(evade))
  const raw = f(f(f(100 - f(e * 100)) * f(1 + hit)) + f(pair * 100))
  const real = raw <= 0 ? 0 : Math.min(100, Math.floor(raw + 1e-6))
  return { evadeCapped: e, raw, real }
}

type Stats = RangerStats & { rates: RangerStats['rates'] & { skillEvadeRate?: number; skillHitRate?: number }; skills: (RangerStats['skills'][number] & { probability?: number; cooldown?: number })[] }

async function loadData(mode: RateMode) {
  const m = MODES[mode]
  const [wearer, other, ...gs] = await Promise.all([loadStats(m.wearer) as Promise<Stats>, loadStats(m.other) as Promise<Stats>, ...m.gears.map(g => loadGear(g.code))])
  const per = gs.map((g, i) => {
    const basic = g.gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
    const swEff = m.gears[i].sw ? switchableFor(g.gear, m.nameKey, wearer) : null
    return { basic, sw: swEff?.switchableGrowth?.baseMax ?? 0, swEff }
  })
  // Basic ทุกชิ้นบวกกัน + Switchable ตรงเงื่อนไขนับตัวสูงสุดตัวเดียว
  const total = per.reduce((s, p) => s + p.basic, 0) + Math.max(0, ...per.map(p => p.sw))
  const skill = wearer.skills[0]
  return { wearer, other, gears: gs.map(g => g.gear), per, total, skill }
}
type Data = Awaited<ReturnType<typeof loadData>>

type HitRes = ReturnType<typeof skillHitChance>
/** ตัวเลขก่อน / หลังใส่เกียร์ (before / afterChance = % ที่ตัวใส่เกียร์ได้ผลดี) · b / a = โอกาสโดนก่อน / หลัง (โหมดหลบ / แม่นยำ) */
interface Nums { base: number; after: number; before: number; afterChance: number; b?: HitRes; a?: HitRes; hit?: number; ev?: number }
function numbers(mode: RateMode, d: Data): Nums {
  const pair = MODES[mode].pair ?? 0
  if (mode === 'skill-use') {
    const p = d.skill?.probability ?? 0
    return { base: p, after: f(f(p) + f(d.total)), before: skillUseChance(p), afterChance: skillUseChance(f(p) + f(d.total)) }
  }
  if (mode === 'skill-evade') {
    const ev = d.wearer.rates.skillEvadeRate ?? 0, hit = d.other.rates.skillHitRate ?? 0
    const b = skillHitChance(ev, hit, pair), a = skillHitChance(f(ev) + f(d.total), hit, pair)
    return { base: ev, after: f(ev) + f(d.total), hit, b, a, before: 100 - b.real, afterChance: 100 - a.real }
  }
  const ev = d.other.rates.skillEvadeRate ?? 0, hit = d.wearer.rates.skillHitRate ?? 0
  const b = skillHitChance(ev, hit, pair), a = skillHitChance(ev, f(hit) + f(d.total), pair)
  return { base: hit, after: f(hit) + f(d.total), ev, b, a, before: b.real, afterChance: a.real }
}

const pc = (v: number, dp = 1) => {
  const x = v * 100
  return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(dp)}%`
}
const STROKE: React.CSSProperties = { WebkitTextStroke: '8px #0b0d18', paintOrder: 'stroke fill', textShadow: '0 4px 10px rgba(0,0,0,0.55)' }

export default function SkillRateTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: RateMode }) {
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
  const shownGear = d.gears[m.shown]
  const tested = shownGear.basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const slots = Object.fromEntries(m.gears.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const totalTxt = `+${pc(d.total)}`

  /** ป้ายผลดี / ผลเสียของวงล้อ (ผลดี = ของตัวใส่เกียร์) */
  const labels = mode === 'skill-use'
    ? { good: T('ใช้ทักษะ', 'Skill'), bad: T('ตีปกติ', 'Normal attack'), goodRes: T('ติด! ใช้ทักษะ', 'Success! Skill'), badRes: T('ไม่ติด → ตีปกติ', 'Failed → normal attack') }
    : mode === 'skill-evade'
      ? { good: T('หลบ (MISS)', 'Evade (MISS)'), bad: T('โดน', 'Hit'), goodRes: T('หลบได้! MISS', 'Evaded! MISS'), badRes: T('หลบไม่พ้น → โดน', 'Not evaded → hit') }
      : { good: T('โดน', 'Hit'), bad: 'MISS', goodRes: T('โดน!', 'Hit!'), badRes: T('พลาด → MISS', 'Missed → MISS') }

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    // ผลของแต่ละรอบจากคิวในฉาก
    const rolls = ROLLS.map((start, k) => {
      const cue = c.scene.cues.find(x => x.id === `roll_${k}`) as { release?: string; flash?: boolean } | undefined
      const ok = mode === 'skill-use' ? cue?.release === 's_attack' : cue?.flash !== false   // ใช้ทักษะ / โดน
      const good = mode === 'skill-evade' ? !ok : ok
      const hits = c.hitsOf(`roll_${k}`)
      return { start, k, after: k >= 2, ok, good, hitAt: hits[0] ?? start + ACT + 1.5 }
    })
    const S = TL.summary[0]

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T(m.title[0], m.title[1])} />
        <GearCard t={t} T={T} gear={shownGear} icon={gearIconUrl(m.gears[m.shown].code)} name={gearName(m.shown)} effName={effName}
          switchable={d.per[m.shown].swEff} kind={m.gears[m.shown].kind} grade={m.gears[m.shown].grade} tested={tested} />

        <RangerCard T={T} r={d.wearer} name={wearerName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<RangerRows mode={mode} t={t} T={T} d={d} N={N} otherName={otherName} />}
          slots={<GearSlots t={t} />} />

        <FormulaCard mode={mode} t={t} T={T} d={d} N={N} optName={optName} totalTxt={totalTxt} />

        <EquipSetCard t={t} T={T} m={m} names={m.gears.map((_, i) => gearName(i))} per={d.per} totalTxt={totalTxt} slots={slots}
          optName={optName} before={N.before} after={N.afterChance} goodLabel={labels.good} />

        {rolls.map(r => (
          <RollUi key={r.k} c={c} T={T} mode={mode} r={r} chance={(r.after ? N.afterChance : N.before) / 100} labels={labels} lang={lang} />
        ))}

        <Summary mode={mode} t={t} T={T} S={S} d={d} N={N} rolls={rolls} labels={labels} optName={optName} totalTxt={totalTxt} wearerName={wearerName} />
      </>
    )
  }

  return <ScenePlayer src={`/gear-options/scenes/${m.scene}.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

// ── แถวในการ์ดเรนเจอร์ ──
function RangerRows({ mode, t, T, d, N, otherName }: { mode: RateMode; t: number; T: Tr; d: Data; N: Nums; otherName: string }) {
  if (mode === 'skill-use') {
    return <>
      <StatRow t={t} label={T('โอกาสใช้ทักษะ 1', 'Skill 1 chance')} value={pc(N.base)} hlAt={8.6}
        note={T('สุ่มทุกครั้งที่ถึงจังหวะโจมตี', 'Rolled at every attack')} />
      <StatRow t={t} label={T('เวลารอทักษะ', 'Skill cooldown')} value={T(`${d.skill?.cooldown ?? 0} วิ`, `${d.skill?.cooldown ?? 0} s`)} hlAt={9.6}
        note={T('ต้องพ้นเวลารอก่อน ถึงจะใช้ทักษะได้', 'Must be off cooldown to cast')} />
      <StatRow t={t} label={T('ใช้ทักษะจริง', 'Actual chance')} value={`${N.before}%`} dim />
    </>
  }
  if (mode === 'skill-evade') {
    return <>
      <StatRow t={t} label={T('หลบทักษะ', 'Skill evade')} value={pc(N.base)} hlAt={8.6} note={T('ค่าเดิมของเรนเจอร์', 'Base value')} />
      <StatRow t={t} label={T(`ผู้ยิง: แม่นยำทักษะ`, 'Shooter: skill hit')} value={pc(N.hit ?? 0)} hlAt={9.6} note={otherName} />
      <StatRow t={t} label={T('โอกาสหลบได้', 'Evade chance')} value={`${N.before}%`} dim />
    </>
  }
  return <>
    <StatRow t={t} label={T('แม่นยำทักษะ', 'Skill hit')} value={pc(N.base)} hlAt={8.6} note={T('ค่าเดิมของเรนเจอร์', 'Base value')} />
    <StatRow t={t} label={T('เป้า: หลบทักษะ', 'Target: skill evade')} value={pc(N.ev ?? 0)} hlAt={9.6} note={otherName} />
    <StatRow t={t} label={T('โอกาสโดน', 'Hit chance')} value={`${N.before}%`} dim />
  </>
}

// ── การ์ดสูตร ──
function FormulaCard({ mode, t, T, d, N, optName, totalTxt }: { mode: RateMode; t: number; T: Tr; d: Data; N: Nums; optName: string; totalTxt: string }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  const box = 'rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3'
  const P = Math.round((MODES[mode].pair ?? 0) * 100)
  const gold = 'rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3'
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">
        {mode === 'skill-use' ? T('เกมสุ่มใช้ทักษะแบบนี้', 'How the game rolls a skill') : mode === 'skill-evade' ? T('เกมสุ่มหลบทักษะแบบนี้', 'How the game rolls a skill evade') : T('เกมสุ่มว่าทักษะโดนไหมแบบนี้', 'How the game rolls a skill hit')}
      </span></Fit1>
      {mode === 'skill-use' ? <>
        <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
          <Fit1 className="text-center"><span className="text-[32px] font-black text-white">{T('โอกาส', 'Chance')} = {T('โอกาสของทักษะ', 'skill chance')} + {optName}</span></Fit1>
          <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">{T('ทุกครั้งที่ถึงจังหวะโจมตี เกมสุ่ม · ติดและพ้นเวลารอทักษะ = ใช้ทักษะแทนตีปกติ · ไม่ติด = ตีปกติ', 'Rolled at every attack · success and off cooldown = cast the skill · fail = normal attack')}</div>
        </div>
        <div className="mt-3 rounded-2xl bg-rose-900/30 border-2 border-rose-400/50 px-5 py-2 text-center" style={step(t, a + 1.3)}>
          <Fit1 className="text-center"><span className="text-[26px] font-black text-rose-200">{T('เพดานสูงสุด 95% — ใส่เกินกว่านี้ก็ไม่ขึ้น', 'Capped at 95% — anything above does nothing')}</span></Fit1>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.4)}>
          <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
            <div className="text-[44px] font-black text-white leading-tight">{N.before}%</div></div>
          <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
            <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{pc(N.base)} + {pc(d.total)} = {pc(N.after)} → {T('เพดาน', 'cap')}</span></Fit1>
            <div className="text-[44px] font-black text-amber-300 leading-tight">{N.afterChance}%</div></div>
        </div>
      </> : <>
        <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3" style={step(t, a + 0.3)}>
          <Fit1 className="text-center"><span className="text-[26px] font-black text-white">{T('หลบ', 'Evade')} = {T('หลบทักษะ', 'skill evade')} + Skill Evade Rate <span className="text-rose-300">({T('สูงสุด 99%', 'max 99%')})</span></span></Fit1>
          <Fit1 className="text-center mt-1"><span className="text-[30px] font-black text-amber-200">{T('โอกาสโดน', 'Hit chance')} = (100% − {T('หลบ', 'evade')}) × (1 + {T('แม่นยำทักษะของผู้ยิง', "shooter's skill hit")}) + {T('โบนัสคู่ธาตุ', 'element pair bonus')}</span></Fit1>
          <div className="mt-1 text-center text-[19px] font-bold text-gray-300 text-balance">{T(`โบนัสคู่ธาตุ แสง → น้ำ = ${P}% (ตารางธาตุของเกม) · สุ่มเลข 1–100 · ได้ไม่เกินโอกาสโดน = โดน · เกิน = MISS`, `Light → Water pair bonus = ${P}% (game element table) · roll 1–100 · at or below the hit chance = hit · above = MISS`)}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
          <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
            <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">(100 − {pc(N.b!.evadeCapped)}) × {(1 + (mode === 'skill-evade' ? N.hit! : N.base)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} + {P} = {N.b!.raw.toFixed(1)}</span></Fit1>
            <div className="text-[40px] font-black text-white leading-tight">{T('โดน', 'Hit')} {N.b!.real}%</div></div>
          <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
            <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">
              {mode === 'skill-evade'
                ? `${T('หลบ', 'evade')} ${pc(N.after)} → 99% · (100 − 99) × ${(1 + N.hit!).toFixed(1)} + ${P} = ${N.a!.raw.toFixed(1)}`
                : `(100 − ${pc(N.a!.evadeCapped)}) × ${(1 + N.after).toFixed(3)} + ${P} = ${N.a!.raw.toFixed(1)}`}
            </span></Fit1>
            <div className="text-[40px] font-black text-amber-300 leading-tight">{T('โดน', 'Hit')} {N.a!.real}%</div></div>
        </div>
        <div className="mt-3 text-center text-[20px] font-black text-sky-300 text-balance" style={step(t, a + 2.8)}>
          {mode === 'skill-evade'
            ? T('หลบได้สูงสุด 99% เสมอ แต่ผู้ยิงที่แม่นยำสูงยังคูณโอกาสโดนขึ้นได้', 'Evade tops out at 99%, and an accurate shooter still multiplies the hit chance up')
            : T('แม่นยำทักษะคูณโอกาสโดน — เกิน 100% เมื่อไหร่ ทักษะพลาดไม่ได้อีกเลย', 'Skill hit multiplies the hit chance — once it passes 100%, the skill can no longer miss')}
        </div>
      </>}
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
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">
              +{pc(per[i].basic)}{per[i].sw ? <span className="text-fuchsia-300"> +{pc(per[i].sw)}</span> : null}
            </span>
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
        <GearSlots t={t} filled={t >= at ? slots : undefined} />
      </div>
    </FitCard>
  )
}

// ── วงล้อสุ่ม + ผล + ป้าย MISS ──
type Roll = { start: number; k: number; after: boolean; ok: boolean; good: boolean; hitAt: number }
type Labels = { good: string; bad: string; goodRes: string; badRes: string }
/** จุดตกในช่องของวงล้อ (สัดส่วนในช่อง) ต่างกันทุกรอบให้ดูเป็นการสุ่ม */
const LAND = [0.62, 0.38, 0.55, 0.7]
const WHEEL = 236

/** จุดบนวงกลม (องศาตามเข็มจาก 12 นาฬิกา) ใน viewBox 0..200 */
const pt = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const
}
/** path ของช่องวงล้อ from → to องศา */
function slicePath(from: number, to: number, r = 92) {
  if (to - from >= 359.999) return `M ${100 - r} 100 A ${r} ${r} 0 1 1 ${100 + r} 100 A ${r} ${r} 0 1 1 ${100 - r} 100 Z`
  const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r)
  return `M 100 100 L ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1} Z`
}

/** วงล้อสุ่ม: กรอบนอก/เงา/ประกาย อยู่นิ่ง · หมุนเฉพาะแผ่นช่อง (SVG ขอบคม) · ลูกศรชี้ 12 นาฬิกา (ใช้ร่วมกับ blitz-rush.tsx) */
export function Wheel({ chance, rot, goodColor, badColor, scale, center, sub }: { chance: number; rot: number; goodColor: [string, string]; badColor: [string, string]; scale: number; center: string; sub: string }) {
  const g = Math.max(0, Math.min(1, chance)) * 360
  // ตัวเลขในช่อง: ทศนิยม 1 ตำแหน่งเมื่อจำเป็น (ให้ตรงกับเลขกลางวงล้อ) · เลขยาว = ตัวเล็กลง
  const pctTxt = (v: number) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }
  const goodPct = pctTxt(Math.max(0, Math.min(1, chance))), badPct = pctTxt(1 - Math.max(0, Math.min(1, chance)))
  // id ของ gradient ต้องไม่ซ้ำกันเมื่อมีวงล้อหลายอันบนจอพร้อมกัน (สีต่างกัน)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const label = (from: number, to: number, txt: string) => {
    if (to - from < 40) return null   // ช่องเล็กเกินไม่ใส่ตัวเลข (ดูที่ป้ายใต้วงล้อแทน)
    const [x, y] = pt((from + to) / 2, 62)
    return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={txt.length > 3 ? 14 : 17} fontWeight={900} fill="#fff" stroke="#0b0d18" strokeWidth={4} paintOrder="stroke">{txt}</text>
  }
  const centerSize = center.length <= 3 ? 28 : center.length === 4 ? 24 : 20
  return (
    <div className="relative" style={{ width: WHEEL, height: WHEEL, transform: `scale(${scale})` }}>
      {/* เงา + กรอบทอง (นิ่ง) */}
      <div className="absolute inset-0 rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.65)]" style={{ background: 'conic-gradient(from 0deg, #fde68a, #b45309, #fde68a, #b45309, #fde68a)' }} />
      <svg viewBox="0 0 200 200" className="absolute inset-[7px]" style={{ width: WHEEL - 14, height: WHEEL - 14 }}>
        <defs>
          <linearGradient id={`wg-good-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={goodColor[0]} /><stop offset="1" stopColor={goodColor[1]} /></linearGradient>
          <linearGradient id={`wg-bad-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={badColor[0]} /><stop offset="1" stopColor={badColor[1]} /></linearGradient>
          <radialGradient id={`wg-gloss-${uid}`} cx="0.35" cy="0.25" r="0.75"><stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="0.55" stopColor="#fff" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="100" cy="100" r="96" fill="#0b0d18" />
        <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: '100px 100px' }}>
          {g > 0 && <path d={slicePath(0, g)} fill={`url(#wg-good-${uid})`} />}
          {g < 360 && <path d={slicePath(g, 360)} fill={`url(#wg-bad-${uid})`} />}
          {g > 0 && g < 360 && [0, g].map(d => { const [x, y] = pt(d, 92); return <line key={d} x1="100" y1="100" x2={x} y2={y} stroke="#fff" strokeOpacity="0.85" strokeWidth="2.5" /> })}
          {label(0, g, goodPct)}
          {label(g, 360, badPct)}
        </g>
        {/* ประกาย (นิ่ง ไม่หมุนตาม) */}
        <circle cx="100" cy="100" r="92" fill={`url(#wg-gloss-${uid})`} />
        <circle cx="100" cy="100" r="92" fill="none" stroke="#fde68a" strokeOpacity="0.6" strokeWidth="2" />
      </svg>
      {/* แกนกลาง */}
      <div className="absolute left-1/2 top-1/2 w-[92px] h-[92px] -ml-[46px] -mt-[46px] rounded-full bg-gradient-to-b from-[#1b2340] to-[#0b0f1e] border-[4px] border-amber-200 flex flex-col items-center justify-center shadow-[inset_0_2px_6px_rgba(255,255,255,0.15)]">
        <span className="font-black text-white leading-none tabular-nums whitespace-nowrap" style={{ fontSize: centerSize }}>{center}</span>
        <span className="text-[12px] font-bold text-amber-100/80 mt-1 whitespace-nowrap max-w-[80px] truncate">{sub}</span>
      </div>
      {/* ลูกศรชี้ (นิ่ง) */}
      <svg viewBox="0 0 40 46" className="absolute left-1/2 -top-[16px] -ml-[18px] w-[36px] h-[42px] drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)]">
        <path d="M20 44 L4 10 Q20 -6 36 10 Z" fill="#ef4444" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function RollUi({ c, T, mode, r, chance, labels, lang }: { c: OverlayCtx; T: Tr; mode: RateMode; r: Roll; chance: number; labels: Labels; lang: string }) {
  const t = c.t
  const st = r.start
  const vis = span(t, st, st + 4.2, 0.25, 0.3)
  // วงล้อ: ช่องผลดี (ของตัวใส่เกียร์) เริ่มที่ 12 นาฬิกา ตามเข็ม · ลูกศรชี้ด้านบน
  const gDeg = Math.max(0, Math.min(1, chance)) * 360
  const theta = r.good ? gDeg * LAND[r.k] : gDeg + (360 - gDeg) * LAND[r.k]
  const final = 360 * 5 - theta
  const sp = prog(t, st + SPIN.from, st + SPIN.to)
  const rot = final * (1 - Math.pow(1 - sp, 3))
  const landed = t >= st + SPIN.to
  const goodColor: [string, string] = mode === 'skill-evade' ? ['#7dd3fc', '#0284c7'] : ['#fde047', '#d97706']
  const badColor: [string, string] = mode === 'skill-evade' ? ['#fb7185', '#be123c'] : ['#94a3b8', '#475569']
  const res = span(t, st + SPIN.to, st + 4.2, 0.2, 0.3)
  // ป้าย MISS ที่เป้า (หลบ / แม่นยำ): ยืดสูง 1.8 → 1 ใน 0.13 วิ · ค้าง 0.4 · จาง 0.3 (แบบเกม)
  const targetId = mode === 'skill-evade' ? ALLY : ENEMY
  const tp = c.actorAt(targetId)
  const tpos = tp ? c.project(tp) : null
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
      {mode !== 'skill-use' && !r.ok && tpos && <MissPop t={t} at={r.hitAt} x={tpos.x + (mode === 'skill-evade' ? 30 : -30)} y={tpos.y - 210} lang={lang} />}
    </>
  )
}

// ── สรุป ──
function Summary({ mode, t, T, S, N, rolls, labels, optName, totalTxt, wearerName }: {
  mode: RateMode; t: number; T: Tr; S: number; d: Data; N: Nums; rolls: Roll[]; labels: Labels; optName: string; totalTxt: string; wearerName: string
}) {
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const rows = [{ label: T('ไม่ใส่เกียร์', 'No gear'), v: N.before }, { label: `${optName} ${totalTxt}`, v: N.afterChance }]
  const pair = MODES[mode].pair ?? 0, P = Math.round(pair * 100)
  const capHit = skillHitChance(0.99, N.after, pair)   // ตัวอย่าง: เป้าหลบเต็มเพดาน
  const note = mode === 'skill-use'
    ? T(`${optName} บวกตรงเข้าโอกาสของทักษะ แต่เพดานคือ 95% — ใส่เต็มก็ยังพลาดได้ 5% · ต้องพ้นเวลารอทักษะด้วย`, `${optName} adds straight onto the skill's chance, but it caps at 95% — it can still fail 5% of the time · the skill must also be off cooldown`)
    : mode === 'skill-evade'
      ? T(`หลบได้สูงสุด 99% · ยังโดนได้ ${N.a?.real ?? 0}% เพราะผู้ยิงแม่นยำทักษะ ${pc(N.hit ?? 0)} คูณเป็น (100 − 99) × ${(1 + (N.hit ?? 0)).toFixed(1)} + คู่ธาตุ ${P} = ${N.a?.raw.toFixed(1)} → สุ่ม 1–100 ได้ ${N.a?.real ?? 0}%`, `Evade caps at 99% · you can still be hit ${N.a?.real ?? 0}% of the time: the shooter's ${pc(N.hit ?? 0)} skill hit and the element pair make it (100 − 99) × ${(1 + (N.hit ?? 0)).toFixed(1)} + ${P} = ${N.a?.raw.toFixed(1)} → ${N.a?.real ?? 0}% on a 1–100 roll`)
      : T(`แม่นยำทักษะคูณโอกาสโดน (ไม่ใช่บวก) · เป้าที่หลบเต็ม 99% ยังโดนแค่ (100 − 99) × ${(1 + N.after).toFixed(2)} + ${P} = ${capHit.raw.toFixed(1)} → ${capHit.real}%`, `Skill hit multiplies (not adds) · against a target at the 99% evade cap it is only (100 − 99) × ${(1 + N.after).toFixed(2)} + ${P} = ${capHit.raw.toFixed(1)} → ${capHit.real}%`)
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330}
      title={mode === 'skill-use' ? T(`โอกาสที่ ${wearerName} ใช้ทักษะ`, `${wearerName}'s chance to cast`) : mode === 'skill-evade' ? T(`โอกาสที่ ${wearerName} หลบทักษะได้`, `${wearerName}'s chance to evade`) : T(`โอกาสที่ทักษะของ ${wearerName} โดน`, `Chance ${wearerName}'s skill hits`)}>
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
        {T(`เกียร์ +${GEAR_LEVEL} · ชุด ${optName} สูงสุดที่ใส่ได้จริงตามกฎเกม`, `Gear +${GEAR_LEVEL} · the highest legal ${optName} set`)}
      </div>
    </SummaryShell>
  )
}

// ── ตัวเล่นของแต่ละออพชั่น (GearOptionPlayer) — แยก component ให้เปลี่ยนออพชั่นแล้วโหลดข้อมูลใหม่ ──
export const SkillUseTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SkillRateTutorial autoPlay={autoPlay} mode="skill-use" />
export const SkillEvadeTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SkillRateTutorial autoPlay={autoPlay} mode="skill-evade" />
export const SkillHitTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SkillRateTutorial autoPlay={autoPlay} mode="skill-hit" />
