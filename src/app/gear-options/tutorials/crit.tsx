'use client'

// ====================================================
// วิดีโอสอน: อัตราติดคริทิคอล (crit-rate) / แรงโจมตีคริทิคอล (crit-damage)
//   เรา (ซ้าย) Ares Cony — คริ 25% · ตัวคูณคริ ×3 (unit.criticalRatio) — ตีปกติใส่ Brown อนูบิสเพชฌฆาต (ขวา) 4 รอบ
//   crit-rate:   Thunder Brown's Cape +5 (Critical Rate +57% · ค่าอื่น = พลังงานเรียก/DEF บวกตรง ไม่กระทบการตี) → 25% + 57% = 82%
//   crit-damage: [SL] Shoulder Armor +5 (Critical Damage +408%) → ×3 + 4.08 = ×7.08
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-crit-scene.cjs (โครงเรื่องแบบวิดีโอ ATK)
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ Critical Rate (0x0d) / Critical Damage (0x0e) บวกตรงเข้า criticalProbability (UnitData 0xa18) / criticalRatio (0xa28) — fn 0xd5d490
//   สุ่มคริ (0xd02304 — มีที่เรียกจุดเดียวคือดาเมจตีปกติ 0xcec3f4 → ทักษะไม่คริ):
//     p = criticalProbability + บัฟ · p ≥ 0.95 → 95 · p ≤ 0 → ไม่สุ่ม · ไม่งั้นตัดเศษเป็น % · สุ่ม 0–99 < p = คริ
//   ตัวคูณคริ (0xcecfec): คริ = max(1, criticalRatio + บัฟ) · ไม่คริ = 1 → คูณดาเมจตีปกติ (หลัง DEF)
//   ป้าย CRITICAL = ml_guild_raid_critical_<ภาษา>.png (ml_battle_ui) · เอฟเฟกต์โดน eff_hit_normal (น้ำ → แสง ×1)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, fmtInt, popStyle, prog, span } from './anim'
import {
  CUE_IDS, EquipCard, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, HpBar, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, StatRow, SummaryShell, TL, defParts, gearIconUrl, loadGear, loadStats, normalHit, step, useTutorialData,
  type GearKind, type Round,
} from './kit'
import { CritPop, HitFx } from './battleui'
import { RollStack } from './rollstack'

export type CritMode = 'crit-rate' | 'crit-damage'
type Tr = (th: string, en: string) => string

const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1002e-cony' }
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1242e-brown' }
const EN_NAMES: Record<string, string> = { 'u1002e-cony': 'Ares Cony', 'u1242e-brown': 'Executor Anubis Brown' }

interface Cfg { type: string; nameKey: string; title: [string, string]; gear: { code: string; kind: GearKind; grade: number; en: string }; rolls: boolean[] }
const CFG: Record<CritMode, Cfg> = {
  // ผลสุ่มคริแต่ละรอบ (รอบ 1–2 ไม่ใส่เกียร์ · 3–4 ใส่เกียร์)
  'crit-rate': {
    type: 'CRI_PROB_MUL', nameKey: 'GEAR_ATTR_CRI_PROB_MUL_nm', title: ['อัตราติดคริทิคอล', 'Critical Rate'],
    gear: { code: 'eq_acc_evt_046', kind: 'acc', grade: 6, en: "Thunder Brown's Cape" }, rolls: [false, true, true, true],
  },
  'crit-damage': {
    type: 'CRI_DMG_MUL', nameKey: 'GEAR_ATTR_CRI_DMG_MUL_nm', title: ['แรงโจมตีคริทิคอล', 'Critical Damage'],
    gear: { code: 'eq_sl_amr_16', kind: 'armor', grade: 6, en: '[SL] Shoulder Armor' }, rolls: [false, true, false, true],
  },
}

const f = Math.fround
/** โอกาสคริ (จำนวนเต็ม %) แบบเกม — ≥ 0.95 → 95 · ตัดเศษ */
export function critChance(p: number): number {
  const v = f(p)
  if (v >= f(0.95)) return 95
  if (v <= 0) return 0
  return Math.trunc(f(v * 100))
}

async function loadData(mode: CritMode) {
  const m = CFG[mode]
  const [ally, enemy, g] = await Promise.all([loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(m.gear.code)])
  const gearVal = g.gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const rates = ally.rates as typeof ally.rates & { critRate?: number; critDamage?: number }
  const p = rates.critRate ?? 0
  // ranger-stats เก็บแรงคริเป็น "ส่วนเพิ่ม" (criticalRatio − 1) → ตัวคูณในเกม = 1 + critDamage
  const ratio = 1 + (rates.critDamage ?? 0)
  const pAfter = mode === 'crit-rate' ? f(p) + f(gearVal) : p
  const ratioAfter = mode === 'crit-damage' ? f(ratio) + f(gearVal) : ratio
  const hit = normalHit(ally.baseStats.phyAtk, ally.baseStats.magAtk, enemy.baseStats)
  const mulOf = (r: number) => Math.max(1, r)
  return {
    ally, enemy, gear: g.gear, gearVal, p, pAfter, ratio, ratioAfter, hit,
    chanceBefore: critChance(p), chanceAfter: critChance(pAfter),
    critBefore: Math.trunc(hit.total * mulOf(ratio)), critAfter: Math.trunc(hit.total * mulOf(ratioAfter)),
  }
}
type Data = Awaited<ReturnType<typeof loadData>>

const pc = (v: number) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }
const xTxt = (v: number) => `×${Number.isInteger(Math.round(v * 100) / 100) ? Math.round(v) : (Math.round(v * 100) / 100).toString()}`

function CritTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: CritMode }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = CFG[mode]
  const rateMode = mode === 'crit-rate'
  const gearName = tGear(m.gear.code, m.gear.en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const rateName = tr('equip', 'GEAR_ATTR_CRI_PROB_MUL_nm', T('อัตราติดคริทิคอล', 'Critical Rate'))
  const dmgName = tr('equip', 'GEAR_ATTR_CRI_DMG_MUL_nm', T('แรงโจมตีคริทิคอล', 'Critical Damage'))
  const allyName = tRanger(ALLY.ranger, EN_NAMES[ALLY.ranger]), enemyName = tRanger(ENEMY.ranger, EN_NAMES[ENEMY.ranger])
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const hp = d.enemy.baseStats.hp
  const dmgOf = (i: number) => (m.rolls[i] ? (i < 2 ? d.critBefore : d.critAfter) : d.hit.total)

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const hits = CUE_IDS.map((id, i) => c.hitsOf(id)[0] ?? TL.hitFallback[i])
    const rounds: Round[] = CUE_IDS.map((_, i) => ({ refill: TL.refill[i], at: hits[i], dmg: dmgOf(i), max: hp }))
    const S = TL.summary
    const avg = (chance: number, crit: number) => d.hit.total * (1 - chance / 100) + crit * (chance / 100)
    const avgBefore = avg(d.chanceBefore, d.critBefore), avgAfter = avg(d.chanceAfter, d.critAfter)
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIconUrl(m.gear.code)} name={gearName} effName={effName}
          switchable={null} kind={m.gear.kind} grade={m.gear.grade} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={rateName} value={pc(d.p)} hlAt={rateMode ? 8.75 : undefined} dim={!rateMode}
              note={T('สุ่มทุกครั้งที่ตีปกติโดน', 'Rolled on every normal hit')} />
            <StatRow t={t} label={dmgName} value={xTxt(d.ratio)} hlAt={rateMode ? undefined : 8.75} dim={rateMode}
              note={T('ติดคริ = ดาเมจตีปกติคูณค่านี้', 'A crit multiplies the normal hit by this')} />
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.ally.baseStats.phyAtk + d.ally.baseStats.magAtk)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <CritFormulaCard t={t} T={T} d={d} rateMode={rateMode} optName={optName} />

        <NormalFormulaCard t={t} T={T} heading={T('ตีปกติ: ผ่าน DEF ก่อน แล้วติดคริค่อยคูณตัวคูณคริ', 'Normal attack: DEF first, then a crit multiplies it')}
          defOwner={T('ของเป้าหมาย', '(target)')} hit={d.hit} />

        <HpBar c={c} t={t} actor={ENEMY.actor} rounds={rounds} />

        {/* วงล้อสุ่มคริ (หยุดตรงจังหวะโดน — เกมสุ่มตอนคำนวณดาเมจ) · อยู่ฝั่งซ้าย ไม่ทับการ์ดใส่เกียร์ทางขวา */}
        {CUE_IDS.map((_, i) => {
          const chance = (i < 2 ? d.chanceBefore : d.chanceAfter) / 100
          const crit = m.rolls[i]
          const mul = i < 2 ? d.ratio : d.ratioAfter
          return (
            <RollStack key={`roll${i}`} c={c} x={420} st={hits[i] - 1.9} end={hits[i] + 1.4}
              header={`${T(`รอบที่ ${i + 1}`, `Round ${i + 1}`)} · ${i < 2 ? T('ไม่ใส่เกียร์', 'No gear') : T('ใส่เกียร์แล้ว', 'With gear')} · ${T('สุ่มคริ', 'Crit roll')}`}
              rows={[{
                wheels: [{ chance, good: crit, goodColor: ['#fca5a5', '#dc2626'], goodLabel: T('คริ', 'Crit'), badLabel: T('ไม่คริ', 'No crit'), sub: T('คริ', 'Crit'), land: [0.55, 0.45, 0.4, 0.6][i] }],
                note: crit ? T(`คริ! ดาเมจ ${xTxt(mul)}`, `Crit! Damage ${xTxt(mul)}`) : T('ไม่คริ → ดาเมจปกติ', 'No crit → normal damage'), noteGood: crit,
              }]} />
          )
        })}
        {CUE_IDS.map((id, i) => <HitFx key={`fx${i}`} c={c} cueId={id} kind="normal" />)}
        {CUE_IDS.map((_, i) => (m.rolls[i] ? <CritPop key={`cr${i}`} c={c} actorId={ENEMY.actor} at={hits[i]} lang={lang} /> : null))}

        <EquipCard t={t} T={T} gearIcon={gearIconUrl(m.gear.code)} gearName={gearName} bonusPct={d.gearVal} kind={m.gear.kind} grade={m.gear.grade}
          stats={[rateMode
            ? { icon: ICON.atk, label: rateName, before: d.chanceBefore / 100, after: d.chanceAfter / 100, format: v => `${Math.round(v * 100)}%`,
                formula: `${pc(d.p)} + ${pc(d.gearVal)} = ${pc(d.pAfter)}${d.chanceAfter === 95 ? ` → ${T('เพดาน', 'cap')} 95%` : ''}` }
            : { icon: ICON.atk, label: dmgName, before: d.ratio, after: d.ratioAfter, format: v => xTxt(v),
                formula: `${xTxt(d.ratio)} + ${pc(d.gearVal)} = ${xTxt(d.ratioAfter)}` }]} />

        <SummaryShell t={t} T={T} title={T('ดาเมจตีปกติเฉลี่ยต่อครั้ง (รวมโอกาสคริ)', 'Average normal-hit damage (with crit chance)')}>
          {[
            { label: T('ไม่ใส่เกียร์', 'No gear'), v: avgBefore, sub: `${d.chanceBefore}% × ${xTxt(d.ratio)}`, cls: 'from-slate-500 to-slate-300', at: S + 0.6 },
            { label: `${optName} +${pc(d.gearVal)}`, v: avgAfter, sub: `${d.chanceAfter}% × ${xTxt(d.ratioAfter)}`, cls: 'from-rose-600 to-orange-300', at: S + 1.1 },
          ].map(r => (
            <div key={r.label} className="mt-4" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between items-baseline text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{r.label} <span className="text-[20px] text-gray-400">({r.sub})</span></span></Fit1>
                <span className="shrink-0 ml-4 font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${(r.v / avgAfter) * 100 * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-5 grid grid-cols-3 gap-3 text-center" style={popStyle(span(t, S + 1.9, TL.end, 0.5, 0.6))}>
            {[
              { k: T('ตีปกติ (ไม่คริ)', 'Normal hit'), v: fmtInt(d.hit.total) },
              { k: T('คริ · ไม่ใส่เกียร์', 'Crit · no gear'), v: fmtInt(d.critBefore) },
              { k: T('คริ · ใส่เกียร์', 'Crit · gear'), v: fmtInt(d.critAfter) },
            ].map(x => (
              <div key={x.k} className="rounded-2xl bg-white/[0.05] border-2 border-white/10 p-3">
                <Fit1 className="text-center"><span className="text-[19px] text-gray-300 font-bold">{x.k}</span></Fit1>
                <div className="text-[32px] font-black text-white tabular-nums leading-tight">{x.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
            {rateMode
              ? T(`อัตราคริบวกตรง แต่เพดานคือ 95% — ใส่เกินกว่านี้ไม่ขึ้น · ใช้กับตีปกติเท่านั้น (ทักษะไม่คริ) · ดาเมจเฉลี่ย ×${(avgAfter / avgBefore).toFixed(2)}`,
                `Crit Rate adds straight on, but caps at 95% — anything above does nothing · normal attacks only (skills never crit) · average damage ×${(avgAfter / avgBefore).toFixed(2)}`)
              : T(`แรงคริบวกเข้าตัวคูณคริตรงๆ (${xTxt(d.ratio)} + ${pc(d.gearVal)} = ${xTxt(d.ratioAfter)}) · มีผลเฉพาะตอนติดคริ · ใช้กับตีปกติเท่านั้น · ดาเมจเฉลี่ย ×${(avgAfter / avgBefore).toFixed(2)}`,
                `Crit Damage adds straight onto the crit multiplier (${xTxt(d.ratio)} + ${pc(d.gearVal)} = ${xTxt(d.ratioAfter)}) · only matters on a crit · normal attacks only · average damage ×${(avgAfter / avgBefore).toFixed(2)}`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เป้า ${enemyName} · DEF กายภาพ ${fmtInt(d.enemy.baseStats.phyDef)} · น้ำ → แสง ×1`, `Target ${enemyName} · Phys DEF ${fmtInt(d.enemy.baseStats.phyDef)} · Water → Light ×1`)}</div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={`/gear-options/scenes/${mode}.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

// ── การ์ดอธิบายคริ (ก่อนการ์ดสูตรตีปกติ) ──
function CritFormulaCard({ t, T, d, rateMode, optName }: { t: number; T: Tr; d: Data; rateMode: boolean; optName: string }) {
  const s = span(t, 12.5, 16.1, 0.5, 0.4)
  if (!s.on) return null
  const a = 12.5
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมคิดคริแบบนี้', 'How the game handles crits')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[28px] font-black text-white">{T('ทุกครั้งที่ตีปกติโดน สุ่ม 0–99 < โอกาสคริ', 'Every normal hit rolls 0–99 < crit chance')} <span className="text-rose-300">({T('สูงสุด 95%', 'max 95%')})</span></span></Fit1>
        <Fit1 className="text-center mt-1"><span className="text-[28px] font-black text-amber-200">{T('ติดคริ → ดาเมจตีปกติ × ตัวคูณคริ', 'Crit → normal-hit damage × crit multiplier')}</span></Fit1>
        <div className="mt-1 text-[19px] font-bold text-gray-300 text-balance">{T('ทักษะไม่คริ — โค้ดเกมสุ่มคริแค่ในดาเมจตีปกติ', 'Skills never crit — the game rolls crits only for normal-hit damage')}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{d.chanceBefore}% · {xTxt(d.ratio)}</div></div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3"><div className="text-[20px] font-bold text-amber-200">{optName} +{pc(d.gearVal)}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{rateMode ? `${pc(d.p)} + ${pc(d.gearVal)} = ${pc(d.pAfter)} → 95%` : `${xTxt(d.ratio)} + ${pc(d.gearVal)} = ${xTxt(d.ratioAfter)}`}</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 leading-tight">{d.chanceAfter}% · {xTxt(d.ratioAfter)}</div></div>
      </div>
    </FitCard>
  )
}

export const CritRateTutorial = ({ autoPlay }: { autoPlay: boolean }) => <CritTutorial autoPlay={autoPlay} mode="crit-rate" />
export const CritDamageTutorial = ({ autoPlay }: { autoPlay: boolean }) => <CritTutorial autoPlay={autoPlay} mode="crit-damage" />
