'use client'

// ====================================================
// วิดีโอ อัตราต้านการโจมตีด้วยทักษะ (Skill Attack Cancel Rate) — Ares Cony (ซ้าย ใส่เกียร์) โดน Brown ตำนานร็อค (ขวา) ยิงทักษะใส่
//   ไม่ใส่เกียร์ 2 ครั้ง: วงล้อโอกาสโดน 96% → โดน · ใส่ [CG]Zero's Mask +5 (ต้าน +24%) 2 ครั้ง: ต้านติด → ทักษะพลาดแน่นอน · ไม่ติด → สุ่มหลบปกติ → โดน
//   รอบ 5: ผู้ยิงใส่ [YSH] Kikujumonji (โดนแน่นอนของทักษะ +24%) → ต้านติด + โดนแน่นอนติด = หักล้าง → สุ่มหลบปกติ → โดน
//   ฉาก: public/gear-options/scenes/skill-cancel.anme.json ← scripts/gear-options/build-surehit-scene.cjs skill-cancel (ROLLS / EQUIP_AT ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so — ทักษะ 0xcf132c · ตีปกติ 0xced0e0 ใช้ตรรกะเดียวกันกับ FIX_AVD):
//   C = ต้านการโจมตีด้วยทักษะของเป้า (FIX_SKLAVD 0x2d · getter 0x910) > 0 → สุ่ม 0–1 < C
//   S = โดนแน่นอนของทักษะของผู้ยิง (CLN_SKLAVD 0x29) > 0 → สุ่ม 0–1 < S
//   C ติด S ไม่ติด = พลาดแน่นอน (MISS) · S ติด C ไม่ติด = โดนแน่นอน · อื่นๆ = สุ่มหลบปกติ
//   สุ่มหลบ: โอกาสโดน % = (100 − หลบ%) × (1 + แม่นยำทักษะ) + ski_atk_acc × 100 (แสง → น้ำ 0.05) · สุ่ม 1–100 ≤ โอกาสโดน = โดน
//   เพดาน MAX_FIX_SKILL_AVOID_PROB 50% ใช้ตอนโหลดค่าจาก JSON (fixedSkillAvoidProb) — เกียร์สูงสุดในเกม 24% ไม่ถึงเพดาน
//   ต้านการโจมตีปกติ (FIX_AVD) ทำงานแบบเดียวกันกับตีปกติ แต่ไม่มีเกียร์ไหนมีค่านี้
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, useTutorialData, type RangerStats,
} from './kit'
import { skillHitChance } from './skill-rates'
import { RollStack, type RowSpec } from './rollstack'
import { MissPop } from './battleui'

type Tr = (th: string, en: string) => string

const ALLY = 'ak1zzx9ceu'
const ROLLS = [18.6, 22.6, 30.6, 36.0, 46.6]
const ACT = 2.1
const EQUIP_AT = 28.6, EQUIP2_AT = 44.3
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], equip2: [43.0, 46.0], summary: [54, 62] } as const

const WEARER = 'u1002e-cony', SHOOTER = 'u1260e-brown'
const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1002e-cony': 'Ares Cony' }
const PAIR = 0.05   // ski_atk_acc แสง → น้ำ
const TYPE = 'FIX_SKLAVD_PROB_MUL', NAME_KEY = 'GEAR_ATTR_FIX_SKLAVD_PROB_MUL_nm'
const GEAR = { code: 'eq_2610_amr_19', grade: 9, en: "[CG]Zero's Mask" }   // ไม่มีค่าหลบทักษะปน (ไม่เปลี่ยนโอกาสโดนปกติ)
/** เกียร์ของผู้ยิง (รอบ 5): โดนแน่นอนของทักษะ +24% · ไม่มีค่าแม่นยำปน */
const SURE_GEAR = { code: 'eq_2202_wpn_07', grade: 7, en: '[YSH] Kikujumonji' }
const SURE_KEY = 'GEAR_ATTR_CLN_SKLAVD_PROB_MUL_nm'

type Rates = RangerStats['rates'] & { skillEvadeRate?: number; skillHitRate?: number }

async function loadData() {
  const [wearer, shooter, g, sg] = await Promise.all([loadStats(WEARER), loadStats(SHOOTER), loadGear(GEAR.code), loadGear(SURE_GEAR.code)])
  const basicOf = (gear: typeof g.gear, type: string) => gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const cancel = basicOf(g.gear, TYPE)
  const sure = basicOf(sg.gear, 'CLN_SKLAVD_PROB_MUL')
  const ev = (wearer.rates as Rates).skillEvadeRate ?? 0, hit = (shooter.rates as Rates).skillHitRate ?? 0
  const res = skillHitChance(ev, hit, PAIR)
  const normal = res.real / 100
  // ผู้ยิงมีโดนแน่นอน: C ติด S ไม่ติด = พลาด · S ติด C ไม่ติด = โดน · อื่นๆ = สุ่มหลบ
  const vsSure = sure * (1 - cancel) + (1 - cancel * (1 - sure) - sure * (1 - cancel)) * normal
  return { wearer, shooter, gear: g.gear, cancel, sure, ev, hit, res, normal, total: (1 - cancel) * normal, vsSure }
}
type Data = Awaited<ReturnType<typeof loadData>>

const pc = (v: number) => {
  const x = v * 100
  return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%`
}
type Roll = { start: number; k: number; after: boolean; ok: boolean; hitAt: number; sure: boolean }

export function SkillCancelTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearName = tGear(GEAR.code, GEAR.en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', NAME_KEY, T('อัตราต้านการโจมตีด้วยทักษะ', 'Skill Attack Cancel Rate'))
  const wearerName = tRanger(WEARER, EN_NAMES[WEARER]), shooterName = tRanger(SHOOTER, EN_NAMES[SHOOTER])
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === TYPE ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.cancel)}`

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rolls: Roll[] = ROLLS.map((start, k) => {
      const cue = c.scene.cues.find(x => x.id === `roll_${k}`) as { flash?: boolean } | undefined
      const hits = c.hitsOf(`roll_${k}`)
      return { start, k, after: k >= 2, ok: cue?.flash !== false, hitAt: hits[0] ?? start + ACT + 1.5, sure: k >= 4 }
    })
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIconUrl(GEAR.code)} name={gearName} effName={effName}
          switchable={null} kind="armor" grade={GEAR.grade} tested={tested} />

        <RangerCard T={T} r={d.wearer} name={wearerName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.6} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} label={T(`โอกาสที่ทักษะของ ${shooterName} โดน`, `Chance ${shooterName}'s skill hits`)} value={`${d.res.real}%`} hlAt={9.6}
              note={`(100 − ${pc(d.ev)}) × ${(1 + d.hit).toFixed(1)} + ${Math.round(PAIR * 100)} = ${d.res.raw.toFixed(1)}`} />
          </>}
          slots={<GearSlots t={t} />} />

        <FormulaCard t={t} T={T} d={d} optName={optName} totalTxt={totalTxt} />
        <EquipCard t={t} T={T} gearName={gearName} optName={optName} totalTxt={totalTxt} />
        <SureEquipCard t={t} T={T} gearName={tGear(SURE_GEAR.code, SURE_GEAR.en)} optName={tr('equip', SURE_KEY, T('อัตราโจมตีโดนแน่นอนของทักษะ', 'Skill Surehit Rate'))}
          sure={d.sure} shooterName={shooterName} />

        {rolls.map(r => <RollUi key={r.k} c={c} T={T} r={r} d={d} lang={lang} />)}

        <Summary t={t} T={T} d={d} rolls={rolls} optName={optName} totalTxt={totalTxt} />
      </>
    )
  }

  return <ScenePlayer src="/gear-options/scenes/skill-cancel.anme.json" autoPlay={autoPlay} overlay={overlay} />
}

function FormulaCard({ t, T, d, optName, totalTxt }: { t: number; T: Tr; d: Data; optName: string; totalTxt: string }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  const box = 'rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3'
  const gold = 'rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3'
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมเช็คต้านก่อนสุ่มหลบทักษะ', 'The game checks Cancel before the skill evade roll')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-white">{T('สุ่มต้าน', 'Roll Cancel')} · {T('ติด', 'success')} = <span className="text-sky-300">{T('ทักษะพลาดแน่นอน (MISS)', 'the skill surely misses (MISS)')}</span> · {T('ไม่ติด', 'fail')} = {T('สุ่มหลบตามปกติ', 'normal evade roll')}</span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {T('ถ้าผู้ยิงมี "อัตราโจมตีโดนแน่นอนของทักษะ" แล้วติดพร้อมกัน จะหักล้างกัน → กลับไปสุ่มหลบตามปกติ', "If the shooter's Skill Surehit also succeeds, both cancel out → back to the normal evade roll")}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-2 text-center" style={step(t, a + 1.3)}>
        <Fit1 className="text-center"><span className="text-[26px] font-black text-amber-200">{T('โอกาสโดนรวม', 'Total hit chance')} = (1 − {T('ต้าน', 'Cancel')}) × {T('โอกาสโดนปกติ', 'normal hit chance')}</span></Fit1>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.4)}>
        <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200">{T('โอกาสโดนปกติ', 'Normal hit chance')}</span></Fit1>
          <div className="text-[44px] font-black text-white leading-tight">{pc(d.normal)}</div></div>
        <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">(1 − {pc(d.cancel)}) × {pc(d.normal)}</span></Fit1>
          <div className="text-[44px] font-black text-amber-300 leading-tight">{pc(d.total)}</div></div>
      </div>
    </FitCard>
  )
}

function EquipCard({ t, T, gearName, optName, totalTxt }: { t: number; T: Tr; gearName: string; optName: string; totalTxt: string }) {
  const s = span(t, TL.equip[0], TL.equip[1], 0.4, 0.35)
  if (!s.on) return null
  const at = EQUIP_AT
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 flex items-center gap-3" style={step(t, TL.equip[0] + 0.15)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gearIconUrl(GEAR.code)} alt="" crossOrigin="anonymous" className="w-14 h-14 shrink-0 object-contain" />
        <Fit1 className="flex-1"><span className="text-[24px] font-bold text-white">{gearName} +{GEAR_LEVEL}</span></Fit1>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-1 text-right text-[19px] font-bold text-gray-400">{T('มีแค่เกราะ · Basic 4% × 6 ระดับ', 'Armor only · Basic 4% × 6 levels')}</div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={{ at, kind: 'armor', icon: gearIconUrl(GEAR.code), grade: GEAR.grade }} />
      </div>
    </FitCard>
  )
}

/** รอบ 5: ผู้ยิงใส่เกียร์โดนแน่นอนของทักษะ (การ์ดอยู่ซ้าย — ผู้ยิงยืนขวา) */
function SureEquipCard({ t, T, gearName, optName, sure, shooterName }: { t: number; T: Tr; gearName: string; optName: string; sure: number; shooterName: string }) {
  const s = span(t, TL.equip2[0], TL.equip2[1], 0.4, 0.35)
  if (!s.on) return null
  const at = EQUIP2_AT
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 40, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-rose-300">{T(`ผู้ยิง ${shooterName} ใส่เกียร์สู้กลับ`, `The shooter ${shooterName} gears up`)}</div>
      <div className="mt-2 flex items-center gap-3" style={step(t, TL.equip2[0] + 0.15)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gearIconUrl(SURE_GEAR.code)} alt="" crossOrigin="anonymous" className="w-14 h-14 shrink-0 object-contain" />
        <Fit1 className="flex-1"><span className="text-[24px] font-bold text-white">{gearName} +{GEAR_LEVEL}</span></Fit1>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>+{pc(sure)}</span>
      </div>
      <div className="mt-1 text-right text-[19px] font-bold text-gray-400">{T('ติดพร้อมกับต้าน = หักล้างกัน', 'Succeeding together with Cancel = they cancel out')}</div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={{ at, kind: 'weapon', icon: gearIconUrl(SURE_GEAR.code), grade: SURE_GEAR.grade }} />
      </div>
    </FitCard>
  )
}

const LAND = [0.45, 0.6, 0.5, 0.4, 0.55]

function RollUi({ c, T, r, d, lang }: { c: OverlayCtx; T: Tr; r: Roll; d: Data; lang: string }) {
  const t = c.t
  const hitColor: [string, string] = ['#fb7185', '#be123c'], cancelColor: [string, string] = ['#7dd3fc', '#0284c7'], sureColor: [string, string] = ['#fde047', '#d97706']
  const evadeRow = (ok: boolean, land: number): RowSpec => ({
    wheels: [{ chance: d.normal, good: ok, goodColor: hitColor, goodLabel: T('โดน', 'Hit'), badLabel: 'MISS', sub: T('โอกาสโดน', 'Hit chance'), land }],
    note: ok ? T('สุ่มหลบไม่พ้น → โดน', 'Evade failed → hit') : T('หลบได้ → MISS', 'Evaded → MISS'), noteGood: !ok,
  })
  const cancelWheel = (ok: boolean) => ({ chance: d.cancel, good: ok, goodColor: cancelColor, goodLabel: T('ต้านติด', 'Cancel'), badLabel: T('ไม่ติด', 'Fail'), sub: T('ต้าน (เรา)', 'Cancel (us)'), land: LAND[r.k] })
  let rows: RowSpec[]
  if (!r.after) rows = [evadeRow(r.ok, LAND[r.k])]
  else if (r.sure) {
    // ต้าน (เรา) + โดนแน่นอน (ผู้ยิง) สุ่มพร้อมกัน — ติดทั้งคู่ = หักล้าง
    rows = [
      {
        wheels: [cancelWheel(true), { chance: d.sure, good: true, goodColor: sureColor, goodLabel: T('โดนแน่นอน', 'Surehit'), badLabel: T('ไม่ติด', 'Fail'), sub: T('โดนแน่นอน (ผู้ยิง)', 'Surehit (shooter)'), land: 0.4 }],
        note: T('ติดทั้งคู่ → หักล้างกัน → สุ่มหลบตามปกติ', 'Both succeed → they cancel out → normal evade roll'), noteGood: false,
      },
      evadeRow(r.ok, 0.45),
    ]
  } else if (!r.ok) {
    rows = [{ wheels: [cancelWheel(true)], note: T('ต้านติด! ทักษะพลาดแน่นอน', 'Cancelled! The skill surely misses'), noteGood: true }]
  } else {
    rows = [{ wheels: [cancelWheel(false)], note: T('ต้านไม่ติด → สุ่มหลบตามปกติ', 'Cancel failed → normal evade roll'), noteGood: false }, evadeRow(true, 0.5)]
  }
  const header = `${r.sure ? T('ผู้ยิงใส่โดนแน่นอนของทักษะ', 'Shooter has Skill Surehit') : r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · ${T(`ทักษะครั้งที่ ${r.sure ? 3 : (r.k % 2) + 1}`, `Skill ${r.sure ? 3 : (r.k % 2) + 1}`)}`
  const tp = c.actorAt(ALLY)
  const tpos = tp ? c.project(tp) : null

  return (
    <>
      <RollStack c={c} header={header} st={r.start} rows={rows} end={Math.max(r.start + 4.2, r.hitAt + 1.1)} />
      {!r.ok && <MissPop c={c} actorId={ALLY} at={r.hitAt} lang={lang} />}
    </>
  )
}

function Summary({ t, T, d, rolls, optName, totalTxt }: { t: number; T: Tr; d: Data; rolls: Roll[]; optName: string; totalTxt: string }) {
  const S = TL.summary[0]
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const rows = [
    { label: T('ไม่ใส่เกียร์', 'No gear'), v: d.normal },
    { label: `${optName} ${totalTxt}`, v: d.total },
    { label: T(`ผู้ยิงมีโดนแน่นอนของทักษะ +${pc(d.sure)}`, `Shooter has Skill Surehit +${pc(d.sure)}`), v: d.vsSure },
  ]
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330} title={T('โอกาสที่ทักษะโดนเรา', 'Chance a skill hits us')}>
      {rows.map((row, i) => (
        <div key={i} className="mt-3" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
          <div className="flex justify-between items-baseline text-[26px]">
            <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
            <span className={`shrink-0 ml-4 font-black tabular-nums ${i === 1 ? 'text-sky-300' : i === 2 ? 'text-amber-300' : 'text-white'}`}>{pc(row.v * bar(S + 0.5 + i * 0.5))}</span>
          </div>
          <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${i === 1 ? 'from-sky-500 to-cyan-300' : i === 2 ? 'from-amber-500 to-yellow-300' : 'from-rose-600 to-rose-400'}`} style={{ width: `${row.v * 100 * bar(S + 0.5 + i * 0.5)}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, TL.summary[1], 0.5, 0.6))}>
        {[false, true].map(after => (
          <div key={String(after)} className={`rounded-2xl border-2 p-3 text-center ${after ? 'bg-[#0b2238] border-sky-400/50' : 'bg-white/[0.05] border-white/10'}`}>
            <div className="text-[20px] text-gray-300 font-bold">{T('ในคลิป', 'In this clip')} · {after ? T('ใส่เกียร์', 'gear') : T('ไม่ใส่', 'no gear')}</div>
            <div className="mt-2 flex justify-center gap-3">
              {rolls.filter(r => r.after === after).map(r => (
                <span key={r.k} className={`px-3 py-1 rounded-lg text-[20px] font-black ${!r.ok ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-gray-100'}`}>{r.ok ? T('โดน', 'Hit') : 'MISS'}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
        {T(`ต้านติด (และผู้ยิงไม่ติดโดนแน่นอน) = ทักษะพลาดแน่นอน · (1 − ${pc(d.cancel)}) × ${pc(d.normal)} = ${pc(d.total)} · ถ้าผู้ยิงมีโดนแน่นอน ${pc(d.sure)}: ติดทั้งคู่หักล้างกัน · ผู้ยิงติดฝ่ายเดียว = โดนแน่นอน → โอกาสโดน ${pc(d.vsSure)} · ฝั่งตีปกติ (ต้านการโจมตีปกติ) ไม่มีในเกียร์`,
          `Cancel succeeding (without the shooter's Surehit) = a sure miss · (1 − ${pc(d.cancel)}) × ${pc(d.normal)} = ${pc(d.total)} · against ${pc(d.sure)} Skill Surehit: both succeeding cancel out, Surehit alone = sure hit → ${pc(d.vsSure)} hit chance · the normal-attack version has no gear`)}
      </div>
      <div className="mt-2 text-center text-[18px] text-gray-500">
        {T(`เกียร์ +${GEAR_LEVEL} · ค่าสูงสุดที่ใส่ได้จริงตามกฎเกม`, `Gear +${GEAR_LEVEL} · the highest legal value`)}
      </div>
    </SummaryShell>
  )
}
