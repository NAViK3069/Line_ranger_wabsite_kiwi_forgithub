'use client'

// ====================================================
// วิดีโอ โอกาสโจมตีต่อเนื่อง (Blitz Rush Odds) — Brown ตำนานร็อค (ซ้าย ใส่เกียร์) ตีปกติใส่ Brown อนูบิสเพชฌฆาต (ขวา)
//   ไม่ใส่เกียร์ 2 ครั้ง (0% — เกมไม่สุ่ม โดนครั้งเดียว) → ใส่ [MG]Sword Kokorowatari +5 → 2 ครั้ง หมุนวงล้อ 42% (ติด / ไม่ติด)
//   ฉาก: public/gear-options/scenes/blitz-rush.anme.json ← scripts/gear-options/build-blitz-scene.cjs (ROLLS / EQUIP_AT ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ DOUBLE_ATK_PROB_MUL (0x24) → doubleAttackProb ของยูนิต · มีแค่อาวุธ 5 ชิ้น Basic 7% × 6 = 42% ที่ +5 (ไม่มีใน Switchable)
//   ตีปกติโดน (ประชิด = ตอนปล่อยท่า · กระสุน = ตอนกระสุนถึง): โอกาส > 0 → สุ่ม 0–1 < โอกาส (0x193c540) · 0% = ไม่สุ่ม
//   ติด → โดนซ้ำหลัง 0.3 วิ (CCDelayTime ใน 0xced7e4) — ไม่มีกระสุน/ท่าใหม่ · ดาเมจคำนวณด้วยสูตรตีปกติอีกชุด
//   ตีกระจายใช้ผลสุ่มเดียวกันทุกตัวที่โดน · ครั้งที่ 2 ไม่สุ่มต่อ · ทักษะใช้ค่าแยก (อัตราการใช้ทักษะอีกครั้ง)
//   ผลแต่ละรอบอ่านจากคิวในฉาก (roll_<k> มี followUp = ติด) · จังหวะโดนจากไทม์ไลน์ (hitsOf)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, useTutorialData, type RangerStats,
} from './kit'
import { Wheel } from './skill-rates'
import { HitFx } from './battleui'

type Tr = (th: string, en: string) => string

const ALLY = 'ak1zzx9ceu', ENEMY = 'a9ijjdi134'
/** เวลาในวิดีโอ — ตรงกับ build-blitz-scene.cjs */
const ROLLS = [18.6, 23.0, 30.6, 35.0]
const SPIN = { from: 0.3, to: 1.9 }
const FOLLOW = 0.3
const EQUIP_AT = 28.6
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [27.3, 30.3], summary: [40.2, 48] } as const

const TYPE = 'DOUBLE_ATK_PROB_MUL'
const NAME_KEY = 'GEAR_ATTR_DOUBLE_ATK_PROB_MUL_nm'
const WEARER = 'u1260e-brown', OTHER = 'u1242e-brown'
const GEAR = { code: 'eq_mg_wpn_17', grade: 7, en: '[MG]Sword Kokorowatari' }
const EN_NAMES: Record<string, string> = { 'u1260e-brown': 'Rock Legend Brown', 'u1242e-brown': 'Executor Anubis Brown' }

async function loadData() {
  const [wearer, other, g] = await Promise.all([loadStats(WEARER) as Promise<RangerStats>, loadStats(OTHER) as Promise<RangerStats>, loadGear(GEAR.code)])
  const basicOf = (type: string) => g.gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  // Basic บวกกัน (ชิ้นเดียว) · ออพชั่นนี้ไม่มีในช่อง Switchable ของเกียร์ไหนเลย
  return { wearer, other, gear: g.gear, total: basicOf(TYPE), atk: basicOf('ALL_ATK_MUL') }
}
type Data = Awaited<ReturnType<typeof loadData>>

const pc = (v: number) => {
  const x = v * 100
  return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%`
}
const STROKE: React.CSSProperties = { WebkitTextStroke: '8px #0b0d18', paintOrder: 'stroke fill', textShadow: '0 4px 10px rgba(0,0,0,0.55)' }

type Roll = { start: number; k: number; after: boolean; ok: boolean; hits: number[] }

export function BlitzRushTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearName = tGear(GEAR.code, GEAR.en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', NAME_KEY, T('โอกาสโจมตีต่อเนื่อง', 'Blitz Rush Odds'))
  const wearerName = tRanger(WEARER, EN_NAMES[WEARER]), otherName = tRanger(OTHER, EN_NAMES[OTHER])
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === TYPE ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.total)}`
  const chance = d.total

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rolls: Roll[] = ROLLS.map((start, k) => {
      const cue = c.scene.cues.find(x => x.id === `roll_${k}`) as { followUp?: number[] } | undefined
      const hits = c.hitsOf(`roll_${k}`)
      return { start, k, after: k >= 2, ok: !!cue?.followUp?.length, hits: hits.length ? hits : [start + SPIN.to] }
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
            <StatRow t={t} label={T('ตีปกติ 1 ครั้ง', 'One normal attack')} value={T('โดน 1 ครั้ง', '1 hit')} hlAt={9.6}
              note={T(`ตีใส่ ${otherName}`, `Against ${otherName}`)} />
          </>}
          slots={<GearSlots t={t} />} />

        <FormulaCard t={t} T={T} optName={optName} totalTxt={totalTxt} chance={chance} />
        <EquipCard t={t} T={T} gearName={gearName} optName={optName} totalTxt={totalTxt} />

        {rolls.map(r => <RollUi key={r.k} c={c} T={T} r={r} chance={r.after ? chance : 0} />)}
        {/* เอฟเฟกต์โดน: แสง → แสง ×1 = eff_hit_normal · ครั้งที่ 2 (โดนซ้ำ) = ท่า combo */}
        {rolls.map(r => <HitFx key={`fx${r.k}`} c={c} cueId={`roll_${r.k}`} kind="normal" combo={[1]} />)}

        <Summary t={t} T={T} d={d} rolls={rolls} optName={optName} totalTxt={totalTxt} gearName={gearName} />
      </>
    )
  }

  return <ScenePlayer src="/gear-options/scenes/blitz-rush.anme.json" autoPlay={autoPlay} overlay={overlay} />
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
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมสุ่มโจมตีต่อเนื่องแบบนี้', 'How the game rolls Blitz Rush')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-white">{T('ตีปกติโดน → สุ่ม', 'Normal attack lands → roll')} · {T('ติด', 'success')} = <span className="text-amber-300">{T('โดนซ้ำอีกครั้งหลัง 0.3 วิ', 'hits again 0.3 s later')}</span></span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {T('ไม่มีกระสุนหรือท่าใหม่ เป้าโดนซ้ำเฉยๆ · ดาเมจครั้งที่ 2 คิดด้วยสูตรตีปกติอีกรอบ · ตีกระจายโดนซ้ำทุกตัว · ไม่ต่อเป็นครั้งที่ 3',
            'No new bullet or animation — the target just takes the hit again · the second hit uses the normal-attack formula again · splash attacks repeat on every target · never a third hit')}
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-rose-900/30 border-2 border-rose-400/50 px-5 py-2 text-center" style={step(t, a + 1.3)}>
        <Fit1 className="text-center"><span className="text-[24px] font-black text-rose-200">{T('ใช้กับตีปกติเท่านั้น — ทักษะไม่เกี่ยว (ทักษะมีค่าแยก "อัตราการใช้ทักษะอีกครั้ง")', 'Normal attacks only — skills use a separate option')}</span></Fit1>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.4)}>
        <div className={box}><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[44px] font-black text-white leading-tight">0%</div>
          <Fit1><span className="text-[20px] font-bold text-gray-300">{T('เกมไม่สุ่มเลย → โดนครั้งเดียวทุกครั้ง', 'No roll at all → always 1 hit')}</span></Fit1></div>
        <div className={gold}><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <div className="text-[44px] font-black text-amber-300 leading-tight">{pc(chance)}</div>
          <Fit1><span className="text-[20px] font-bold text-gray-200">{T(`ทุกครั้งที่ตีโดน มีโอกาส ${pc(chance)} โดน 2 ครั้ง`, `Every hit has a ${pc(chance)} chance to land twice`)}</span></Fit1></div>
      </div>
    </FitCard>
  )
}

// ── การ์ดใส่เกียร์ (อาวุธชิ้นเดียว — มีแค่อาวุธที่มีค่านี้) ──
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
      <div className="mt-1 text-right text-[19px] font-bold text-gray-400">
        {T('มีแค่อาวุธ · Basic 7% × 6 ระดับ', 'Weapons only · Basic 7% × 6 levels')}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} filled={t >= at ? { weapon: { icon: gearIconUrl(GEAR.code), grade: GEAR.grade } } : undefined} />
      </div>
    </FitCard>
  )
}

// ── แต่ละรอบ: ป้าย (ไม่ใส่เกียร์) / วงล้อ (ใส่เกียร์) + ตัวนับโดนที่เป้า ──
const LAND = [0.5, 0.5, 0.58, 0.42]

function RollUi({ c, T, r, chance }: { c: OverlayCtx; T: Tr; r: Roll; chance: number }) {
  const t = c.t
  const st = r.start
  const hit1 = r.hits[0]
  const end = Math.max(st + 4.2, (r.hits[r.hits.length - 1] ?? hit1) + 1.4)
  const vis = span(t, st, end, 0.25, 0.3)
  const goodColor: [string, string] = ['#fde047', '#d97706'], badColor: [string, string] = ['#94a3b8', '#475569']
  // วงล้อ: หยุดตรงจังหวะโดน (เกมสุ่มตอนตีโดน)
  const gDeg = Math.max(0, Math.min(1, chance)) * 360
  const theta = r.ok ? gDeg * LAND[r.k] : gDeg + (360 - gDeg) * LAND[r.k]
  const final = 360 * 5 - theta
  const sp = prog(t, st + SPIN.from, hit1)
  const rot = final * (1 - Math.pow(1 - sp, 3))
  const landed = t >= hit1
  const res = span(t, hit1, end, 0.2, 0.3)
  const goodPct = Math.round(chance * 100)
  const chip = (color: [string, string], txt: string) => (
    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/65">
      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${color[0]}, ${color[1]})` }} />
      <span className="text-[17px] font-black text-white whitespace-nowrap">{txt}</span>
    </div>
  )

  // ตัวนับโดนเหนือเป้า: โดนครั้งที่ 1 → "1 HIT" · ครั้งที่ 2 (ติด) → "2 HITS" + ป้ายโจมตีต่อเนื่อง
  const tp = c.actorAt(ENEMY)
  const tpos = tp ? c.project(tp) : null
  const shown = r.hits.filter(h => t >= h).length
  const lastHit = r.hits[Math.max(0, shown - 1)] ?? hit1
  const cnt = span(t, hit1, end, 0.05, 0.3)
  const popK = easeOutBack(prog(t, lastHit, lastHit + 0.25))

  return (
    <>
      {vis.on && (
        <div className="absolute left-1/2 top-[12px] -translate-x-1/2 flex flex-col items-center" style={{ opacity: vis.alpha }}>
          <div className="px-3 py-0.5 rounded-lg bg-black/70 text-[16px] font-bold text-gray-200 whitespace-nowrap">
            {r.after ? T('ใส่เกียร์แล้ว', 'With gear') : T('ไม่ใส่เกียร์', 'No gear')} · {T(`ตีปกติครั้งที่ ${(r.k % 2) + 1}`, `Normal attack ${(r.k % 2) + 1}`)}
          </div>
          {r.after ? <>
            <div className="mt-3">
              <Wheel chance={chance} rot={rot} goodColor={goodColor} badColor={badColor} scale={easeOutBack(Math.min(1, (t - st) / 0.3))}
                center={`${goodPct}%`} sub={T('ตีซ้ำ', 'Again')} />
            </div>
            <div className="mt-2 flex gap-2">
              {chip(goodColor, `${T('โดนซ้ำ', 'Hit again')} ${goodPct}%`)}
              {chip(badColor, `${T('โดนครั้งเดียว', 'Single hit')} ${100 - goodPct}%`)}
            </div>
            {landed && res.on && (
              <div className={`mt-2 px-4 py-1.5 rounded-xl border-2 text-center ${r.ok ? 'bg-emerald-600/95 border-emerald-200/70' : 'bg-slate-700/95 border-white/25'}`}
                style={{ opacity: res.alpha, transform: `scale(${easeOutBack(prog(t, hit1, hit1 + 0.3))})` }}>
                <span className="text-[19px] font-black text-white whitespace-nowrap">{r.ok ? T('ติด! โดนซ้ำอีกครั้ง', 'Success! Hits again') : T('ไม่ติด → โดนครั้งเดียว', 'Failed → single hit')}</span>
              </div>
            )}
          </> : (
            <div className="mt-3 px-6 py-4 rounded-2xl bg-[#0b1122]/90 border-2 border-white/15 text-center" style={{ transform: `scale(${easeOutBack(Math.min(1, (t - st) / 0.3))})` }}>
              <div className="text-[18px] font-bold text-gray-400">{T('โอกาสโจมตีต่อเนื่อง', 'Blitz Rush')}</div>
              <div className="text-[54px] font-black text-white leading-tight tabular-nums">0%</div>
              <div className="text-[19px] font-black text-gray-300 whitespace-nowrap">{T('เกมไม่สุ่ม → โดนครั้งเดียว', 'No roll → single hit')}</div>
            </div>
          )}
        </div>
      )}
      {cnt.on && shown > 0 && tpos && (
        <div className="absolute pointer-events-none flex flex-col items-center" style={{ left: tpos.x, top: tpos.y - 250, transform: 'translate(-50%, -50%)', opacity: cnt.alpha }}>
          <div className="font-black italic text-white tabular-nums leading-none" style={{ ...STROKE, fontSize: 72, transform: `scale(${popK})`, color: shown >= 2 ? '#fde047' : '#ffffff' }}>
            {shown} HIT{shown >= 2 ? 'S' : ''}
          </div>
          {shown >= 2 && (
            <div className="mt-1 px-3 py-1 rounded-lg bg-amber-500/90 border-2 border-amber-100/70 text-[22px] font-black text-white whitespace-nowrap"
              style={{ transform: `scale(${popK})` }}>
              {T('โจมตีต่อเนื่อง!', 'Blitz Rush!')}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── สรุป ──
function Summary({ t, T, d, rolls, optName, totalTxt, gearName }: { t: number; T: Tr; d: Data; rolls: Roll[]; optName: string; totalTxt: string; gearName: string }) {
  const S = TL.summary[0]
  const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
  const avg = 1 + d.total
  const rows = [{ label: T('ไม่ใส่เกียร์', 'No gear'), v: 1 }, { label: `${optName} ${totalTxt}`, v: avg }]
  return (
    <SummaryShell t={t} T={T} start={S} end={TL.summary[1]} top={-330}
      title={T('ตีปกติ 1 ครั้ง โดนกี่ครั้ง (เฉลี่ย)', 'Hits per normal attack (average)')}>
      {rows.map((row, i) => (
        <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
          <div className="flex justify-between items-baseline text-[26px]">
            <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{row.label}</span></Fit1>
            <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>{T(`${(row.v * bar(S + 0.5 + i * 0.5)).toFixed(2)} ครั้ง`, `${(row.v * bar(S + 0.5 + i * 0.5)).toFixed(2)} hits`)}</span>
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
              {rolls.filter(r => r.after === after).map(r => (
                <span key={r.k} className={`px-3 py-1 rounded-lg text-[20px] font-black ${r.ok ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-gray-100'}`}>{r.ok ? T('โดน 2 ครั้ง', '2 hits') : T('โดน 1 ครั้ง', '1 hit')}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
        {T(`ครั้งที่ 2 คิดดาเมจด้วยสูตรตีปกติอีกรอบ → ดาเมจตีปกติเฉลี่ย ×${avg.toFixed(2)} (ยังไม่นับ ATK +${pc(d.atk)} ของ ${gearName}) · ใช้กับตีปกติเท่านั้น · มีแค่อาวุธ 5 ชิ้น สูงสุด ${pc(d.total)}`,
          `The second hit uses the normal-attack formula again → normal-attack damage ×${avg.toFixed(2)} on average (not counting ${gearName}'s +${pc(d.atk)} ATK) · normal attacks only · only 5 weapons have it, max ${pc(d.total)}`)}
      </div>
      <div className="mt-2 text-center text-[18px] text-gray-500">
        {T(`เกียร์ +${GEAR_LEVEL} · ค่าสูงสุดที่ใส่ได้จริงตามกฎเกม`, `Gear +${GEAR_LEVEL} · the highest legal value`)}
      </div>
    </SummaryShell>
  )
}
