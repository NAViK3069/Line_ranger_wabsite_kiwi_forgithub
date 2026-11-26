'use client'

// ====================================================
// วิดีโอสอน: พลังโจมตี (ATK) — ใช้อาวุธ "ร่มกันจันทรา" (eq_wpn_evt_057) +5
//   เรา (Rock Legend Brown) ใส่เกียร์แล้วตีเป้าหมาย (Executor Anubis Brown) ที่ใส่เกียร์ชุด HP สูงสุด (+5)
//   เป้าหมาย HP 17.2M → 277.7M · ต้านสกิล 30% → 79.8% → สกิลไม่ถึงตายทั้ง 2 รอบ (เห็นแค่หลอดเลือดลดต่างกัน)
//   ฉาก: public/gear-options/scenes/atk.anme.json ← scripts/gear-options/build-atk-scene.cjs
//   โครงเรื่อง / เวลา / ชิ้นส่วนหน้าตา: ./kit.tsx
//
// ตัวเลขทั้งหมดคำนวณสดจากข้อมูลชุดเดียวกับ Ranger Book / Gear Book (ไม่พิมพ์ตายตัว):
//   ค่าพลังเลเวลเต็ม = /data/ranger/stats/<id>.json → baseStats / rates / skills
//   ATK หลังใส่เกียร์ = aggregateGearBonuses + gearStat (ฐาน × (1 + %) แบบในเกม · Overall ATK เข้าทั้ง phy และ mag)
//   ค่าเกียร์ +5 = recalcGearEffects (+5 = Basic เต็มแล้ว · ทดสอบแค่ค่า Basic จึงไม่ต้องตีถึง +10)
//   โจมตีปกติ = normalHit (กายภาพ/เวท คนละ DEF แล้วรวม — แบบในเกม) · สกิล = ATK รวม × ความแรงสกิล × (1 − ต้านสกิล) ไม่โดน DEF
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { aggregateGearBonuses } from '@/lib/gearEffectParser'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, EquipCard, Fit1, GearCard, healRingLayers, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, firstSkill, gearIconUrl, loadGear, loadStats,
  defParts, gearStat, makeRounds, normalHit, pct, skillMultiplier, switchableFor, switchableOf, totalAtk, useTutorialData,
  type GearKind, type SlotGear,
} from './kit'

const SCENE = '/gear-options/scenes/atk.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1242e-brown' }   // เปลี่ยนตัว → แก้ใน build-atk-scene.cjs ด้วย
const GEAR = 'eq_wpn_evt_057'
const GEAR_GRADE = 7
const SHOWN_SWITCHABLE = 'GEAR_ATTR_PRD_SPE_MUL_nm'   // ช่อง Switchable บนการ์ด (ตามภาพในเกม) — ไม่มีผลกับ ATK

/**
 * เกียร์ของเป้าหมาย = ชุดที่ทำให้ HP สูงสุด (ค้นทุกเกียร์ในเกม ที่ +5 แบบเดียวกับเกียร์ของเรา) ตามกฎเกม:
 *   1 ชิ้นต่อช่อง · ค่า Basic บวกกันทุกชิ้น · Switchable ต้องตรงเงื่อนไข และชนิดเดียวกันซ้ำใช้ค่าสูงสุดตัวเดียว
 *   → HP% รวม = 444 + 150 (Switchable HP ของค้อน · เงื่อนไข STR ตรงกับเป้าหมาย) + 474 + 444 = 1512%
 *   ชิ้นที่ HP เท่ากันมีหลายตัว (อาวุธ/เครื่องประดับ) — เลือกตัวแรกของผลค้น · ค่าอื่นของชุดนี้ที่มีผลกับดาเมจ = ต้านสกิล +49.8% (ถุงมือ)
 *   grade จาก game_item_equip.equipGrade
 */
const TARGET_GEARS: { code: string; kind: GearKind; grade: number; en: string; switchable?: string }[] = [
  { code: 'eq_2512_wpn_38', kind: 'weapon', grade: 8, en: 'Xmas Hammer', switchable: 'GEAR_ATTR_HP_MUL_nm' },   // HP +444% · Switchable HP +150% (STR)
  { code: 'eq_amr_evt_016', kind: 'armor', grade: 6, en: "Queen Sally's Glove" },                             // HP +474% · ต้านสกิล +49.8% · หลบสกิล +42.6%
  { code: 'eq_ace_acc_26', kind: 'acc', grade: 6, en: "[AA]Godot's Mask" },                                   // HP +444% · หลบสกิล +58.8% · ทนกระเด็น +90%
]
/** สกิล: (1 − clamp(ต้านสกิล − เจาะสกิล, 0, 0.97)) — ยืนยันจากโค้ดเกม (เราไม่มีเจาะสกิล) */
const resFactor = (res: number) => 1 - Math.min(0.97, Math.max(0, res))

async function loadData() {
  const [ally, enemy, { gear, bonus: b }, ...tg] = await Promise.all([
    loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(GEAR), ...TARGET_GEARS.map(g => loadGear(g.code)),
  ])
  // เกียร์ของเป้าหมาย: Basic ทุกชิ้น + Switchable ที่เลือก (ตรวจเงื่อนไขกับเป้าหมายแล้ว)
  const tSw = TARGET_GEARS.map((g, i) => (g.switchable ? switchableFor(tg[i].gear, g.switchable, enemy) : null))
  const tBonus = aggregateGearBonuses(tg.map(x => x.gear), tSw)
  const enemyHp = gearStat(enemy.baseStats.hp, tBonus.hp)
  // ต้านสกิลจากเกียร์บวกเข้ากับค่าเดิมตรงๆ (แบบเดียวกับหน้า Ranger Book)
  const enemyRes = (enemy.rates.skillResistance ?? 0) + (tBonus.skillResistance?.pct ?? 0)
  const s = ally.baseStats
  const atkBefore = totalAtk(ally)
  const phyAfter = gearStat(s.phyAtk, b.phyAtk)
  const magAfter = gearStat(s.magAtk, b.magAtk)
  const atkAfter = phyAfter + magAfter
  const hitBefore = normalHit(s.phyAtk, s.magAtk, enemy.baseStats)
  const hitAfter = normalHit(phyAfter, magAfter, enemy.baseStats)
  const skill = firstSkill(ally)
  const skillMul = skillMultiplier(skill)
  return {
    ally, enemy, gear, switchable: switchableOf(gear, SHOWN_SWITCHABLE),
    atkBefore, atkAfter, atkPct: b.magAtk?.pct ?? b.phyAtk?.pct ?? 0,
    enemyRes, hitBefore,
    enemyHp, enemyBaseHp: enemy.baseStats.hp, enemyBaseRes: enemy.rates.skillResistance ?? 0,
    // HP% ต่อชิ้น (Basic + Switchable ของชิ้นนั้น) — โน้ตใต้ค่า HP บนการ์ดเป้าหมาย
    targetHpPct: TARGET_GEARS.map((_, i) => aggregateGearBonuses([tg[i].gear], [tSw[i]]).hp?.pct ?? 0),
    targetResPct: tBonus.skillResistance?.pct ?? 0,
    dmgBefore: hitBefore.total,
    dmgAfter: hitAfter.total,
    skill, skillMul,
    dmgSkillBefore: Math.round(atkBefore * skillMul * resFactor(enemyRes)),
    dmgSkill: Math.round(atkAfter * skillMul * resFactor(enemyRes)),
  }
}

export default function AtkTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearIcon = gearIconUrl(GEAR)
  const gearName = tGear(GEAR, 'Moonbrella')
  const allyName = tRanger(ALLY.ranger, 'Rock Legend Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Executor Anubis Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const enemyHp = d.enemyHp
  const targetGearIcons = Object.fromEntries(TARGET_GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>

  /** 4 รอบของวิดีโอ — ใช้ร่วมกันระหว่างชั้นซ้อน (หลอดเลือด/ฮิล/วิญญาณ) กับวงแสงฮิลบน canvas */
  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [d.dmgBefore, d.dmgSkillBefore, d.dmgAfter, d.dmgSkill], [enemyHp, enemyHp, enemyHp, enemyHp])

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    // 4 รอบ: โจมตีปกติ / สกิล × ไม่ใส่เกียร์ / ใส่เกียร์ — เป้าหมายใส่ชุด HP ตลอด เลือดเต็มเท่าเดิมทุกรอบ
    const rounds = roundsOf(c)

    // ── สรุป ──
    const S = TL.summary
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const sumRows = [
      { label: T('โจมตีปกติ · ไม่ใส่เกียร์', 'Normal attack · no gear'), v: d.dmgBefore, cls: 'from-slate-500 to-slate-300', at: S + 0.6 },
      { label: T(`โจมตีปกติ · ${gearName}`, `Normal attack · ${gearName}`), v: d.dmgAfter, cls: 'from-amber-500 to-orange-300', at: S + 1.1 },
      { label: T(`สกิล ${skillName} · ไม่ใส่เกียร์`, `Skill ${skillName} · no gear`), v: d.dmgSkillBefore, cls: 'from-fuchsia-900 to-fuchsia-500', at: S + 1.6 },
      { label: T(`สกิล ${skillName} · ${gearName}`, `Skill ${skillName} · ${gearName}`), v: d.dmgSkill, cls: 'from-fuchsia-600 to-purple-400', at: S + 2.1 },
    ]
    // แท่งกราฟใช้สเกล log — ดาเมจสกิลใหญ่กว่าโจมตีปกติหลายร้อยเท่า ถ้าใช้สเกลตรงแท่งเล็กจะมองไม่เห็นเลย
    const logW = (v: number) => (Math.log10(v) - 4) / (Math.log10(d.dmgSkill) - 4)

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('พลังโจมตี', 'ATK')} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIcon} name={gearName} effName={effName} switchable={d.switchable} grade={GEAR_GRADE} />

        {/* ค่าพลัง + ช่องเกียร์ของเรนเจอร์เรา */}
        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.atkBefore)} hlAt={8.75} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.ally.baseStats.hp)} dim />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.ally, T)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        {/* ค่าพลัง + ช่องเกียร์ของเป้าหมาย (ใส่ชุด HP สูงสุด) — ใช้ทั้ง HP และ DEF (ต้านสกิลใช้ตอนโดนสกิล) */}
        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('เป้าหมาย · ใส่เกียร์ HP เต็มที่', 'Target · full HP gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(enemyHp)} hlAt={13.05}
              note={T(`ฐาน ${fmtInt(d.enemyBaseHp)} · เกียร์ ${d.targetHpPct.map(p => '+' + pct(p, 0)).join(' ')}`,
                `Base ${fmtInt(d.enemyBaseHp)} · gear ${d.targetHpPct.map(p => '+' + pct(p, 0)).join(' ')}`)} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.enemy, T)} hlAt={13.55} />
            <StatRow t={t} label={T('ต้านสกิล', 'Skill Resistance')} value={pct(d.enemyRes, 1)} dim
              note={T(`ฐาน ${pct(d.enemyBaseRes)} + เกียร์ ${pct(d.targetResPct, 1)} · ใช้ตอนโดนสกิล`,
                `Base ${pct(d.enemyBaseRes)} + gear ${pct(d.targetResPct, 1)} · used against skills`)} />
          </>}
          slots={<GearSlots t={t} filled={targetGearIcons} />} />

        <NormalFormulaCard t={t} T={T} heading={T('โจมตีปกติ: พลังป้องกันช่วยลดดาเมจ', 'Normal attack: DEF reduces damage')}
          defOwner={T('ของเป้าหมาย', '(target)')} hit={d.hitBefore} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkBefore)}`} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ENEMY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ENEMY.actor} rounds={rounds} />

        <EquipCard t={t} T={T} gearIcon={gearIcon} gearName={gearName} bonusPct={d.atkPct} grade={GEAR_GRADE}
          stats={[{ icon: ICON.atk, label: T('พลังโจมตี', 'ATK'), before: d.atkBefore, after: d.atkAfter }]} />

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK (ยังไม่ใส่เกียร์)', 'ATK (no gear)')} atk={d.atkBefore}
          resLabel={T('ต้านสกิลของเป้าหมาย', 'Target Skill Resistance')} res={d.enemyRes} dmg={d.dmgSkillBefore} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ATK ${fmtInt(d.atkBefore)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkAfter)}`} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ATK ${fmtInt(d.atkAfter)}`} color={BANNER_COLOR.skillGear} />

        <Souls c={c} t={t} actor={ENEMY.actor} side="enemy" rounds={rounds} />

        <SummaryShell t={t} T={T} title={T('ดาเมจต่อครั้ง (เป้าหมายเดียวกัน)', 'Damage per hit (same target)')}>
          {sumRows.map(r => (
            <div key={r.label} className="mt-4" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{r.label}</span></Fit1>
                <span className="shrink-0 ml-4 font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${Math.max(3, logW(r.v) * 100) * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-6 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 2.9, TL.end, 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('โจมตีปกติ แรงขึ้น', 'Normal attack')}</div>
              <div className="text-[52px] font-black text-amber-300 leading-none mt-1">×{(d.dmgAfter / d.dmgBefore).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-[#250a2a] border-2 border-fuchsia-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('สกิล แรงขึ้น', 'Skill')}</div>
              <div className="text-[52px] font-black text-fuchsia-300 leading-none mt-1">×{(d.dmgSkill / d.dmgSkillBefore).toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-4 text-center text-[20px] font-bold text-gray-300">
            {T(`เป้าหมายใส่เกียร์ HP เต็มที่ · HP ${fmtInt(enemyHp)} · ต้านสกิล ${pct(d.enemyRes, 1)}`,
              `Target in full HP gear · HP ${fmtInt(enemyHp)} · Skill Res. ${pct(d.enemyRes, 1)}`)}
          </div>
          <div className="mt-1 text-center text-[18px] text-gray-500">
            {T('เลเวลเต็มทั้งสองฝั่ง · เกียร์ +5 · ไม่รวมคริ / ธาตุ / โอกาสหลบ · กราฟใช้สเกล log', 'Both at max level · gear +5 · no crit / element / evasion · log-scale bars')}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ENEMY.actor, roundsOf)} />
}
