'use client'

// ====================================================
// วิดีโอสอน: การต้านทักษะ (Skill Resistance) — ใช้ "[FA] Philosopher's Stone" (eq_acc_26metal) +5 (ต้านทักษะ +78% · ชิ้นเดียวที่สูงสุดในเกม)
//   คู่เดียวกับวิดีโอ HP: เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์) · ศัตรู = Rock Legend Brown (ขวา, ไม่ใส่เกียร์) เป็นฝ่ายตีเรา
//   ไม่ใส่เกียร์: โดนสกิลแล้วตาย → ใส่เกียร์: ต้าน 30% + 78% = 108% → เพดาน 97% → สกิลเหลือ 3% รอด · ตีปกติเท่าเดิม (ต้านทักษะไม่ลดตีปกติ)
//   ฉาก: public/gear-options/scenes/skill-resist.anme.json ← scripts/gear-options/build-skillres-scene.cjs
//
// กฎของเกม (libgame.so):
//   เกียร์ Skill Resistance (ชนิด 0x12) บวกตรงเข้า skillResistance ของเรนเจอร์ (getter 0xa50) — Basic บวกกันทุกชิ้น
//   สกิล (fn 0xcf7228) = (ATK + ATK พิเศษ) × ความแรงสกิล × (1 − clamp(ต้าน − เจาะ, 0, 0.97)) × ธาตุ — ไม่โดน DEF
//   ตีปกติ = ATK กายภาพ × K/(K + DEF) + ATK เวท × K/(K + DEF เวท) — ไม่เกี่ยวกับต้านทักษะ
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { clamp01, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, EquipCard, Fit1, GearCard, healRingLayers, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, firstSkill, gearIconUrl, loadGear, loadStats,
  defParts, makeRounds, normalHit, pct, pctAuto, skillMultiplier, totalAtk, useTutorialData,
} from './kit'

const SCENE = '/gear-options/scenes/skill-resist.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1242e-brown' }    // เรา — ใส่เกียร์ (ตรงกับ build-skillres-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1260e-brown' }   // ศัตรู — ไม่ใส่เกียร์ เป็นฝ่ายตี
const GEAR = 'eq_acc_26metal'
const GEAR_GRADE = 6
/** ต้านทักษะสูงสุดที่เกมนับ (clamp 0..0.97) */
const RES_CAP = 0.97

async function loadData() {
  const [ally, enemy, { gear, bonus: b }] = await Promise.all([loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(GEAR)])
  const hp = ally.baseStats.hp
  const enemyAtk = totalAtk(enemy)
  const hit = normalHit(enemy.baseStats.phyAtk, enemy.baseStats.magAtk, ally.baseStats)
  const resBefore = ally.rates.skillResistance ?? 0
  const resGear = b.skillResistance?.pct ?? 0
  const resRaw = Math.fround(Math.fround(resBefore) + Math.fround(resGear))   // บวกตรง (float32 แบบเกม)
  const resAfter = Math.min(RES_CAP, Math.max(0, resRaw))
  const skill = firstSkill(enemy)
  const skillMul = skillMultiplier(skill)
  const skillDmg = (res: number) => Math.round(enemyAtk * skillMul * (1 - Math.min(RES_CAP, Math.max(0, res))))
  return {
    ally, enemy, gear, switchable: gear.switchable?.effect ?? null,
    hp, enemyAtk, hit, dmgNormal: hit.total,
    resBefore, resGear, resRaw, resAfter,
    skill, skillMul, dmgBefore: skillDmg(resBefore), dmgAfter: skillDmg(resRaw),
  }
}

export default function SkillResistTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearIcon = gearIconUrl(GEAR)
  const gearName = tGear(GEAR, "[FA] Philosopher 's Stone")
  const allyName = tRanger(ALLY.ranger, 'Executor Anubis Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Rock Legend Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', 'GEAR_ATTR_SKLRE_PROB_MUL_nm', T('ต้านทักษะ', 'Skill Resistance'))
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === 'SKLRE_PROB_MUL' ? i : -1)).filter(i => i >= 0)
  const { hp, dmgNormal: dmgN, dmgBefore: dmgB, dmgAfter: dmgA } = d
  const leftAfter = hp - dmgA

  /** 4 รอบ: ศัตรูตีปกติ / สกิล × ไม่ใส่เกียร์ / ใส่เกียร์ (HP เท่าเดิม · สกิลเบาลง) */
  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [dmgN, dmgB, dmgN, dmgA], [hp, hp, hp, hp])

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rounds = roundsOf(c)
    const r4 = rounds[3]
    const surviveS = span(t, r4.at + 0.5, 47.6, 0.35, 0.35)
    const allyPos = c.actorAt(ALLY.actor)
    const S = TL.summary
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const rows = [
      { label: T('ไม่ใส่เกียร์', 'No gear'), v: dmgB, cls: 'from-rose-600 to-rose-400', at: S + 0.6 },
      { label: T(`ใส่${gearName} +5`, `${gearName} +5`), v: dmgA, cls: 'from-emerald-500 to-lime-300', at: S + 1.1 },
    ]
    const cmp = [
      { label: optName, a: pctAuto(d.resBefore), b: `${pctAuto(d.resAfter)}${d.resRaw > RES_CAP ? ` (${T('เพดาน', 'cap')})` : ''}` },
      { label: T('โดนตีปกติ 1 ครั้ง', 'One normal hit'), a: fmtInt(dmgN), b: fmtInt(dmgN) },
      {
        label: T(`โดนสกิล ${skillName} 1 ครั้ง`, `Hit by ${skillName} once`),
        a: dmgB >= hp ? T('ตาย', 'Dead') : fmtInt(dmgB),
        b: leftAfter <= 0 ? T('ตาย', 'Dead') : T(`รอด · ${fmtInt(dmgA)}`, `Survive · ${fmtInt(dmgA)}`),
      },
    ]

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('การต้านทักษะ', 'Skill Resistance')} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIcon} name={gearName} effName={effName} switchable={d.switchable} kind="acc" grade={GEAR_GRADE} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value={pctAuto(d.resBefore)} hlAt={8.75}
              note={T('ลดดาเมจสกิลที่เราโดน · สูงสุด 97%', 'Reduces skill damage we take · max 97%')} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(hp)} hlAt={9.3} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.ally, T)} dim
              note={T('ใช้กับตีปกติ (สกิลไม่โดน DEF)', 'For normal hits (skills ignore DEF)')} />
          </>}
          slots={<GearSlots t={t} />} />

        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('ศัตรู · ไม่ใส่เกียร์', 'Enemy · no gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.enemyAtk)} hlAt={13.05} />
            <StatRow t={t} label={T('ความแรงสกิล', 'Skill power')} value={`ATK × ${pct(d.skillMul)}`} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <NormalFormulaCard t={t} T={T} heading={T('ตีปกติ: ใช้ DEF ลด — ต้านทักษะไม่เกี่ยว', 'Normal attack: DEF reduces it — Skill Resistance does not')}
          defOwner={T('ของเรา', '(ours)')} hit={d.hit} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · ${optName} ${pctAuto(d.resBefore)}`} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ALLY.actor} rounds={rounds} />

        <EquipCard t={t} T={T} gearIcon={gearIcon} gearName={gearName} bonusPct={d.resGear} kind="acc" grade={GEAR_GRADE}
          stats={[{
            icon: ICON.def, label: optName, before: d.resBefore, after: d.resAfter, format: v => pctAuto(Math.round(v * 1000) / 1000),
            formula: `${pctAuto(d.resBefore)} + ${pctAuto(d.resGear)} = ${pctAuto(d.resRaw)}${d.resRaw > RES_CAP ? ` → ${T('เพดาน', 'cap')} 97%` : ''}`,
          }]} />

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK ของศัตรู', 'Enemy ATK')} atk={d.enemyAtk}
          resLabel={T('ต้านทักษะของเรา (สูงสุด 97%)', 'Our Skill Resistance (max 97%)')} res={d.resBefore} dmg={dmgB} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · ${optName} ${pctAuto(d.resBefore)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={`${T('ศัตรูโจมตีปกติ — ดาเมจเท่าเดิม', 'Enemy normal attack — same damage')}`} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · ${optName} ${pctAuto(d.resAfter)}`} color={BANNER_COLOR.skillGear} />

        <Souls c={c} t={t} actor={ALLY.actor} side="ally" rounds={rounds} />

        {surviveS.on && allyPos && leftAfter > 0 && (() => {
          const sp = c.project({ x: allyPos.x, y: allyPos.y - 205 })
          const pop = easeOutBack(clamp01(surviveS.enter))
          return (
            <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 220), 1060) + 196, top: sp.y, transform: `translateY(-100%) scale(${0.6 + 0.4 * pop})`, transformOrigin: 'left bottom', opacity: surviveS.alpha }}>
              <div className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-lime-500 border-2 border-emerald-200/70 text-center whitespace-nowrap shadow-[0_10px_30px_rgba(16,185,129,0.55)]">
                <div className="text-[38px] font-black text-white leading-tight">{T('รอด!', 'Survived!')}</div>
                <div className="text-[22px] font-bold text-white/95 tabular-nums">{T('เหลือ HP', 'HP left')} {fmtInt(leftAfter)}</div>
              </div>
            </div>
          )
        })()}

        <SummaryShell t={t} T={T} top={-345} title={T(`ดาเมจสกิล ${skillName} ที่เราโดน`, `${skillName} damage we take`)}>
          {rows.map(r => (
            <div key={r.label} className="mt-3" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{r.label}</span></Fit1>
                <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${Math.max(1, (r.v / dmgB) * 100) * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-4 rounded-2xl border-2 border-white/10 overflow-hidden text-[24px]" style={{ opacity: easeOut(prog(t, S + 1.7, S + 2.1)) }}>
            <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-white/5 text-[20px] font-black text-gray-400">
              <span className="px-4 py-1.5" />
              <span className="px-4 py-1.5 text-center">{T('ไม่ใส่เกียร์', 'No gear')}</span>
              <span className="px-4 py-1.5 text-center text-emerald-300">{T('ใส่เกียร์', 'With gear')}</span>
            </div>
            {cmp.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[1.5fr_1fr_1fr] border-t-2 border-white/10" style={{ opacity: easeOut(prog(t, S + 1.9 + i * 0.3, S + 2.3 + i * 0.3)) }}>
                <Fit1 className="px-4 py-2 self-center"><span className="font-bold text-gray-200">{r.label}</span></Fit1>
                <Fit1 className="px-3 py-2 text-center self-center"><span className={`font-black tabular-nums ${r.a === T('ตาย', 'Dead') ? 'text-rose-400' : 'text-white'}`}>{r.a}</span></Fit1>
                <Fit1 className="px-3 py-2 text-center self-center"><span className="font-black tabular-nums text-emerald-300">{r.b}</span></Fit1>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={popStyle(span(t, S + 3.0, TL.end, 0.5, 0.6))}>
            {T(`ต้านทักษะบวกตรง แต่เกมนับสูงสุด 97% — สกิลยังเข้าอย่างน้อย 3% เสมอ · ไม่ช่วยลดตีปกติ (ใช้ DEF แทน) · ศัตรูที่มี "อัตราการเจาะทักษะ" ลบต้านของเราก่อนเทียบเพดาน`,
              `Skill Resistance adds up, but the game caps it at 97% — skills always deal at least 3% · it does not reduce normal hits (DEF does) · an enemy's Skill Pierce Rate is subtracted before the cap`)}
          </div>
          <div className="mt-3 text-center text-[18px] text-gray-500">
            {T('เลเวลเต็มทั้งสองฝั่ง · ไม่รวมคริติคอล / ธาตุ', 'Both at max level · no crit / element')}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ALLY.actor, roundsOf)} />
}
