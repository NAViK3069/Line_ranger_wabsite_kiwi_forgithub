'use client'

// ====================================================
// วิดีโอ อัตราการใช้ทักษะอีกครั้ง (Skill Reactivation Rate) — Brown ตำนานร็อค (ซ้าย ใส่เกียร์) ตี Brown อนูบิสเพชฌฆาต (ขวา)
//   ไม่ใส่เกียร์: ร่ายทักษะ (0% — เกมไม่สุ่ม) → จังหวะถัดไปตีปกติ
//   ใส่ [TR2] Block Fence +5 (+40.2%): ร่ายทักษะ → วงล้อติด → จังหวะถัดไปร่ายทักษะเดิมซ้ำ · รอบ 2 ไม่ติด → ตีปกติ
//   ฉาก: public/gear-options/scenes/skill-reactivate.anme.json ← scripts/gear-options/build-reactivate-scene.cjs (ROUNDS / NEXT_GAP ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so — จังหวะโจมตี 0xd00f88):
//   เกียร์ DOUBLE_SKL_PROB_MUL (0x26) → doubleSkillProb · มีแค่อาวุธ Basic 6.7% × 6 = 40.2% ที่ +5 (ไม่มีใน Switchable)
//   ร่ายทักษะตามปกติ (ผ่าน checkSkill) → สุ่ม 0–1 < โอกาส · ติด = จองทักษะนั้นไว้
//   จังหวะโจมตีถัดไป: มีทักษะที่จอง → ร่ายทันที ไม่สุ่มโอกาสใช้ทักษะ ไม่เช็คเวลารอ (เช็คแค่ศัตรูอยู่ในระยะ) + ไอคอน doubleskill เหนือหัว
//     ทักษะที่ร่ายซ้ำไม่สุ่มต่อ → ติดกันได้สูงสุด 2 ครั้ง
//   ไอคอน (0xd01564): เหนือหัว +60 · จางเข้า + ลอยขึ้น 15 ใน 0.2 วิ → ค้าง 0.2 → จางออก + ลอยขึ้น 15 ใน 0.2 วิ
//     ภาพ doubleskill.png จาก public/gameres/hd/battle/battle_ui.plist (APK ล่าสุด)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  firstSkill, gearIconUrl, loadGear, loadStats, step, useTutorialData, type RangerStats,
} from './kit'
import { Wheel } from './skill-rates'
import { DoubleSkillPop } from './battleui'

type Tr = (th: string, en: string) => string

const ALLY = 'ak1zzx9ceu'
/** เวลาในวิดีโอ — ตรงกับ build-reactivate-scene.cjs */
const ROUNDS = [18.6, 30.6, 38.0]
const NEXT_GAP = 3.4
const SPIN = { from: 0.3, to: 1.6 }
const EQUIP_AT = 28.6
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], summary: [45.2, 53] } as const

const TYPE = 'DOUBLE_SKL_PROB_MUL'
const NAME_KEY = 'GEAR_ATTR_DOUBLE_SKL_PROB_MUL_nm'
const WEARER = 'u1260e-brown', OTHER = 'u1242e-brown'
const GEAR = { code: 'eq_2408_wpn_28', grade: 8, en: '[TR2] Block Fence' }   // ไม่มีค่าโจมตีโดนแน่นอนของทักษะปน (กันสับสน)
const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1242e-brown': 'Executor Anubis Brown' }

type Skill = RangerStats['skills'][number] & { probability?: number; cooldown?: number }

async function loadData() {
  const [wearer, other, g] = await Promise.all([loadStats(WEARER) as Promise<RangerStats>, loadStats(OTHER) as Promise<RangerStats>, loadGear(GEAR.code)])
  const basicOf = (type: string) => g.gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  return { wearer, other, gear: g.gear, total: basicOf(TYPE), skill: firstSkill(wearer) as Skill }
}
type Data = Awaited<ReturnType<typeof loadData>>

const pc = (v: number) => {
  const x = v * 100
  return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%`
}

type Round = { at: number; k: number; after: boolean; ok: boolean }

export function SkillReactivateTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearName = tGear(GEAR.code, GEAR.en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', NAME_KEY, T('อัตราการใช้ทักษะอีกครั้ง', 'Skill Reactivation Rate'))
  const wearerName = tRanger(WEARER, EN_NAMES[WEARER]), otherName = tRanger(OTHER, EN_NAMES[OTHER])
  const skillName = d.skill ? tSkill(d.skill.code, d.skill.name) : ''
  const cd = d.skill?.cooldown ?? 0
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === TYPE ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.total)}`

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rounds: Round[] = ROUNDS.map((at, k) => {
      const next = c.scene.cues.find(x => x.id === `next_${k}`) as { release?: string } | undefined
      return { at, k, after: k >= 1, ok: next?.release === 's_attack' }
    })
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIconUrl(GEAR.code)} name={gearName} effName={effName}
          switchable={null} kind="weapon" grade={GEAR.grade} tested={tested} />

        <RangerCard T={T} r={d.wearer} name={wearerName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.6} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} label={T(`ทักษะ ${skillName}`, `Skill ${skillName}`)} value={T(`รอ ${cd} วิ`, `${cd} s CD`)} hlAt={9.6}
              note={T(`โอกาสใช้ ${pc(d.skill?.probability ?? 0)} · ใช้แล้วต้องรอ ${cd} วิ`, `${pc(d.skill?.probability ?? 0)} chance · ${cd} s cooldown after use`)} />
          </>}
          slots={<GearSlots t={t} />} />

        <FormulaCard t={t} T={T} optName={optName} totalTxt={totalTxt} chance={d.total} />
        <EquipCard t={t} T={T} gearName={gearName} optName={optName} totalTxt={totalTxt} />

        {rounds.map(r => <RoundUi key={r.k} c={c} T={T} r={r} chance={r.after ? d.total : 0} skillName={skillName} cd={cd} />)}

        <Summary t={t} T={T} d={d} rounds={rounds} optName={optName} totalTxt={totalTxt} cd={cd} />
      </>
    )
  }

  return <ScenePlayer src="/gear-options/scenes/skill-reactivate.anme.json" autoPlay={autoPlay} overlay={overlay} />
}

// ── การ์ดสูตร ──
function FormulaCard({ t, T, optName, totalTxt, chance }: { t: number; T: Tr; optName: string; totalTxt: string; chance: number }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  const box = 'rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3'
  const gold = 'rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3'
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมสุ่มใช้ทักษะอีกครั้งแบบนี้', 'How the game rolls Skill Reactivation')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-white">{T('ร่ายทักษะ → สุ่ม', 'Skill cast → roll')} · {T('ติด', 'success')} = <span className="text-amber-300">{T('จังหวะโจมตีถัดไปร่ายทักษะเดิมซ้ำ', 'the next attack casts the same skill again')}</span></span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {T('ทักษะที่ร่ายซ้ำไม่ต้องสุ่มโอกาสใช้ทักษะ และไม่ต้องรอเวลารอทักษะ (ขอแค่ศัตรูอยู่ในระยะ)',
            'The repeat skips the skill-use roll and ignores the cooldown (the enemy only needs to be in range)')}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-rose-900/30 border-2 border-rose-400/50 px-5 py-2 text-center" style={step(t, a + 1.3)}>
        <Fit1 className="text-center"><span className="text-[24px] font-black text-rose-200">{T('ทักษะที่ร่ายซ้ำไม่สุ่มต่อ — ติดกันได้สูงสุด 2 ครั้ง', 'The repeat never rolls again — at most 2 casts in a row')}</span></Fit1>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.4)}>
        <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[44px] font-black text-white leading-tight">0%</div>
          <Fit1><span className="text-[20px] font-bold text-gray-300">{T('เกมไม่สุ่มเลย → ทักษะครั้งเดียว', 'No roll at all → one cast')}</span></Fit1></div>
        <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <div className="text-[44px] font-black text-amber-300 leading-tight">{pc(chance)}</div>
          <Fit1><span className="text-[20px] font-bold text-gray-200">{T(`ร่ายทักษะทุกครั้ง มีโอกาส ${pc(chance)} ได้ร่ายซ้ำ`, `Every cast has a ${pc(chance)} chance to repeat`)}</span></Fit1></div>
      </div>
    </FitCard>
  )
}

// ── การ์ดใส่เกียร์ ──
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
      <div className="mt-1 text-right text-[19px] font-bold text-gray-400">{T('มีแค่อาวุธ · Basic 6.7% × 6 ระดับ', 'Weapons only · Basic 6.7% × 6 levels')}</div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} filled={t >= at ? { weapon: { icon: gearIconUrl(GEAR.code), grade: GEAR.grade } } : undefined} />
      </div>
    </FitCard>
  )
}

// ── แต่ละรอบ: ร่ายทักษะ → (วงล้อ) → จังหวะถัดไป ──
const LAND = [0.5, 0.55, 0.45]

function RoundUi({ c, T, r, chance, skillName, cd }: { c: OverlayCtx; T: Tr; r: Round; chance: number; skillName: string; cd: number }) {
  const t = c.t
  const st = r.at
  const next = st + NEXT_GAP
  const end = next + 2.2
  const vis = span(t, st, end, 0.25, 0.3)
  const goodColor: [string, string] = ['#fde047', '#d97706'], badColor: [string, string] = ['#94a3b8', '#475569']
  const gDeg = Math.max(0, Math.min(1, chance)) * 360
  const theta = r.ok ? gDeg * LAND[r.k] : gDeg + (360 - gDeg) * LAND[r.k]
  const final = 360 * 5 - theta
  const sp = prog(t, st + SPIN.from, st + SPIN.to)
  const rot = final * (1 - Math.pow(1 - sp, 3))
  const landed = t >= st + SPIN.to
  const goodPct = pc(chance), badPct = pc(1 - chance)
  const chip = (color: [string, string], txt: string) => (
    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/65">
      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${color[0]}, ${color[1]})` }} />
      <span className="text-[17px] font-black text-white whitespace-nowrap">{txt}</span>
    </div>
  )
  // ผลของจังหวะถัดไป (ป้ายด้านบน)
  const nextOn = t >= next
  const nextK = easeOutBack(prog(t, next, next + 0.3))
  // ไอคอน doubleskill.png เหนือหัวแบบเกม (battleui.tsx)
  const ap = c.actorAt(ALLY)
  const apos = ap ? c.project(ap) : null

  return (
    <>
      {vis.on && (
        <div className="absolute left-1/2 top-[12px] -translate-x-1/2 flex flex-col items-center" style={{ opacity: vis.alpha }}>
          <div className="px-3 py-0.5 rounded-lg bg-black/70 text-[16px] font-bold text-gray-200 whitespace-nowrap">
            {r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · {T(`ร่ายทักษะ ${skillName}`, `Cast ${skillName}`)}
          </div>
          {r.after ? <>
            <div className="mt-3">
              <Wheel chance={chance} rot={rot} goodColor={goodColor} badColor={badColor} scale={easeOutBack(Math.min(1, (t - st) / 0.3))}
                center={goodPct} sub={T('ซ้ำ', 'Again')} />
            </div>
            <div className="mt-2 flex gap-2">
              {chip(goodColor, `${T('ร่ายซ้ำ', 'Repeat')} ${goodPct}`)}
              {chip(badColor, `${T('ไม่ซ้ำ', 'No repeat')} ${badPct}`)}
            </div>
            {landed && (
              <div className={`mt-2 px-4 py-1.5 rounded-xl border-2 text-center ${r.ok ? 'bg-emerald-600/95 border-emerald-200/70' : 'bg-slate-700/95 border-white/25'}`}
                style={{ transform: `scale(${easeOutBack(prog(t, st + SPIN.to, st + SPIN.to + 0.3))})` }}>
                <span className="text-[19px] font-black text-white whitespace-nowrap">{r.ok ? T('ติด! จองทักษะไว้ใช้จังหวะถัดไป', 'Success! Skill saved for the next attack') : T('ไม่ติด → จังหวะถัดไปสุ่มตามปกติ', 'Failed → next attack rolls as usual')}</span>
              </div>
            )}
          </> : (
            <div className="mt-3 px-6 py-4 rounded-2xl bg-[#0b1122]/90 border-2 border-white/15 text-center" style={{ transform: `scale(${easeOutBack(Math.min(1, (t - st) / 0.3))})` }}>
              <div className="text-[18px] font-bold text-gray-400">{T('อัตราการใช้ทักษะอีกครั้ง', 'Skill Reactivation')}</div>
              <div className="text-[54px] font-black text-white leading-tight tabular-nums">0%</div>
              <div className="text-[19px] font-black text-gray-300 whitespace-nowrap">{T('เกมไม่สุ่ม → ไม่จองทักษะ', 'No roll → nothing saved')}</div>
            </div>
          )}
          {nextOn && (
            <div className={`mt-3 px-5 py-2 rounded-xl border-2 text-center ${r.ok ? 'bg-amber-500/95 border-amber-100/70' : 'bg-slate-700/95 border-white/25'}`} style={{ transform: `scale(${nextK})` }}>
              <div className="text-[15px] font-bold text-white/80">{T('จังหวะโจมตีถัดไป', 'Next attack')}</div>
              <div className="text-[21px] font-black text-white whitespace-nowrap">
                {r.ok ? T(`ร่าย ${skillName} ซ้ำ! (ไม่สุ่ม · ไม่รอ ${cd} วิ)`, `${skillName} again! (no roll · ignores ${cd} s CD)`) : T(`ตีปกติ (${skillName} ยังติดเวลารอ)`, `Normal attack (${skillName} on cooldown)`)}
              </div>
            </div>
          )}
        </div>
      )}
      {r.ok && apos && <DoubleSkillPop t={t} at={next} x={apos.x} y={apos.y - 220} />}
    </>
  )
}

// ── สรุป ──
function Summary({ t, T, d, rounds, optName, totalTxt, cd }: { t: number; T: Tr; d: Data; rounds: Round[]; optName: string; totalTxt: string; cd: number }) {
  const S = TL.summary[0]
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const avg = 1 + d.total
  const rows = [{ label: T('ไม่ใส่เกียร์', 'No gear'), v: 1 }, { label: `${optName} ${totalTxt}`, v: avg }]
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330}
      title={T('ทักษะที่ได้ร่าย ต่อการติดทักษะ 1 ครั้ง (เฉลี่ย)', 'Casts per triggered skill (average)')}>
      {rows.map((row, i) => (
        <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
          <div className="flex justify-between items-baseline text-[26px]">
            <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
            <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>{T(`${(row.v * bar(S + 0.5 + i * 0.5)).toFixed(i ? 3 : 2)} ครั้ง`, `${(row.v * bar(S + 0.5 + i * 0.5)).toFixed(i ? 3 : 2)} casts`)}</span>
          </div>
          <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`} style={{ width: `${(row.v / 2) * 100 * bar(S + 0.5 + i * 0.5)}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, TL.summary[1], 0.5, 0.6))}>
        {[false, true].map(after => (
          <div key={String(after)} className={`rounded-2xl border-2 p-3 text-center ${after ? 'bg-[#2a1f08] border-amber-400/50' : 'bg-white/[0.05] border-white/10'}`}>
            <div className="text-[20px] text-gray-300 font-bold">{T('ในคลิป', 'In this clip')} · {after ? T('ใส่เกียร์', 'gear') : T('ไม่ใส่', 'no gear')}</div>
            <div className="mt-2 flex justify-center gap-3">
              {rounds.filter(r => r.after === after).map(r => (
                <span key={r.k} className={`px-3 py-1 rounded-lg text-[20px] font-black ${r.ok ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-gray-100'}`}>{r.ok ? T('ทักษะ 2 ครั้ง', '2 casts') : T('ทักษะ 1 ครั้ง', '1 cast')}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
        {T(`ทุกครั้งที่ทักษะติดตามปกติ มีโอกาส ${pc(d.total)} ได้ร่ายซ้ำทันทีในจังหวะถัดไป โดยไม่รอเวลารอ ${cd} วิ · ทักษะที่ร่ายซ้ำไม่สุ่มต่อ · มีแค่อาวุธ สูงสุด ${pc(d.total)}`,
          `Every normally triggered skill has a ${pc(d.total)} chance to be cast again on the very next attack, ignoring the ${cd} s cooldown · the repeat never rolls again · weapons only, max ${pc(d.total)}`)}
      </div>
      <div className="mt-2 text-center text-[18px] text-gray-500">
        {T(`เกียร์ +${GEAR_LEVEL} · ค่าสูงสุดที่ใส่ได้จริงตามกฎเกม`, `Gear +${GEAR_LEVEL} · the highest legal value`)}
      </div>
    </SummaryShell>
  )
}
