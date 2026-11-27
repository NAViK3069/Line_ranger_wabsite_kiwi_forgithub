'use client'

// ====================================================
// วิดีโอสอน: อัตราสะท้อนการโจมตีกายภาพ (phys-reflect) / อัตราสะท้อนการโจมตีเวทมนตร์ (mag-reflect)
//   เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์สะท้อน) · ศัตรู = Brown พรานจระเข้ (ขวา, ใส่เกียร์ ATK เต็มที่ เป็นฝ่ายตี)
//   ใช้ฉาก/จังหวะเดียวกับวิดีโอ DEF: รอบ 1 ตีปกติ · 2 สกิล · ใส่เกียร์ · 3 ตีปกติ (สะท้อน!) · 4 สกิล (ไม่สะท้อน)
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-reflect-scene.cjs
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ (0xd5d490): Physical ATK Reflect (MIR_PHY_MUL 0x1e) → UnitData 0xb40 · Magical ATK Reflect (MIR_MAG_MUL 0x1f) → 0xb50 (บวกตรง)
//   ตอนโดนดาเมจ (UnitNode vfunc 0x418 = 0xceb7b4 → 0xcebad8 · ดาเมจ = หลัง DEF ทั้งก้อน):
//     ตีปกติ (kind 3 — 0xced4d8) → ดาเมจสะท้อน = ตัดเศษ(ดาเมจที่โดน × (สะท้อนกายภาพ + บัฟ)) + ตัดเศษ(ดาเมจที่โดน × สะท้อนเวท)
//       ส่งเข้าผู้ตีเป็นดาเมจตรง (vfunc 0x3f8 — ไม่ผ่าน DEF ของผู้ตี) · ผู้ตีเป็นปราสาท/บอสประเภท 3 → ไม่สะท้อน
//     ทักษะ (kind 1) ไปอีกทาง (0xd07278) ที่ไม่อ่านค่าสะท้อนของเกียร์ → ทักษะไม่สะท้อน
//     สองค่านี้คูณ "ดาเมจที่โดนทั้งก้อน" เหมือนกัน (ไม่ได้แยกส่วนกายภาพ/เวท) → ใช้แทนกันได้ บวกกันได้
//   เกียร์ +5 = นับเฉพาะ Basic (Switchable ปลดล็อกที่ +6)
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { aggregateGearBonuses } from '@/lib/gearEffectParser'
import { clamp01, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, HpBar, Heals, ICON, LoadBox, Opening,
  RangerCard, Souls, StatRow, SummaryShell, TL, equipSlots, gearIconUrl, gearStat, healRingLayers, loadGear, loadStats,
  makeRounds, normalHit, pct, skillMultiplier, step, useTutorialData, type GearKind, type RangerStats, type SlotGear,
} from './kit'

export type ReflectMode = 'phys-reflect' | 'mag-reflect'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1242e-brown' }    // เรา — ใส่เกียร์ (ตรงกับ build-reflect-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1317e-brown' }   // ศัตรู — ผู้ตี
/** เกียร์ ATK ของศัตรู (ชุดเดียวกับวิดีโอ DEF) */
const ENEMY_GEARS: { code: string; kind: GearKind; grade: number }[] = [
  { code: 'eq_wpn_est_0272', kind: 'weapon', grade: 7 }, { code: 'eq_2502_amr_06', kind: 'armor', grade: 6 }, { code: 'eq_ss_acc_26', kind: 'acc', grade: 6 },
]
interface GearDef { code: string; kind: GearKind; grade: number; en: string }
const MODES: Record<ReflectMode, { type: string; nameKey: string; title: [string, string]; gears: GearDef[] }> = {
  // ชุด Basic สูงสุดในเกม (ไม่มีอาวุธ/เครื่องประดับชิ้นไหนมีสะท้อนกายภาพใน Basic)
  'phys-reflect': {
    type: 'MIR_PHY_MUL', nameKey: 'GEAR_ATTR_MIR_PHY_MUL_nm', title: ['อัตราสะท้อนการโจมตีกายภาพ', 'Physical ATK Reflect'],
    gears: [{ code: 'eq_ts_amr_27', kind: 'armor', grade: 7, en: "[TS] Shion's Suit" }],
  },
  'mag-reflect': {
    type: 'MIR_MAG_MUL', nameKey: 'GEAR_ATTR_MIR_MAG_MUL_nm', title: ['อัตราสะท้อนการโจมตีเวทมนตร์', 'Magical ATK Reflect'],
    gears: [
      { code: 'eq_2302_amr_06', kind: 'armor', grade: 6, en: "[TS2]Shuna's Robes" },
      { code: 'eq_2206_acc_06', kind: 'acc', grade: 6, en: '[SMK]Kororo Butterbur' },
    ],
  },
}
const attackSkill = (r: RangerStats) => r.skills.find(k => /ATK x [\d.]+%/.test(k.description ?? '')) ?? r.skills[0]
const f = Math.fround

async function loadData(mode: ReflectMode) {
  const m = MODES[mode]
  const [ally, enemy, ...gs] = await Promise.all([
    loadStats(ALLY.ranger), loadStats(ENEMY.ranger), ...m.gears.map(g => loadGear(g.code)), ...ENEMY_GEARS.map(g => loadGear(g.code)),
  ])
  const mine = gs.slice(0, m.gears.length).map(x => x.gear), eg = gs.slice(m.gears.length).map(x => x.gear)
  const basicOf = (g: GearEffects) => g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const per = mine.map(basicOf)
  const rate = per.reduce((s, v) => s + v, 0)
  const eb = aggregateGearBonuses(eg, eg.map(() => null))
  const enemyPhy = gearStat(enemy.baseStats.phyAtk, eb.phyAtk), enemyMag = gearStat(enemy.baseStats.magAtk, eb.magAtk)
  const hit = normalHit(enemyPhy, enemyMag, ally.baseStats)
  const taken = hit.total
  // สะท้อน = ตัดเศษ(ดาเมจ × กายภาพ) + ตัดเศษ(ดาเมจ × เวท) — ชุดนี้มีค่าเดียว อีกค่าเป็น 0
  const reflected = Math.trunc(f(f(rate) * f(taken)))
  const skill = attackSkill(enemy)
  const ourRes = ally.rates.skillResistance ?? 0
  const dmgSkill = Math.round((enemyPhy + enemyMag) * skillMultiplier(skill) * (1 - ourRes))
  return { ally, enemy, gears: mine, per, rate, hit, taken, reflected, skill, dmgSkill, enemyAtk: enemyPhy + enemyMag }
}

export default function ReflectTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: ReflectMode }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = MODES[mode]
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const otherName = tr('equip', mode === 'phys-reflect' ? 'GEAR_ATTR_MIR_MAG_MUL_nm' : 'GEAR_ATTR_MIR_PHY_MUL_nm', mode === 'phys-reflect' ? T('อัตราสะท้อนการโจมตีเวทมนตร์', 'Magical ATK Reflect') : T('อัตราสะท้อนการโจมตีกายภาพ', 'Physical ATK Reflect'))
  const gearName = (i: number) => tGear(m.gears[i].code, m.gears[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const allyName = tRanger(ALLY.ranger, 'Executor Anubis Brown'), enemyName = tRanger(ENEMY.ranger, 'Crocodile Hunter Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const tested = d.gears[0].basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const hp = d.ally.baseStats.hp
  const totalTxt = `+${pct(d.rate, 1)}`
  const slots = Object.fromEntries(m.gears.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const enemyGearIcons = Object.fromEntries(ENEMY_GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [d.taken, d.dmgSkill, d.taken, d.dmgSkill], [hp, hp, hp, hp])

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rounds = roundsOf(c)
    const S = TL.summary
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gears[0]} icon={gearIconUrl(m.gears[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={m.gears[0].kind} grade={m.gears[0].grade} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์ · โดนตี', 'Gear wearer · gets hit')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.75} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(hp)} dim />
            <StatRow t={t} icon={ICON.def} label={T('DEF กายภาพ', 'Physical DEF')} value={fmtInt(d.ally.baseStats.phyDef)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('ศัตรู · ผู้ตี · ใส่เกียร์ ATK เต็มที่', 'Enemy · attacker · full ATK gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.enemyAtk)} hlAt={13.05} />
            <StatRow t={t} label={T('ตีปกติโดนเรา', 'Normal hit on us')} value={fmtInt(d.taken)} hlAt={13.6} note={T('หลัง DEF ของเรา', 'After our DEF')} />
          </>}
          slots={<GearSlots t={t} filled={enemyGearIcons} />} />

        <ReflectFormulaCard t={t} T={T} d={d} optName={optName} otherName={otherName} totalTxt={totalTxt} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} color={BANNER_COLOR.normalNoGear} />
        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ${optName} ${totalTxt}`, `Round 3 · ${optName} ${totalTxt}`)}
          sub={T('ศัตรูโจมตีปกติ → โดนสะท้อนกลับ', 'Enemy normal attack → reflected back')} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ${optName} ${totalTxt}`, `Round 4 · ${optName} ${totalTxt}`)}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · ${T('สกิลไม่สะท้อน', 'skills are not reflected')}`} color={BANNER_COLOR.skillGear} />

        <Heals c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <Souls c={c} t={t} actor={ALLY.actor} side="ally" rounds={rounds} />

        <ReflectSetCard t={t} T={T} names={m.gears.map((_, i) => gearName(i))} codes={m.gears.map(g => g.code)} per={d.per}
          totalTxt={totalTxt} optName={optName} slots={slots} />

        {/* สะท้อนเฉพาะรอบ 3 (ตีปกติหลังใส่เกียร์) */}
        <ReflectPop c={c} t={t} T={T} at={rounds[2].at} dmg={d.reflected} />
        <NoReflect c={c} t={t} T={T} at={rounds[3].at} />

        <SummaryShell t={t} T={T} top={-340} title={T(`${optName} — ดาเมจที่ผู้ตีโดนสะท้อนต่อการตีปกติ 1 ครั้ง`, `${optName} — damage reflected per normal hit`)}>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center" style={popStyle(span(t, S + 0.5, TL.end, 0.5, 0.6))}>
            {[
              { k: T('เราโดนตีปกติ', 'We take'), v: fmtInt(d.taken), cls: 'text-white' },
              { k: `× ${optName}`, v: pct(d.rate, 1), cls: 'text-amber-300' },
              { k: T('สะท้อนใส่ผู้ตี', 'Reflected back'), v: fmtInt(d.reflected), cls: 'text-fuchsia-300' },
            ].map(x => (
              <div key={x.k} className="rounded-2xl bg-white/[0.05] border-2 border-white/10 p-3">
                <Fit1 className="text-center"><span className="text-[19px] text-gray-300 font-bold">{x.k}</span></Fit1>
                <div className={`text-[34px] font-black tabular-nums leading-tight ${x.cls}`}>{x.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.4, TL.end, 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-3 py-2 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('ศัตรูตีปกติ', 'Enemy normal attack')}</div>
              <div className="text-[34px] font-black text-amber-300 leading-tight">{T('สะท้อน', 'Reflected')} −{fmtInt(d.reflected)}</div>
            </div>
            <div className="rounded-2xl bg-[#250a2a] border-2 border-fuchsia-400/50 px-3 py-2 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T(`ศัตรูใช้สกิล ${skillName}`, `Enemy skill ${skillName}`)}</div>
              <div className="text-[34px] font-black text-fuchsia-300 leading-tight">{T('ไม่สะท้อน', 'Not reflected')}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 2.4, S + 2.8)) }}>
            {T(`สะท้อน = ดาเมจตีปกติที่เราโดน (หลัง DEF) × ${optName} — ส่งกลับเป็นดาเมจตรง ไม่ผ่าน DEF ของผู้ตี · ${optName} กับ ${otherName} คูณดาเมจก้อนเดียวกันทั้งคู่ จึงใส่รวมกันได้ · ไม่สะท้อนสกิล`,
              `Reflect = normal-hit damage we take (after DEF) × ${optName} — sent back as direct damage, ignoring the attacker's DEF · ${optName} and ${otherName} both multiply the same total, so they stack · skills are never reflected`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · ชุด ${optName} สูงสุดที่ใส่ได้จริง`, `Gear +${GEAR_LEVEL} (Basic only) · the highest real ${optName} set`)}</div>
        </SummaryShell>
      </>
    )
  }
  return <ScenePlayer src={`/gear-options/scenes/${mode}.anme.json`} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ALLY.actor, roundsOf)} />
}

type Data = Awaited<ReturnType<typeof loadData>>
type Tr = (th: string, en: string) => string

// ── การ์ดอธิบาย (ช่องเวลาเดียวกับการ์ดสูตรตีปกติ) ──
function ReflectFormulaCard({ t, T, d, optName, otherName, totalTxt }: { t: number; T: Tr; d: Data; optName: string; otherName: string; totalTxt: string }) {
  const s = span(t, 16.4, 20.6, 0.5, 0.4)
  if (!s.on) return null
  const a = 16.4
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมสะท้อนดาเมจแบบนี้', 'How the game reflects damage')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-amber-200">{T('ดาเมจสะท้อน', 'Reflected damage')} = {T('ดาเมจตีปกติที่โดน', 'normal-hit damage taken')} × {optName}</span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">{T(`ส่งกลับใส่ผู้ตีทันทีเป็นดาเมจตรง (ไม่ผ่าน DEF) · ${otherName} คิดแบบเดียวกันแล้วบวกกัน`, `Sent straight back to the attacker as direct damage (no DEF) · ${otherName} works the same way and adds on`)}</div>
      </div>
      <div className="mt-3 rounded-2xl bg-rose-900/30 border-2 border-rose-400/50 px-5 py-2 text-center" style={step(t, a + 1.2)}>
        <Fit1 className="text-center"><span className="text-[26px] font-black text-rose-200">{T('สะท้อนแค่ตีปกติ — โดนสกิลไม่สะท้อน', 'Only normal attacks are reflected — skills are not')}</span></Fit1>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.2)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{T('สะท้อน', 'Reflect')} 0</div></div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3"><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{fmtInt(d.taken)} × {pct(d.rate, 1)}</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 leading-tight">{T('สะท้อน', 'Reflect')} {fmtInt(d.reflected)}</div></div>
      </div>
    </FitCard>
  )
}

// ── การ์ดใส่เกียร์ (หลายชิ้นได้) ──
function ReflectSetCard({ t, T, names, codes, per, totalTxt, optName, slots }: {
  t: number; T: Tr; names: string[]; codes: string[]; per: number[]; totalTxt: string; optName: string; slots: Partial<Record<GearKind, SlotGear>>
}) {
  const at = TL.equip
  const s = span(t, at - 0.9, at + 2.7, 0.4, 0.35)
  if (!s.on) return null
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, at - 0.75 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(codes[i])} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n} +{GEAR_LEVEL}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">+{pct(per[i], 1)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName} {T('รวม', 'total')}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={equipSlots(slots, at)} />
      </div>
    </FitCard>
  )
}

/** ดาเมจสะท้อนเด้งขึ้นที่ผู้ตี (ทันทีที่เราโดน) */
function ReflectPop({ c, t, T, at, dmg }: { c: OverlayCtx; t: number; T: Tr; at: number; dmg: number }) {
  const s = span(t, at + 0.05, at + 3.2, 0.25, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const p = c.project({ x: pos.x, y: pos.y - 150 })
  const pop = easeOutBack(clamp01(s.enter))
  const rise = easeOut(prog(t, at + 0.05, at + 0.7)) * 40
  return (
    <div className="absolute" style={{ left: p.x, top: p.y - rise, transform: `translate(-50%,-100%) scale(${0.6 + 0.4 * pop})`, opacity: s.alpha }}>
      <div className="px-5 py-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 border-2 border-fuchsia-200/70 text-center shadow-[0_10px_30px_rgba(192,38,211,0.55)] whitespace-nowrap">
        <div className="text-[22px] font-black text-fuchsia-100 leading-tight">{T('สะท้อนกลับ!', 'Reflected!')}</div>
        <div className="text-[38px] font-black text-white tabular-nums leading-tight">-{fmtInt(dmg)}</div>
      </div>
    </div>
  )
}

/** ป้าย "สกิลไม่สะท้อน" ที่ผู้ตี (รอบ 4) */
function NoReflect({ c, t, T, at }: { c: OverlayCtx; t: number; T: Tr; at: number }) {
  const s = span(t, at + 0.2, at + 2.6, 0.25, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const p = c.project({ x: pos.x, y: pos.y - 150 })
  return (
    <div className="absolute" style={{ left: p.x, top: p.y, transform: `translate(-50%,-100%) scale(${0.7 + 0.3 * easeOutBack(clamp01(s.enter))})`, opacity: s.alpha }}>
      <div className="px-5 py-2 rounded-2xl bg-slate-700/95 border-2 border-white/25 text-[26px] font-black text-white whitespace-nowrap">{T('สกิล → ไม่สะท้อน', 'Skill → no reflect')}</div>
    </div>
  )
}

export const PhysReflectTutorial = ({ autoPlay }: { autoPlay: boolean }) => <ReflectTutorial autoPlay={autoPlay} mode="phys-reflect" />
export const MagReflectTutorial = ({ autoPlay }: { autoPlay: boolean }) => <ReflectTutorial autoPlay={autoPlay} mode="mag-reflect" />
