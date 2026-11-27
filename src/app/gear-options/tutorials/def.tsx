'use client'

// ====================================================
// วิดีโอสอน: พลังป้องกัน (DEF) — ใช้เกราะ "Azure Sky Wing Shield" (eq_amr_0067) +5 (DEF กายภาพ +80.4% · ต้านสกิล +36%)
//   เกียร์เดียวในเกม (นอกตระกูล [MIKU] ที่ค่าผิดปกติ) ที่มี DEF % ใน Basic · ศัตรูตีกายภาพล้วน → DEF กายภาพพอ
//   ต้านสกิลของเกียร์ลดดาเมจสกิลรอบ 4 ได้ — แต่ DEF ไม่มีส่วน (สกิลยังแรงพอฆ่าอยู่ดี)
//   เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์ DEF) · ศัตรู = Brown พรานจระเข้ (ไกรทอง 9★ u1317e ธาตุแสง, ขวา)
//   ศัตรูใส่เกียร์ ATK เต็มที่ 3 ชิ้น (ค่า Basic +5) ให้ดาเมจตีปกติเห็นชัด · ตีกายภาพล้วน → ใช้แค่ DEF กายภาพของเรา
//   กระสุนหอก / เทียนเวทมนตร์ บินตามวิถีในเกมเป๊ะ (fx.game ในฉาก — ถอดจาก libgame.so)
//   บทเรียน: DEF ลดดาเมจ "โจมตีปกติ" ได้มาก แต่ "สกิล" ไม่โดนลดด้วย DEF → โดนสกิลแล้วตายเท่าเดิม
//   ฉาก: public/gear-options/scenes/def.anme.json ← scripts/gear-options/build-def-scene.cjs
//   โครงเรื่อง / เวลา / ชิ้นส่วนหน้าตา: ./kit.tsx
//
// ทุกสูตรยืนยันจากโค้ดเกม (libgame.so) แล้ว:
//   DEF หลังใส่เกียร์ = gearStat: ฐาน + ตัดเศษ(ฐาน × %รวม) — DEF กายภาพ/เวท แยกกัน
//   ตีปกติที่เราโดน = normalHit: ATK กายภาพ × K/(K + DEF กายภาพ) + ATK เวท × K/(K + DEF เวท) · K = 18000
//   สกิล = ATK รวม × ความแรงสกิล × (1 − ต้านสกิล) — ไม่มี DEF ในสูตร
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { clamp01, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, EquipCard, Fit1, GearCard, healRingLayers, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, defParts, gearIconUrl, gearStat, loadGear,
  loadStats, makeRounds, normalHit, pct, skillMultiplier, useTutorialData, type GearKind, type RangerStats, type Round, type SlotGear,
} from './kit'
import { aggregateGearBonuses } from '@/lib/gearEffectParser'

const SCENE = '/gear-options/scenes/def.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1242e-brown' }    // เรา — ใส่เกียร์ (ตรงกับ build-def-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1317e-brown' }   // ศัตรู — ไกรทอง 9★ พรานจระเข้ (ตรงกับ build-def-scene.cjs)
const GEAR = 'eq_amr_0067'
const GEAR_GRADE = 7
/** เกียร์ ATK ของศัตรู — ค่า Basic ATK สูงสุดของแต่ละช่องในคลังเกียร์ (+5) */
const ENEMY_GEARS: { code: string; kind: GearKind; grade: number; en: string }[] = [
  { code: 'eq_wpn_est_0272', kind: 'weapon', grade: 7, en: 'Twinkle Twinkle Fairy Wand' },   // Overall ATK +488.4%
  { code: 'eq_2502_amr_06', kind: 'armor', grade: 6, en: "[DM]Senshi's Pot" },               // Physical ATK +420%
  { code: 'eq_ss_acc_26', kind: 'acc', grade: 6, en: '【SS】Cygnus Head Gear' },               // Physical ATK +444%
]
/** สกิลโจมตีของศัตรู = สกิลแรกที่มี "ATK x …%" (ไกรทอง: เทียนเวทมนตร์ hsk1316 — สกิล 1 เป็นบัฟ) */
const attackSkill = (r: RangerStats) => r.skills.find(k => /ATK x [\d.]+%/.test(k.description ?? '')) ?? r.skills[0]

async function loadData() {
  const [ally, enemy, { gear, bonus: b }, ...eg] = await Promise.all([
    loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(GEAR), ...ENEMY_GEARS.map(g => loadGear(g.code)),
  ])
  const a = ally.baseStats, e = enemy.baseStats
  // ศัตรูใส่เกียร์ 3 ชิ้น: % ของทุกชิ้นบวกกันก่อนแล้วค่อยคูณฐาน (แบบในเกม)
  const eb = aggregateGearBonuses(eg.map(x => x.gear) as GearEffects[], eg.map(() => null))
  const enemyPhy = gearStat(e.phyAtk, eb.phyAtk), enemyMag = gearStat(e.magAtk, eb.magAtk)
  const defBefore = { phyDef: a.phyDef, magDef: a.magDef }
  const defAfter = { phyDef: gearStat(a.phyDef, b.phyDef), magDef: gearStat(a.magDef, b.magDef) }
  const hitBefore = normalHit(enemyPhy, enemyMag, defBefore)
  const hitAfter = normalHit(enemyPhy, enemyMag, defAfter)
  const ourRes = ally.rates.skillResistance ?? 0
  // ต้านสกิลจากเกียร์ (Basic +5) บวกตรงเข้าต้านสกิล (0xd5d490) · ดาเมจสกิล × (1 − clamp(ต้าน − เจาะ, 0, 0.97))
  const gearRes = gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === 'SKLRE_PROB_MUL' ? e.basicGrowth.maxValue * 6 : 0), 0)
  const resAfter = ourRes + gearRes
  const skill = attackSkill(enemy)
  const skillMul = skillMultiplier(skill)
  const enemyAtk = enemyPhy + enemyMag
  return {
    ally, enemy, gear, defBefore, defAfter, defPct: b.phyDef?.pct ?? b.magDef?.pct ?? 0,
    enemyBase: e.phyAtk + e.magAtk, enemyAtk, enemyGearPct: ENEMY_GEARS.map((_, i) => eg[i].bonus.phyAtk?.pct ?? 0),
    hitBefore, hitAfter, ourRes, gearRes, resAfter, skill, skillMul,
    dmgSkill: Math.round(enemyAtk * skillMul * (1 - Math.min(0.97, ourRes))),
    dmgSkill2: Math.round(enemyAtk * skillMul * (1 - Math.min(0.97, resAfter))),
  }
}

export default function DefTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearIcon = gearIconUrl(GEAR)
  const gearName = tGear(GEAR, 'Azure Sky Wing Shield')
  const allyName = tRanger(ALLY.ranger, 'Executor Anubis Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Crocodile Hunter Brown')
  const enemyGearIcons = Object.fromEntries(ENEMY_GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const hp = d.ally.baseStats.hp
  const dmgN = d.hitBefore.total, dmgN2 = d.hitAfter.total, dmgS = d.dmgSkill, dmgS2 = d.dmgSkill2
  const hitsToDie = (dmg: number) => Math.ceil(hp / dmg)
  const defTxt = (x: { phyDef: number; magDef: number }) => `${fmtInt(x.phyDef)} / ${fmtInt(x.magDef)}`
  const cut = 1 - dmgN2 / dmgN   // ดาเมจตีปกติลดลงกี่ %

  /** 4 รอบของวิดีโอ — ใช้ร่วมกันระหว่างชั้นซ้อน (หลอดเลือด/ฮิล/วิญญาณ) กับวงแสงฮิลบน canvas */
  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [dmgN, dmgS, dmgN2, dmgS2], [hp, hp, hp, hp])

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    // 4 รอบ: ศัตรูตีปกติ / ใช้สกิล × เรายังไม่ใส่เกียร์ / ใส่เกียร์แล้ว · เกียร์นี้ไม่เพิ่ม HP หลอดเลือดยาวเท่าเดิม
    const rounds = roundsOf(c)
    const allyPos = c.actorAt(ALLY.actor)

    // ป้ายข้างหลอดเลือดหลังโดนตี (รอบ 3 = ดาเมจลดลง · รอบ 4 = สกิลแรงเท่าเดิม)
    const badge = (r: Round, end: number, cls: string, title: string, sub: string) => {
      const s = span(t, r.at + 0.5, end, 0.35, 0.35)
      if (!s.on || !allyPos) return null
      const sp = c.project({ x: allyPos.x, y: allyPos.y - 205 })
      const pop = easeOutBack(clamp01(s.enter))
      return (
        // วางข้างขวาของหลอดเลือด (หลอดกว้าง 360 จัดกลางที่ x เดียวกับ HpBar) — ไม่ทับป้ายหัวรอบด้านบน
        <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 220), 1060) + 196, top: sp.y, transform: `translateY(-100%) scale(${0.6 + 0.4 * pop})`, transformOrigin: 'left bottom', opacity: s.alpha }}>
          <div className={`px-6 py-2.5 rounded-2xl border-2 text-center whitespace-nowrap ${cls}`}>
            <div className="text-[34px] font-black text-white leading-tight">{title}</div>
            <div className="text-[22px] font-bold text-white/95 tabular-nums">{sub}</div>
          </div>
        </div>
      )
    }

    // ── สรุป ──
    const S = TL.summary
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const dmgRows = [
      { label: T('ไม่ใส่เกียร์', 'No gear'), v: dmgN, cls: 'from-rose-600 to-orange-400', at: S + 0.6 },
      { label: T(`ใส่${gearName} +5`, `${gearName} +5`), v: dmgN2, cls: 'from-sky-500 to-cyan-300', at: S + 1.1 },
    ]
    const keepTxt = (h: typeof d.hitBefore) => h.parts.map(p => pct(p.factor, 1)).join(' / ')
    const cmp = [
      { label: T('DEF กายภาพ (ที่ใช้กันไกรทอง)', 'Physical DEF (used here)'), a: fmtInt(d.defBefore.phyDef), b: fmtInt(d.defAfter.phyDef) },
      { label: T('ดาเมจทะลุ DEF', 'Damage through DEF'), a: keepTxt(d.hitBefore), b: keepTxt(d.hitAfter), small: true },
      { label: T('โดนตีปกติ 1 ครั้ง เสีย HP', 'HP lost per normal hit'), a: pct(dmgN / hp, 2), b: pct(dmgN2 / hp, 2) },
      { label: T('ตีปกติกี่ครั้งถึงตาย', 'Normal hits to die'), a: fmtInt(hitsToDie(dmgN)), b: fmtInt(hitsToDie(dmgN2)) },
      { label: T(`โดนสกิล ${skillName} 1 ครั้ง`, `Hit by ${skillName} once`), a: T('ตาย', 'Dead'), b: T('ตาย', 'Dead'), dead: true },
    ]

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('พลังป้องกัน', 'DEF')} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIcon} name={gearName} effName={effName} switchable={null}
          kind="armor" grade={GEAR_GRADE} tested={[0]} />

        {/* ค่าพลัง + ช่องเกียร์ของเรา — ฝั่งที่โดนตี: DEF ลดดาเมจตีปกติ · ต้านสกิลลดดาเมจสกิล */}
        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.ally, T)} hlAt={8.75} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(hp)} dim />
            <StatRow t={t} label={T('ต้านสกิล', 'Skill Resistance')} value={pct(d.ourRes)} dim
              note={T('DEF ไม่ช่วยกันสกิล ตัวนี้ต่างหาก (ดูรอบที่ 2)', 'DEF does not stop skills — this does (see round 2)')} />
          </>}
          slots={<GearSlots t={t} />} />

        {/* ศัตรู — ไกรทอง ใส่เกียร์ ATK 3 ชิ้น · ตีกายภาพล้วน */}
        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('ศัตรู · ใส่เกียร์ ATK เต็มที่', 'Enemy · full ATK gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.enemyAtk)} hlAt={13.05}
              note={T(`ฐาน ${fmtInt(d.enemyBase)} · เกียร์ ${d.enemyGearPct.map(p => '+' + pct(p, 1)).join(' ')}`,
                `Base ${fmtInt(d.enemyBase)} · gear ${d.enemyGearPct.map(p => '+' + pct(p, 1)).join(' ')}`)} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.enemy.baseStats.hp)} dim />
            <StatRow t={t} label={T('ชนิดโจมตี', 'Attack type')} value={T('กายภาพล้วน', 'Physical only')} dim
              note={T('เราจึงใช้แค่ DEF กายภาพกันตัวนี้', 'So only our Physical DEF matters here')} />
          </>}
          slots={<GearSlots t={t} filled={enemyGearIcons} />} />

        <NormalFormulaCard t={t} T={T} heading={T('ศัตรูโจมตีปกติ: DEF ของเราช่วยลดดาเมจ', 'Enemy normal attack: our DEF reduces damage')}
          defOwner={T('ของเรา', '(ours)')} hit={d.hitBefore} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · DEF ${defTxt(d.defBefore)}`} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ALLY.actor} rounds={rounds} />

        <EquipCard t={t} T={T} gearIcon={gearIcon} gearName={gearName} bonusPct={d.defPct} kind="armor" grade={GEAR_GRADE}
          stats={[
            { icon: ICON.def, label: T('DEF กายภาพ', 'Physical DEF'), before: d.defBefore.phyDef, after: d.defAfter.phyDef },
            { icon: ICON.hp, label: T('ต้านสกิล', 'Skill Resistance'), before: d.ourRes, after: d.resAfter, format: v => pct(v),
              formula: `${pct(d.ourRes)} + ${pct(d.gearRes)} = ${pct(d.resAfter)}` },
          ]} />

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK ของศัตรู (ใส่เกียร์)', 'Enemy ATK (geared)')} atk={d.enemyAtk}
          resLabel={T('ต้านสกิลของเรา', 'Our Skill Resistance')} res={d.ourRes} dmg={dmgS} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · HP ${fmtInt(hp)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · DEF ${defTxt(d.defAfter)}`} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · ${T('DEF ไม่ลดสกิล — ลดได้แค่จากต้านสกิล', 'DEF does not reduce skills — only Skill Resistance does')}`} color={BANNER_COLOR.skillGear} />

        <Souls c={c} t={t} actor={ALLY.actor} side="ally" rounds={rounds} />

        {badge(rounds[2], 42.3, 'bg-gradient-to-r from-sky-600 to-cyan-500 border-sky-200/70 shadow-[0_10px_30px_rgba(14,165,233,0.55)]',
          T(`ดาเมจลด ${pct(cut)}`, `${pct(cut)} less damage`), `${fmtInt(dmgN)} → ${fmtInt(dmgN2)}`)}
        {badge(rounds[3], 47.6, 'bg-gradient-to-r from-rose-700 to-fuchsia-600 border-rose-200/60 shadow-[0_10px_30px_rgba(225,29,72,0.5)]',
          T('สกิลไม่โดน DEF', 'Skills ignore DEF'), `${T(`ต้านสกิล +${pct(d.gearRes)} ลดเหลือ`, `Skill Res +${pct(d.gearRes)} cuts it to`)} ${fmtInt(dmgS2)} · ${T('ยังตาย', 'still fatal')}`)}

        <SummaryShell t={t} T={T} top={-352} title={T('ดาเมจตีปกติที่เราโดน (ไกรทองใส่เกียร์ ATK เต็มที่)', 'Normal-hit damage we take (fully ATK-geared enemy)')}>
          {dmgRows.map(r => (
            <div key={r.label} className="mt-2" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between text-[24px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{r.label}</span></Fit1>
                <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-5 rounded-full bg-white/10 mt-1 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${(r.v / dmgN) * 100 * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          {/* ตารางเทียบ ไม่ใส่ / ใส่เกียร์ */}
          <div className="mt-3 rounded-2xl border-2 border-white/10 overflow-hidden text-[22px]" style={{ opacity: easeOut(prog(t, S + 1.7, S + 2.1)) }}>
            <div className="grid grid-cols-[1.45fr_1fr_1fr] bg-white/5 text-[20px] font-black text-gray-400">
              <Fit1 className="px-4 py-1 self-center"><span className="text-[16px] font-bold text-gray-500">{T('เลเวลเต็ม · ไม่รวมคริ / ธาตุ', 'Max level · no crit / element')}</span></Fit1>
              <span className="px-4 py-1.5 text-center">{T('ไม่ใส่เกียร์', 'No gear')}</span>
              <span className="px-4 py-1.5 text-center text-sky-300">{T('ใส่เกียร์', 'With gear')}</span>
            </div>
            {cmp.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[1.45fr_1fr_1fr] border-t-2 border-white/10 items-center" style={{ opacity: easeOut(prog(t, S + 1.9 + i * 0.25, S + 2.3 + i * 0.25)) }}>
                <Fit1 className="px-4 py-1"><span className="font-bold text-gray-200">{r.label}</span></Fit1>
                <Fit1 className="px-3 py-1 text-center"><span className={`font-black tabular-nums ${r.dead ? 'text-rose-400' : 'text-white'} ${r.small ? 'text-[19px]' : ''}`}>{r.a}</span></Fit1>
                <Fit1 className="px-3 py-1 text-center"><span className={`font-black tabular-nums ${r.dead ? 'text-rose-400' : 'text-sky-300'} ${r.small ? 'text-[19px]' : ''}`}>{r.b}</span></Fit1>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 3.3, TL.end, 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#08203a] border-2 border-sky-400/50 px-3 py-2 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('ดาเมจตีปกติ', 'Normal-hit damage')}</div>
              <div className="text-[40px] font-black text-sky-300 leading-none mt-1">−{pct(cut)}</div>
            </div>
            <div className="rounded-2xl bg-[#250a2a] border-2 border-fuchsia-400/50 px-3 py-2 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T(`ดาเมจสกิล ${skillName}`, `${skillName} damage`)}</div>
              <div className="text-[30px] font-black text-fuchsia-300 leading-none mt-1.5">{T('DEF ไม่ช่วย', 'DEF: no effect')}</div>
              <div className="text-[18px] font-bold text-gray-400 mt-1 tabular-nums">{T(`ต้านสกิลของเกียร์: −${pct(1 - dmgS2 / dmgS)}`, `Gear Skill Res: −${pct(1 - dmgS2 / dmgS)}`)}</div>
            </div>
          </div>
          <div className="mt-2.5 text-center text-[20px] font-bold text-amber-200" style={{ opacity: easeOut(prog(t, S + 3.8, S + 4.2)) }}>
            {T('DEF ลดได้แค่โจมตีปกติ · กันสกิลต้องเพิ่ม ต้านสกิล หรือ พลังชีวิต', 'DEF only reduces normal attacks · against skills, raise Skill Resistance or HP')}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ALLY.actor, roundsOf)} />
}
