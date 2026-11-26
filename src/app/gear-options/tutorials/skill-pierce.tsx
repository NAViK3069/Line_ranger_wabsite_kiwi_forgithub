'use client'

// ====================================================
// วิดีโอสอน: อัตราการเจาะทักษะ (Skill Pierce Rate) — "[YD]Sakura Ring" (eq_2506_acc_08) +5 · เจาะทักษะ +20.4% (สูงสุดในเกม)
//   เรา (Rock Legend Brown) ตีเป้าหมาย Executor Anubis Brown ที่ใส่ [FA] Philosopher's Stone (ต้านทักษะ 30% + 78% = 108% → เกมนับ 97%)
//   ไม่ใส่เกียร์: สกิลเข้า 3% · ใส่เกียร์: 108% − 20.4% = 87.6% → สกิลเข้า 12.4% (×4.13) · ตีปกติเท่าเดิม
//   ฉาก: public/gear-options/scenes/skill-pierce.anme.json ← scripts/gear-options/build-pierce-scene.cjs
//
// กฎของเกม (libgame.so):
//   เกียร์ Skill Pierce (ชนิด 0x13) บวกตรงเข้าค่าเจาะทักษะของผู้ตี
//   สกิล (fn 0xcf7228) = (ATK + ATK พิเศษ) × ความแรงสกิล × (1 − clamp(ต้าน − เจาะ, 0, 0.97)) × ธาตุ (แสง → แสง ×1)
//   เจาะลบออกจากต้าน "ก่อน" เทียบเพดาน 97% → เป้าที่ต้านเกินเพดาน เจาะส่วนเกินก่อน · ตีปกติไม่เกี่ยวกับต้าน/เจาะทักษะ
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { easeOut, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, EquipCard, Fit1, GearCard, healRingLayers, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, firstSkill, gearIconUrl, loadGear, loadStats,
  defParts, makeRounds, normalHit, pctAuto, skillMultiplier, totalAtk, useTutorialData,
} from './kit'

const SCENE = '/gear-options/scenes/skill-pierce.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }    // เรา — ใส่เกียร์เจาะ (ตรงกับ build-pierce-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1242e-brown' }   // เป้าหมาย — ใส่หินต้านทักษะตลอด
const GEAR = 'eq_2506_acc_08'
const GEAR_GRADE = 8
const TARGET_GEAR = { code: 'eq_acc_26metal', grade: 6 }
const RES_CAP = 0.97
const f = Math.fround

async function loadData() {
  const [ally, enemy, { gear, bonus: b }, stone] = await Promise.all([loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(GEAR), loadGear(TARGET_GEAR.code)])
  const hp = enemy.baseStats.hp
  const atk = totalAtk(ally)
  const hit = normalHit(ally.baseStats.phyAtk, ally.baseStats.magAtk, enemy.baseStats)
  const resBase = enemy.rates.skillResistance ?? 0
  const resGear = stone.bonus.skillResistance?.pct ?? 0
  const res = f(f(resBase) + f(resGear))
  void b
  const pierce = gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === 'SKLPNT_PROB_MUL' ? e.basicGrowth.maxValue * 6 : 0), 0)
  const eff = (p: number) => Math.min(RES_CAP, Math.max(0, f(res - p)))
  const skill = firstSkill(ally)
  const skillMul = skillMultiplier(skill)
  const skillDmg = (p: number) => Math.round(atk * skillMul * (1 - eff(p)))
  return {
    ally, enemy, gear, switchable: gear.switchable?.effect ?? null, hp, atk, hit,
    resBase, resGear, res, pierce, effBefore: eff(0), effAfter: eff(pierce),
    skill, skillMul, dmgBefore: skillDmg(0), dmgAfter: skillDmg(pierce),
  }
}

export default function SkillPierceTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearIcon = gearIconUrl(GEAR)
  const gearName = tGear(GEAR, '[YD]Sakura Ring')
  const stoneName = tGear(TARGET_GEAR.code, "[FA] Philosopher's Stone")
  const allyName = tRanger(ALLY.ranger, 'Rock Legend Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Executor Anubis Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', 'GEAR_ATTR_SKLPNT_PROB_MUL_nm', T('อัตราการเจาะทักษะ', 'Skill Pierce Rate'))
  const resName = tr('equip', 'GEAR_ATTR_SKLRE_PROB_MUL_nm', T('ต้านทักษะ', 'Skill Resistance'))
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === 'SKLPNT_PROB_MUL' ? i : -1)).filter(i => i >= 0)
  const dmgN = d.hit.total
  const ratio = d.dmgAfter / d.dmgBefore

  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [dmgN, d.dmgBefore, dmgN, d.dmgAfter], [d.hp, d.hp, d.hp, d.hp])

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const rounds = roundsOf(c)
    const S = TL.summary
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const rows = [
      { label: T(`สกิล ${skillName} · ไม่ใส่เกียร์`, `Skill ${skillName} · no gear`), v: d.dmgBefore, cls: 'from-slate-500 to-slate-300', at: S + 0.6 },
      { label: T(`สกิล ${skillName} · ${gearName}`, `Skill ${skillName} · ${gearName}`), v: d.dmgAfter, cls: 'from-fuchsia-600 to-purple-400', at: S + 1.1 },
    ]
    const cmp = [
      { label: T('ต้านที่เกมนับ', 'Resistance counted'), a: pctAuto(d.effBefore), b: pctAuto(d.effAfter) },
      { label: T('สกิลเข้า', 'Skill damage taken'), a: pctAuto(1 - d.effBefore), b: pctAuto(1 - d.effAfter) },
      { label: T('โจมตีปกติ 1 ครั้ง', 'One normal hit'), a: fmtInt(dmgN), b: fmtInt(dmgN) },
    ]

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIcon} name={gearName} effName={effName} switchable={d.switchable} kind="acc" grade={GEAR_GRADE} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.75} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.atk)} hlAt={9.3} />
            <StatRow t={t} label={T('ความแรงสกิล', 'Skill power')} value={`ATK × ${Math.round(d.skillMul * 100)}%`} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T(`เป้าหมาย · ใส่${stoneName}`, `Target · ${stoneName}`)} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} label={resName} value="97%" hlAt={12.8}
              note={T(`${pctAuto(d.resBase)} + เกียร์ ${pctAuto(d.resGear)} = ${pctAuto(d.res)} → เกมนับสูงสุด 97%`, `${pctAuto(d.resBase)} + gear ${pctAuto(d.resGear)} = ${pctAuto(d.res)} → counted up to 97%`)} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.hp)} hlAt={13.3} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.enemy, T)} dim note={T('ใช้กับตีปกติ', 'For normal hits')} />
          </>}
          slots={<GearSlots t={t} filled={{ acc: { icon: gearIconUrl(TARGET_GEAR.code), grade: TARGET_GEAR.grade } }} />} />

        <NormalFormulaCard t={t} T={T} heading={T('ตีปกติ: ผ่าน DEF — ต้าน/เจาะทักษะไม่เกี่ยว', 'Normal attack: DEF only — skill resist/pierce do not apply')}
          defOwner={T('ของเป้าหมาย', '(target)')} hit={d.hit} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={T('โจมตีปกติ', 'Normal attack')} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ENEMY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ENEMY.actor} rounds={rounds} />

        <EquipCard t={t} T={T} gearIcon={gearIcon} gearName={gearName} bonusPct={d.pierce} grade={GEAR_GRADE}
          kind="acc" stats={[{ icon: ICON.def, label: T('ต้านที่เกมนับ', 'Resistance counted'), before: d.effBefore, after: d.effAfter,
            format: v => pctAuto(Math.round(v * 1000) / 1000), formula: `${pctAuto(d.res)} − ${pctAuto(d.pierce)} = ${pctAuto(d.res - d.pierce)}${d.res - d.pierce > RES_CAP ? ' → 97%' : ''}` }]} />

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK', 'ATK')} atk={d.atk}
          resLabel={T('ต้านทักษะของเป้า − เจาะ (สูงสุด 97%)', 'Target resistance − pierce (max 97%)')} res={d.effBefore} dmg={d.dmgBefore} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ${T('ต้านที่นับ', 'resist')} ${pctAuto(d.effBefore)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={T('โจมตีปกติ — ดาเมจเท่าเดิม', 'Normal attack — same damage')} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ${T('ต้านที่นับ', 'resist')} ${pctAuto(d.effAfter)}`} color={BANNER_COLOR.skillGear} />

        <Souls c={c} t={t} actor={ENEMY.actor} side="enemy" rounds={rounds} />

        <SummaryShell t={t} T={T} top={-345} title={T(`ดาเมจสกิล ${skillName} ใส่เป้าที่ต้าน 108%`, `${skillName} damage vs a 108%-resist target`)}>
          {rows.map(r => (
            <div key={r.label} className="mt-3" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{r.label}</span></Fit1>
                <span className="shrink-0 ml-4 font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${Math.max(2, (r.v / d.dmgAfter) * 100) * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-4 rounded-2xl border-2 border-white/10 overflow-hidden text-[24px]" style={{ opacity: easeOut(prog(t, S + 1.7, S + 2.1)) }}>
            <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-white/5 text-[20px] font-black text-gray-400">
              <span className="px-4 py-1.5" />
              <span className="px-4 py-1.5 text-center">{T('ไม่ใส่เกียร์', 'No gear')}</span>
              <span className="px-4 py-1.5 text-center text-fuchsia-300">{T('ใส่เกียร์', 'With gear')}</span>
            </div>
            {cmp.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[1.5fr_1fr_1fr] border-t-2 border-white/10" style={{ opacity: easeOut(prog(t, S + 1.9 + i * 0.3, S + 2.3 + i * 0.3)) }}>
                <Fit1 className="px-4 py-2 self-center"><span className="font-bold text-gray-200">{r.label}</span></Fit1>
                <Fit1 className="px-3 py-2 text-center self-center"><span className="font-black tabular-nums text-white">{r.a}</span></Fit1>
                <Fit1 className="px-3 py-2 text-center self-center"><span className="font-black tabular-nums text-fuchsia-300">{r.b}</span></Fit1>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={popStyle(span(t, S + 3.0, TL.end, 0.5, 0.6))}>
            {T(`เจาะลบออกจากต้าน "ก่อน" เทียบเพดาน 97% · ต้าน ${pctAuto(d.res)} − ${pctAuto(d.pierce)} = ${pctAuto(d.res - d.pierce)} → สกิลเข้า ${pctAuto(1 - d.effAfter)} แทน 3% = แรงขึ้น ×${ratio.toFixed(2)} · ถ้าเป้าต้านเกิน 97% + เจาะ จะไม่เห็นผลเลย`,
              `Pierce is subtracted "before" the 97% cap · ${pctAuto(d.res)} − ${pctAuto(d.pierce)} = ${pctAuto(d.res - d.pierce)} → ${pctAuto(1 - d.effAfter)} gets through instead of 3% = ×${ratio.toFixed(2)} · if the target is above 97% + pierce, it shows no effect`)}
          </div>
          <div className="mt-3 text-center text-[18px] text-gray-500">
            {T('เลเวลเต็มทั้งสองฝั่ง · แสง → แสง ตัวคูณธาตุ ×1 · ไม่รวมคริติคอล', 'Both at max level · Light → Light ×1 · no crit')}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ENEMY.actor, roundsOf)} />
}
