'use client'

// ====================================================
// วิดีโอสอน: การต้านการถอยกลับ (knockback-resist) / การต้านความมึนงง (stun-resist)
//   เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์) โดนทักษะที่มีผลสถานะ
//   knockback: Jessica — Cursed Shield (sk1003_jessica_a) · 4 รอบ · คลิปแสดงเฉพาะครั้งที่ผลถอยกลับของทักษะติด
//   stun:      Naraku — Tentacles (sk2023_naraku_a · เอฟเฟกต์ unit22-stun) · มึนงง = ดาวของผู้ใช้ (8) + 2 = 10 วิ
//              มึนงงอยู่แล้วติดซ้ำไม่ได้ → 2 รอบ: ไม่ใส่เกียร์ (มึน 10 วิ) · ใส่เกียร์หลังหายมึน (ต้านได้)
//   ฉาก: public/gear-options/scenes/<mode>-resist.anme.json ← scripts/gear-options/build-statusres-scene.cjs (ROLLS ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ ANTI_KNOCKBACK_MUL (0x1c → UnitData 0xab0) · ANTI_STUN_MUL (0x1b → 0xaa0) บวกตรง (0xd5d490)
//   ทักษะโดน → ใส่ดาเมจก่อน → สุ่มต้าน (ถอยกลับ 0xcf7978 · มึนงง 0xce9ccc): p = ตัดเศษ(min(ต้าน, 0.95) × 100)
//     p ≥ 1 และ สุ่ม 0–99 < p → ไม่ติดสถานะ + ป้าย MISS ม่วง (UnitNode vfunc 0x440(1) — ml_guild_raid_miss02) · p < 1 → ไม่สุ่ม
//   ถอยกลับ (0xcd5088): ท่า "knockback" + เสียง knockback · CCMoveBy(0.2 วิ, 48 pt ไปด้านหลัง)
//   มึนงง (0xce9c00): ระยะเวลา = ค่าตามชนิด subFactor ของทักษะย่อย (GRADE = ดาวของผู้ใช้) + subFactor (0xcefd18 → 0xcf6cb4)
//     เอฟเฟกต์ attackedEffect ของทักษะ (unit22-stun ท่า loop) — effectPosition 0: anchor (0.5, 0) · อยู่ที่ความสูงยูนิต + 5 pt (0xcdd018–0xcdd070)
//   เกียร์ +5 = นับเฉพาะ Basic
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import { MissPop, unitTopPoint } from './battleui'
import { SamSprite } from './sam'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  equipSlots, gearIconUrl, loadGear, loadStats, step, useTutorialData, type GearKind, type SlotGear,
} from './kit'
import { Wheel } from './skill-rates'

export type StatusMode = 'knockback' | 'stun'
type Tr = (th: string, en: string) => string
const ALLY = 'ak1zzx9ceu'
const WEARER = 'u1242e-brown'
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], summary: [40.2, 48] } as const
const ACT = 2.1, SPIN = { from: 0.3, to: 1.9 }, CAP = 0.95
interface GearDef { code: string; kind: GearKind; grade: number; en: string }
interface ModeCfg {
  type: string; nameKey: string; title: [string, string]; caster: string; casterEn: string
  rolls: number[]; landed: boolean[]; firstAfter: number; equipAt: number; gears: GearDef[]
  /** มึนงง: ระยะเวลา = ดาวของผู้ใช้ + ค่านี้ (subFactor GRADE ADD ของทักษะย่อย) */
  stunAdd?: number
}
const MODES: Record<StatusMode, ModeCfg> = {
  knockback: {
    type: 'ANTI_KNOCKBACK_MUL', nameKey: 'GEAR_ATTR_ANTI_KNOCKBACK_MUL_nm', title: ['การต้านการถอยกลับ', 'Knockback Resistance'],
    caster: 'u1003e-jessica', casterEn: 'Jessica', rolls: [18.6, 23.0, 30.6, 35.0], landed: [true, true, false, true], firstAfter: 2, equipAt: 28.6,
    gears: [{ code: 'eq_eva2_wpn_16', kind: 'weapon', grade: 6, en: '[Eva] Thunder Spear' }, { code: 'eq_ace_acc_26', kind: 'acc', grade: 6, en: "[AA]Godot's Mask" }],
  },
  stun: {
    type: 'ANTI_STUN_MUL', nameKey: 'GEAR_ATTR_ANTI_STUN_MUL_nm', title: ['การต้านความมึนงง', 'Stun Resistance'],
    caster: 'u2023e-naraku', casterEn: 'Naraku', rolls: [18.6, 34.4], landed: [true, false], firstAfter: 1, equipAt: 32.3, stunAdd: 2,
    gears: [{ code: 'eq_sf2_wpn_06', kind: 'weapon', grade: 6, en: "【SF】 Akuma's Rope" }, { code: 'eq_2202_acc_06', kind: 'acc', grade: 6, en: '[YSH]Crimson Keepsake' }],
  },
}
const f = Math.fround
/** % ที่ต้านได้แบบเกม */
export const resistChance = (r: number) => Math.trunc(f(Math.min(f(r), f(CAP)) * 100))

async function loadData(mode: StatusMode) {
  const m = MODES[mode]
  const [w, cst, ...gs] = await Promise.all([loadStats(WEARER), loadStats(m.caster), ...m.gears.map(g => loadGear(g.code))])
  const gears = gs.map(x => x.gear as GearEffects)
  const per = gears.map(g => g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0))
  const total = per.reduce((s, v) => s + v, 0)
  const casterGrade = (cst as typeof cst & { grade?: number }).grade ?? 0
  const stunDur = m.stunAdd != null ? casterGrade + m.stunAdd : 0
  return { w, cst, casterGrade, gears, per, total, before: resistChance(0), after: resistChance(total), stunDur }
}
type Data = Awaited<ReturnType<typeof loadData>>
const pc = (v: number) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }

export default function StatusResistTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: StatusMode }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = MODES[mode]
  const stun = mode === 'stun'
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const gearName = (i: number) => tGear(m.gears[i].code, m.gears[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const wName = tRanger(WEARER, 'Executor Anubis Brown'), cName = tRanger(m.caster, m.casterEn)
  const skill = d.cst.skills[0]
  const skillName = skill ? tSkill(skill.code, skill.name) : ''
  const tested = d.gears[0].basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.total)}`
  const slots = Object.fromEntries(m.gears.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const words = stun
    ? { status: T('มึนงง', 'Stun'), landed: T('มึนงง', 'Stunned'), effect: T('มีผลมึนงง', 'has a stun effect') }
    : { status: T('ถอยกลับ', 'Knockback'), landed: T('ถอยกลับ', 'Knocked back'), effect: T('มีผลผลักถอยหลัง', 'has a knockback effect') }

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rolls = m.rolls.map((start, k) => ({ start, k, after: k >= m.firstAfter, landed: m.landed[k], hitAt: c.hitsOf(`roll_${k}`)[0] ?? start + ACT + 1 }))
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gears[0]} icon={gearIconUrl(m.gears[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={m.gears[0].kind} grade={m.gears[0].grade} tested={tested} />

        <RangerCard T={T} r={d.w} name={wName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์ · โดนทักษะ', 'Gear wearer · hit by the skill')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.6} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} label={T('ผู้ใช้ทักษะ', 'Skill user')} value={cName} hlAt={9.6}
              note={stun ? T(`${skillName} — ${words.effect} ${d.stunDur} วิ (${d.casterGrade}★ + 2)`, `${skillName} — ${words.effect} for ${d.stunDur} s (${d.casterGrade}★ + 2)`) : `${skillName} — ${words.effect}`} />
          </>}
          slots={<GearSlots t={t} />} />

        <ResistFormulaCard t={t} T={T} d={d} stun={stun} optName={optName} totalTxt={totalTxt} words={words} />
        <ResistSetCard t={t} T={T} m={m} names={m.gears.map((_, i) => gearName(i))} per={d.per} optName={optName} totalTxt={totalTxt} slots={slots} d={d} />

        {rolls.map(r => <ResistRoll key={r.k} c={c} T={T} r={r} chance={(r.after ? d.after : d.before) / 100} lang={lang} words={words} />)}
        {stun && rolls.filter(r => r.landed).map(r => <StunFx key={r.k} c={c} T={T} at={r.hitAt} dur={d.stunDur} />)}

        <SummaryShell t={t} T={T} start={TL.summary[0]} end={TL.summary[1]} top={-330} title={T(`โอกาสที่ ${wName} ไม่ติด${words.status}`, `${wName}'s chance to resist ${words.status.toLowerCase()}`)}>
          {[{ label: T('ไม่ใส่เกียร์', 'No gear'), v: d.before }, { label: `${optName} ${totalTxt}`, v: d.after }].map((row, i) => {
            const a = TL.summary[0] + 0.5 + i * 0.5
            const bar = easeOut(prog(t, a, a + 0.9))
            return (
              <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, a - 0.2, a + 0.2)) }}>
                <div className="flex justify-between items-baseline text-[26px]">
                  <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
                  <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>{Math.round(row.v * bar)}%</span>
                </div>
                <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`} style={{ width: `${row.v * bar}%` }} />
                </div>
              </div>
            )
          })}
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, TL.summary[0] + 1.8, TL.summary[0] + 2.2)) }}>
            {stun
              ? T(`ต้านได้ = ต้านมึนงง (สูงสุด 95%) · ใส่รวม ${pc(d.total)} ก็ได้แค่ 95% · ต้านได้แล้วไม่มึน แต่ดาเมจของทักษะยังโดนเต็ม · มึนนาน = ดาวของผู้ใช้ + ค่าของทักษะ (ตัวนี้ ${d.stunDur} วิ) · มึนอยู่แล้วติดซ้ำไม่ได้ · ต้านถอยกลับ / ต้านปิดเสียง ใช้สูตรเดียวกัน`,
                `Resist chance = Stun Resistance (max 95%) · even ${pc(d.total)} only gives 95% · resisting stops the stun, but the skill's damage still lands · stun length = the caster's stars + the skill's value (${d.stunDur} s here) · a stunned unit can't be stunned again · Knockback and Silence Resistance work the same way`)
              : T(`ต้านได้ = ต้านถอยกลับ (สูงสุด 95%) · ใส่รวม ${pc(d.total)} ก็ได้แค่ 95% — ยังโดนได้ 5% · ต้านได้แล้วไม่ถอย แต่ดาเมจของทักษะยังโดนเต็ม (สุ่มหลังโดนดาเมจ) · ต้านมึนงง / ต้านปิดเสียง ใช้สูตรเดียวกัน`,
                `Resist chance = Knockback Resistance (max 95%) · even ${pc(d.total)} only gives 95% — 5% still gets through · resisting stops the push, but the skill's damage still lands (the roll comes after the damage) · Stun and Silence Resistance work the same way`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · คลิปนี้แสดงเฉพาะครั้งที่ผล${words.status}ของทักษะติด`, `Gear +${GEAR_LEVEL} (Basic only) · only hits where the skill's ${words.status.toLowerCase()} triggered are shown`)}</div>
        </SummaryShell>
      </>
    )
  }
  return <ScenePlayer src={`/gear-options/scenes/${mode}-resist.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

type Roll = { start: number; k: number; after: boolean; landed: boolean; hitAt: number }
type Words = { status: string; landed: string; effect: string }
const LAND = [0.5, 0.55, 0.55, 0.7]

/** เอฟเฟกต์มึนงง unit22-stun (ท่า loop) เหนือหัว — anchor ล่างกลาง ที่ความสูงยูนิต + 5 pt · นับถอยหลังเวลามึน */
function StunFx({ c, T, at, dur }: { c: OverlayCtx; T: Tr; at: number; dur: number }) {
  const t = c.t
  if (t < at || t >= at + dur) return null
  const p = unitTopPoint(c, ALLY, 5)
  if (!p) return null
  const sp = c.project({ x: p.x, y: p.y })
  const left = Math.max(0, at + dur - t)
  return (
    <>
      <SamSprite base="unit22-stun/unit22-stun" clip="loop" loop frame={Math.floor((t - at) * 30)} x={sp.x} y={sp.y} scale={p.scale * p.zoom} anchorStage stageAnchorY={0} />
      <div className="absolute px-3 py-1 rounded-lg bg-black/75 border-2 border-yellow-300/60 text-[20px] font-black text-yellow-200 tabular-nums whitespace-nowrap"
        style={{ left: sp.x, top: sp.y - 70, transform: 'translateX(-50%)' }}>
        {T('มึนงง', 'Stunned')} {left.toFixed(1)}{T(' วิ', ' s')}
      </div>
    </>
  )
}

/** ก่อนใส่เกียร์: ต้าน 0% → เกมไม่สุ่ม (ป้ายบอก) · หลังใส่: วงล้อ ต้านได้ vs ติดสถานะ · ต้านได้ = MISS ม่วงที่ตัวเรา */
function ResistRoll({ c, T, r, chance, lang, words }: { c: OverlayCtx; T: Tr; r: Roll; chance: number; lang: string; words: Words }) {
  const t = c.t
  const st = r.start
  const vis = span(t, st, st + 4.2, 0.25, 0.3)
  const good = !r.landed
  const goodColor: [string, string] = ['#c084fc', '#7c3aed'], badColor: [string, string] = ['#94a3b8', '#475569']
  const gDeg = Math.max(0, Math.min(1, chance)) * 360
  const theta = good ? gDeg * LAND[r.k] : gDeg + (360 - gDeg) * LAND[r.k]
  const rot = (360 * 5 - theta) * (1 - Math.pow(1 - prog(t, st + SPIN.from, st + SPIN.to), 3))
  const landed = t >= st + SPIN.to
  const pct = Math.round(chance * 100)
  return (
    <>
      {vis.on && (
        <div className="absolute left-1/2 top-[12px] -translate-x-1/2 flex flex-col items-center" style={{ opacity: vis.alpha }}>
          <div className="px-3 py-0.5 rounded-lg bg-black/70 text-[16px] font-bold text-gray-200 whitespace-nowrap">
            {r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · {T(`ครั้งที่ ${r.k + 1}`, `Hit ${r.k + 1}`)}
          </div>
          {r.after ? (
            <>
              <div className="mt-3"><Wheel chance={chance} rot={rot} goodColor={goodColor} badColor={badColor} scale={easeOutBack(Math.min(1, (t - st) / 0.3))} center={`${pct}%`} sub={T('ต้านได้', 'Resist')} /></div>
              <div className="mt-2 flex gap-2 text-[17px] font-black text-white">
                <span className="px-3 py-1 rounded-lg bg-black/65">● {T('ต้านได้', 'Resist')} {pct}%</span>
                <span className="px-3 py-1 rounded-lg bg-black/65 text-gray-300">● {words.landed} {100 - pct}%</span>
              </div>
              {landed && (
                <div className={`mt-2 px-4 py-1.5 rounded-xl border-2 ${good ? 'bg-violet-600/95 border-violet-200/70' : 'bg-slate-700/95 border-white/25'}`}
                  style={{ transform: `scale(${easeOutBack(prog(t, st + SPIN.to, st + SPIN.to + 0.3))})` }}>
                  <span className="text-[19px] font-black text-white whitespace-nowrap">{good ? T(`ต้านได้! ไม่${words.status}`, `Resisted! No ${words.status.toLowerCase()}`) : T(`ไม่ติด 5% → ${words.landed}`, `The 5% → ${words.landed.toLowerCase()}`)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="mt-3 px-5 py-2 rounded-xl bg-slate-700/95 border-2 border-white/25 text-center">
              <div className="text-[22px] font-black text-white whitespace-nowrap">{T('ต้าน 0% → เกมไม่สุ่ม', 'Resistance 0% → no roll')}</div>
              <div className="text-[18px] font-bold text-gray-300">{T(`ผล${words.status}ติดทุกครั้ง`, `The ${words.status.toLowerCase()} always lands`)}</div>
            </div>
          )}
        </div>
      )}
      {good && <MissPop c={c} actorId={ALLY} at={r.hitAt} lang={lang} purple />}
    </>
  )
}

function ResistFormulaCard({ t, T, d, stun, optName, totalTxt, words }: { t: number; T: Tr; d: Data; stun: boolean; optName: string; totalTxt: string; words: Words }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T(`เกมสุ่มต้าน${words.status}แบบนี้`, `How the game rolls ${words.status.toLowerCase()} resistance`)}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[28px] font-black text-violet-200">{T('ทักษะโดน (ดาเมจเข้าก่อน) → สุ่มต้าน', 'Skill hits (damage first) → resist roll')}: {T('โอกาส', 'chance')} = {optName} <span className="text-rose-300">({T('สูงสุด 95%', 'max 95%')})</span></span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {stun
            ? T(`ต้านได้ = ไม่มึน + ป้าย MISS สีม่วง · ไม่ได้ = มึนงง ${d.stunDur} วิ (ดาวของผู้ใช้ ${d.casterGrade} + 2) ขยับ/โจมตีไม่ได้ · มึนอยู่แล้วติดซ้ำไม่ได้`, `Resisted = no stun + a purple MISS · otherwise stunned for ${d.stunDur} s (caster's ${d.casterGrade} stars + 2) · a stunned unit can't be stunned again`)
            : T('ต้านได้ = ไม่ถอย + ป้าย MISS สีม่วง · ไม่ได้ = เล่นท่าถอยกลับ แล้วถูกผลักถอยหลัง 48 หน่วยใน 0.2 วิ', 'Resisted = no push + a purple MISS · otherwise the knockback animation plays and the unit is pushed back 48 units in 0.2 s')}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{T('ต้าน', 'Resist')} {d.before}%</div></div>
        <div className="rounded-2xl bg-[#1d1233] border-2 border-violet-400/50 px-4 py-3"><div className="text-[20px] font-bold text-violet-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{pc(d.total)} → {T('เพดาน', 'cap')} 95%</span></Fit1>
          <div className="text-[40px] font-black text-violet-300 leading-tight">{T('ต้าน', 'Resist')} {d.after}%</div></div>
      </div>
    </FitCard>
  )
}

function ResistSetCard({ t, T, m, names, per, optName, totalTxt, slots, d }: { t: number; T: Tr; m: ModeCfg; names: string[]; per: number[]; optName: string; totalTxt: string; slots: Partial<Record<GearKind, SlotGear>>; d: Data }) {
  const at = m.equipAt
  const s = span(t, at - 1.3, at + 1.7, 0.4, 0.35)
  if (!s.on) return null
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, at - 1.15 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(m.gears[i].code)} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n} +{GEAR_LEVEL}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">+{pc(per[i])}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName} {T('รวม', 'total')}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-1 text-right text-[22px] font-bold text-gray-300 tabular-nums">{T('ต้านได้', 'Resist')} {d.before}% → <span className="text-amber-300 font-black">{d.after}%</span></div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={equipSlots(slots, at)} />
      </div>
    </FitCard>
  )
}

export const KnockbackResistTutorial = ({ autoPlay }: { autoPlay: boolean }) => <StatusResistTutorial autoPlay={autoPlay} mode="knockback" />
export const StunResistTutorial = ({ autoPlay }: { autoPlay: boolean }) => <StatusResistTutorial autoPlay={autoPlay} mode="stun" />
