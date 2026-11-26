'use client'

// ====================================================
// วิดีโอ อัตราโจมตีโดนแน่นอน (surehit — ตีปกติ) / อัตราโจมตีโดนแน่นอนของทักษะ (skill-surehit — ทักษะ)
//   ผู้ตี (ซ้าย ใส่เกียร์) Brown ตำนานร็อค (แสง) · เป้า (ขวา) Ares Cony (น้ำ) ใส่ชุดหลบสูงสุด → หลบติดเพดาน 99%
//   ไม่ใส่เกียร์ 2 ครั้ง: วงล้อโอกาสโดน → MISS · ใส่อาวุธโดนแน่นอน 2 ครั้ง: วงล้อโดนแน่นอน ติด → โดน · ไม่ติด → สุ่มหลบปกติ → MISS
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-surehit-scene.cjs (ROLLS / EQUIP_AT ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so — ตีปกติ 0xced0e0 · ทักษะ 0xcf132c):
//   S = โดนแน่นอนของผู้ตี > 0 → สุ่ม 0–1 < S · C = ต้านการโจมตีของเป้า > 0 → สุ่ม 0–1 < C
//   S ติด C ไม่ติด = โดนแน่นอน (ข้ามการหลบ) · C ติด S ไม่ติด = พลาดแน่นอน · อื่นๆ = สุ่มหลบปกติ
//   สุ่มหลบ: หลบ = min(99% [MAX_AVOID_FACTOR / MAX_SKILL_AVOID_FACTOR], หลบ + เกียร์)
//     โอกาสโดน % = (100 − หลบ%) × (1 + แม่นยำของผู้ตี) + โบนัสคู่ธาตุ × 100 (bas/ski_atk_acc แสง → น้ำ = 0.05) · สุ่ม 1–100 ≤ โอกาสโดน = โดน
//   โอกาสโดนรวม = S + (1 − S) × โอกาสโดนปกติ (ไม่นับ C — เป้าไม่มีค่าต้าน)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, switchableFor, useTutorialData, type GearKind, type RangerStats, type SlotGear,
} from './kit'
import { skillHitChance } from './skill-rates'
import { RollStack, type RowSpec } from './rollstack'
import { MissPop } from './battleui'

export type SurehitMode = 'surehit' | 'skill-surehit'
type Tr = (th: string, en: string) => string

const ENEMY = 'a9ijjdi134'
/** เวลาในวิดีโอ — ตรงกับ build-surehit-scene.cjs */
const ROLLS = [18.6, 22.6, 30.6, 36.0]
const ACT = 2.1
const EQUIP_AT = 28.6
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], summary: [43.4, 51] } as const

const ATTACKER = 'u1260e-brown', TARGET = 'u1002e-cony'
const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1002e-cony': 'Ares Cony' }
const PAIR = 0.05   // bas_atk_acc / ski_atk_acc แสง → น้ำ (unit_elmt_cntrry)

interface Cfg {
  type: string; nameKey: string; title: [string, string]
  gear: { code: string; grade: number; en: string }
  // ชุดหลบสูงสุดของเป้า (ค้นทุกเกียร์ +5 ตามกฎเกม) · sw = Switchable ที่นับ
  evType: string; evKey: string; evRate: 'evadeRate' | 'skillEvadeRate'; hitRate: 'hitRate' | 'skillHitRate'
  targetGears: { code: string; kind: GearKind; grade: number; sw?: boolean }[]
}
const CFG: Record<SurehitMode, Cfg> = {
  surehit: {
    type: 'CLN_AVD_PROB_MUL', nameKey: 'GEAR_ATTR_CLN_AVD_PROB_MUL_nm', title: ['อัตราโจมตีโดนแน่นอน', 'Surehit Rate'],
    gear: { code: 'eq_2208_wpn_07', grade: 7, en: "[HB]Kaioh's Shuriken" },
    evType: 'AVD_PROB_MUL', evKey: 'GEAR_ATTR_AVD_PROB_MUL_nm', evRate: 'evadeRate', hitRate: 'hitRate',
    targetGears: [
      { code: 'eq_ace_wpn_26', kind: 'weapon', grade: 6 }, { code: 'eq_amr_16metal', kind: 'armor', grade: 6 }, { code: 'eq_um_acc_17', kind: 'acc', grade: 7, sw: true },
    ],
  },
  'skill-surehit': {
    type: 'CLN_SKLAVD_PROB_MUL', nameKey: 'GEAR_ATTR_CLN_SKLAVD_PROB_MUL_nm', title: ['อัตราโจมตีโดนแน่นอนของทักษะ', 'Skill Surehit Rate'],
    gear: { code: 'eq_2202_wpn_07', grade: 7, en: '[YSH] Kikujumonji' },
    evType: 'SKLAVD_PROB_MUL', evKey: 'GEAR_ATTR_SKLAVD_PROB_MUL_nm', evRate: 'skillEvadeRate', hitRate: 'skillHitRate',
    targetGears: [
      { code: 'eq_wpn_sleg_008', kind: 'weapon', grade: 8 }, { code: 'eq_2204_amr_17', kind: 'armor', grade: 7, sw: true }, { code: 'eq_acc_06sf', kind: 'acc', grade: 6 },
    ],
  },
}

type Rates = RangerStats['rates'] & { evadeRate?: number; skillEvadeRate?: number; hitRate?: number; skillHitRate?: number }

async function loadData(mode: SurehitMode) {
  const m = CFG[mode]
  const [atk, tgt, g, ...tg] = await Promise.all([loadStats(ATTACKER), loadStats(TARGET), loadGear(m.gear.code), ...m.targetGears.map(x => loadGear(x.code))])
  const basicOf = (gear: typeof g.gear, type: string) => gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const sure = basicOf(g.gear, m.type)
  // หลบของเป้า: ค่าเดิม + Basic ทุกชิ้น + Switchable ที่ตรงเงื่อนไข (ตัวสูงสุดตัวเดียว)
  const evGear = tg.reduce((s, x) => s + basicOf(x.gear, m.evType), 0)
    + Math.max(0, ...m.targetGears.map((x, i) => (x.sw ? switchableFor(tg[i].gear, m.evKey, tgt).switchableGrowth?.baseMax ?? 0 : 0)))
  const evBase = (tgt.rates as Rates)[m.evRate] ?? 0
  const hit = (atk.rates as Rates)[m.hitRate] ?? 0
  const res = skillHitChance(Math.fround(evBase) + Math.fround(evGear), hit, PAIR)
  const normal = res.real / 100
  return { atk, tgt, gear: g.gear, sure, evBase, evGear, hit, res, normal, total: sure + (1 - sure) * normal }
}
type Data = Awaited<ReturnType<typeof loadData>>

const pc = (v: number) => {
  const x = v * 100
  return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%`
}

type Roll = { start: number; k: number; after: boolean; ok: boolean; hitAt: number }

function SurehitTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: SurehitMode }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = CFG[mode]
  const skill = mode === 'skill-surehit'
  const gearName = tGear(m.gear.code, m.gear.en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const evName = tr('equip', m.evKey, skill ? T('อัตราการหลบทักษะ', 'Skill Evade Rate') : T('อัตราการหลบหลีก', 'Evade Rate'))
  const atkName = tRanger(ATTACKER, EN_NAMES[ATTACKER]), tgtName = tRanger(TARGET, EN_NAMES[TARGET])
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.sure)}`
  const tgtSlots = Object.fromEntries(m.targetGears.map(x => [x.kind, { icon: gearIconUrl(x.code), grade: x.grade }])) as Partial<Record<GearKind, SlotGear>>
  const actWord = skill ? T('ทักษะ', 'skill') : T('ตีปกติ', 'normal attack')

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rolls: Roll[] = ROLLS.map((start, k) => {
      const cue = c.scene.cues.find(x => x.id === `roll_${k}`) as { flash?: boolean } | undefined
      const hits = c.hitsOf(`roll_${k}`)
      return { start, k, after: k >= 2, ok: cue?.flash !== false, hitAt: hits[0] ?? start + ACT + 1 }
    })
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIconUrl(m.gear.code)} name={gearName} effName={effName}
          switchable={null} kind="weapon" grade={m.gear.grade} tested={tested} />

        <RangerCard T={T} r={d.tgt} name={tgtName} s={span(t, TL.ranger[0], TL.ranger[1])} x={60} y={24}
          tag={T('เป้าหมาย · ใส่ชุดหลบสูงสุด', 'Target · max evade gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} label={evName} value="99%" hlAt={8.6}
              note={T(`${pc(d.evBase)} + เกียร์ ${pc(d.evGear)} = ${pc(d.evBase + d.evGear)} → เพดาน 99%`, `${pc(d.evBase)} + gear ${pc(d.evGear)} = ${pc(d.evBase + d.evGear)} → capped at 99%`)} />
            <StatRow t={t} label={T(`โอกาสที่${actWord}ของ ${atkName} โดน`, `Chance ${atkName}'s ${actWord} hits`)} value={`${d.res.real}%`} hlAt={9.6}
              note={`(100 − 99) × ${(1 + d.hit).toFixed(1)} + ${Math.round(PAIR * 100)} = ${d.res.raw.toFixed(1)}`} />
          </>}
          slots={<GearSlots t={t} filled={tgtSlots} />} />

        <FormulaCard t={t} T={T} d={d} optName={optName} totalTxt={totalTxt} actWord={actWord} />
        <EquipCard t={t} T={T} gear={m.gear} gearName={gearName} optName={optName} totalTxt={totalTxt} />

        {rolls.map(r => <RollUi key={r.k} c={c} T={T} r={r} d={d} lang={lang} />)}

        <Summary t={t} T={T} d={d} rolls={rolls} optName={optName} totalTxt={totalTxt} actWord={actWord} />
      </>
    )
  }

  return <ScenePlayer src={`/gear-options/scenes/${mode}.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

// ── การ์ดสูตร ──
function FormulaCard({ t, T, d, optName, totalTxt, actWord }: { t: number; T: Tr; d: Data; optName: string; totalTxt: string; actWord: string }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  const box = 'rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3'
  const gold = 'rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3'
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T(`เกมเช็คโดนแน่นอนก่อนสุ่มหลบ (${actWord})`, `The game checks Surehit before the evade roll (${actWord})`)}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-white">{T('สุ่มโดนแน่นอน', 'Roll Surehit')} · {T('ติด', 'success')} = <span className="text-amber-300">{T('โดนทันที ไม่สนการหลบ', 'hits, ignoring evade')}</span> · {T('ไม่ติด', 'fail')} = {T('สุ่มหลบตามปกติ', 'normal evade roll')}</span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {T('ถ้าเป้ามี "อัตราต้านการโจมตี" แล้วติดพร้อมกัน จะหักล้างกัน → กลับไปสุ่มหลบตามปกติ', 'If the target\'s Cancel Rate also succeeds, the two cancel out → back to the normal evade roll')}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-2 text-center" style={step(t, a + 1.3)}>
        <Fit1 className="text-center"><span className="text-[26px] font-black text-amber-200">{T('โอกาสโดนรวม', 'Total hit chance')} = {T('โดนแน่นอน', 'Surehit')} + ({T('1 − โดนแน่นอน', '1 − Surehit')}) × {T('โอกาสโดนปกติ', 'normal hit chance')}</span></Fit1>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.4)}>
        <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200">{T('เป้าหลบ 99% → โอกาสโดนปกติ', 'Target 99% evade → normal hit')}</span></Fit1>
          <div className="text-[44px] font-black text-white leading-tight">{pc(d.normal)}</div></div>
        <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{pc(d.sure)} + {pc(1 - d.sure)} × {pc(d.normal)}</span></Fit1>
          <div className="text-[44px] font-black text-amber-300 leading-tight">{pc(d.total)}</div></div>
      </div>
    </FitCard>
  )
}

// ── การ์ดใส่เกียร์ (อาวุธชิ้นเดียว) ──
function EquipCard({ t, T, gear, gearName, optName, totalTxt }: { t: number; T: Tr; gear: Cfg['gear']; gearName: string; optName: string; totalTxt: string }) {
  const s = span(t, TL.equip[0], TL.equip[1], 0.4, 0.35)
  if (!s.on) return null
  const at = EQUIP_AT
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 flex items-center gap-3" style={step(t, TL.equip[0] + 0.15)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gearIconUrl(gear.code)} alt="" crossOrigin="anonymous" className="w-14 h-14 shrink-0 object-contain" />
        <Fit1 className="flex-1"><span className="text-[24px] font-bold text-white">{gearName} +{GEAR_LEVEL}</span></Fit1>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-1 text-right text-[19px] font-bold text-gray-400">{T('มีแค่อาวุธ · ค่าสูงสุดในเกม', 'Weapons only · the highest in the game')}</div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} filled={t >= at ? { weapon: { icon: gearIconUrl(gear.code), grade: gear.grade } } : undefined} />
      </div>
    </FitCard>
  )
}

// ── วงล้อ: ไม่ใส่เกียร์ = โอกาสโดนปกติ · ใส่เกียร์ = โดนแน่นอน (ไม่ติด → ตกไปสุ่มหลบปกติ) ──
const LAND = [0.6, 0.35, 0.55, 0.62]

function RollUi({ c, T, r, d, lang }: { c: OverlayCtx; T: Tr; r: Roll; d: Data; lang: string }) {
  const t = c.t
  const st = r.start
  const hitColor: [string, string] = ['#86efac', '#16a34a'], sureColor: [string, string] = ['#fde047', '#d97706']
  const evadeWheel = (ok: boolean, land: number): RowSpec => ({
    wheels: [{ chance: d.normal, good: ok, goodColor: hitColor, goodLabel: T('โดน', 'Hit'), badLabel: 'MISS', sub: T('โอกาสโดน', 'Hit chance'), land }],
    note: ok ? T('โดน!', 'Hit!') : T('หลบได้ → MISS', 'Evaded → MISS'), noteGood: ok,
  })
  // ไม่ใส่เกียร์: สุ่มหลบอย่างเดียว · ใส่เกียร์: สุ่มโดนแน่นอนก่อน → ไม่ติด = วงล้อหลบปกติโผล่ด้านล่าง
  const rows: RowSpec[] = !r.after
    ? [evadeWheel(r.ok, LAND[r.k])]
    : [
        {
          wheels: [{ chance: d.sure, good: r.ok, goodColor: sureColor, goodLabel: T('โดนแน่นอน', 'Surehit'), badLabel: T('ไม่ติด', 'Fail'), sub: T('โดนแน่นอน', 'Surehit'), land: LAND[r.k] }],
          note: r.ok ? T('ติด! โดนแน่นอน ข้ามการหลบ', 'Success! Sure hit, evade ignored') : T('ไม่ติด → สุ่มหลบตามปกติ', 'Failed → normal evade roll'), noteGood: r.ok,
        },
        ...(r.ok ? [] : [evadeWheel(false, 0.5)]),
      ]
  const header = `${r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · ${T(`ครั้งที่ ${(r.k % 2) + 1}`, `Attack ${(r.k % 2) + 1}`)}`
  // ป้าย MISS ที่เป้า (แบบเกม: ยืดสูง 1.8 → 1 ใน 0.13 วิ · ค้าง 0.4 · จาง 0.3)
  const tp = c.actorAt(ENEMY)
  const tpos = tp ? c.project(tp) : null

  return (
    <>
      <RollStack c={c} header={header} st={st} rows={rows} end={Math.max(st + 4.2, r.hitAt + 1.1)} />
      {!r.ok && tpos && <MissPop t={t} at={r.hitAt} x={tpos.x + 60} y={tpos.y - 210} lang={lang} />}
    </>
  )
}

// ── สรุป ──
function Summary({ t, T, d, rolls, optName, totalTxt, actWord }: { t: number; T: Tr; d: Data; rolls: Roll[]; optName: string; totalTxt: string; actWord: string }) {
  const S = TL.summary[0]
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const rows = [{ label: T('ไม่ใส่เกียร์', 'No gear'), v: d.normal }, { label: `${optName} ${totalTxt}`, v: d.total }]
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330}
      title={T(`โอกาสที่${actWord}โดนเป้าที่หลบ 99%`, `Chance a ${actWord} hits a 99%-evade target`)}>
      {rows.map((row, i) => (
        <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
          <div className="flex justify-between items-baseline text-[26px]">
            <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
            <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>{pc(row.v * bar(S + 0.5 + i * 0.5))}</span>
          </div>
          <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`} style={{ width: `${row.v * 100 * bar(S + 0.5 + i * 0.5)}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, TL.summary[1], 0.5, 0.6))}>
        {[false, true].map(after => (
          <div key={String(after)} className={`rounded-2xl border-2 p-3 text-center ${after ? 'bg-[#2a1f08] border-amber-400/50' : 'bg-white/[0.05] border-white/10'}`}>
            <div className="text-[20px] text-gray-300 font-bold">{T('ในคลิป', 'In this clip')} · {after ? T('ใส่เกียร์', 'gear') : T('ไม่ใส่', 'no gear')}</div>
            <div className="mt-2 flex justify-center gap-3">
              {rolls.filter(r => r.after === after).map(r => (
                <span key={r.k} className={`px-3 py-1 rounded-lg text-[20px] font-black ${r.ok ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-gray-100'}`}>{r.ok ? T('โดน', 'Hit') : 'MISS'}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
        {T(`ยิ่งเป้าหลบเก่ง ยิ่งคุ้ม: เป้าหลบเต็ม 99% เหลือโดน ${pc(d.normal)} → ใส่เกียร์ ${pc(d.sure)} + ${pc(1 - d.sure)} × ${pc(d.normal)} = ${pc(d.total)} · ถ้าเป้ามีอัตราต้านการโจมตีและติดพร้อมกัน จะหักล้างกันแล้วกลับไปสุ่มหลบ`,
          `Best against evasive targets: at 99% evade only ${pc(d.normal)} hits → with gear ${pc(d.sure)} + ${pc(1 - d.sure)} × ${pc(d.normal)} = ${pc(d.total)} · if the target's Cancel Rate also succeeds, both cancel and the evade roll happens`)}
      </div>
      <div className="mt-2 text-center text-[18px] text-gray-500">
        {T(`เกียร์ +${GEAR_LEVEL} · ค่าสูงสุดที่ใส่ได้จริงตามกฎเกม`, `Gear +${GEAR_LEVEL} · the highest legal value`)}
      </div>
    </SummaryShell>
  )
}

export const SurehitRateTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SurehitTutorial autoPlay={autoPlay} mode="surehit" />
export const SkillSurehitTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SurehitTutorial autoPlay={autoPlay} mode="skill-surehit" />
