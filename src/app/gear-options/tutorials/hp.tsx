'use client'

// ====================================================
// วิดีโอสอน: พลังชีวิต (HP) — ใช้อาวุธ "ธนูคริสต์มาส ศักดิ์สิทธิ์" (eq_2212_wpn_07) +5 (HP +444%)
//   สลับตัวกับวิดีโอ ATK: เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์) · ศัตรู = Rock Legend Brown (ขวา, ไม่ใส่เกียร์) เป็นฝ่ายตีเรา
//   ไม่ใส่เกียร์: โดนสกิลศัตรูแล้วตาย → ใส่เกียร์: HP ×5.44 รอดจากสกิลเดียวกัน
//   ฉาก: public/gear-options/scenes/hp.anme.json ← scripts/gear-options/build-hp-scene.cjs
//   โครงเรื่อง / เวลา / ชิ้นส่วนหน้าตา: ./kit.tsx
//
// ตัวเลขทั้งหมดคำนวณสดจากข้อมูลชุดเดียวกับ Ranger Book / Gear Book (ไม่พิมพ์ตายตัว):
//   HP หลังใส่เกียร์ = aggregateGearBonuses + gearStat (ฐาน × (1 + %) แบบในเกม)
//   ตีปกติที่เราโดน = normalHit: ATK กายภาพศัตรู × K/(K + DEF กายภาพเรา) + ATK เวทศัตรู × K/(K + DEF เวทเรา) (แบบในเกม)
//   สกิล = ATK รวมศัตรู × ความแรงสกิล × (1 − ต้านสกิลของเรา) — ไม่โดน DEF
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { clamp01, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, EquipCard, GearCard, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, firstSkill, gearIconUrl, loadGear, loadStats,
  defParts, gearStat, makeRounds, normalHit, pct, skillMultiplier, totalAtk, useTutorialData,
} from './kit'

const SCENE = '/gear-options/scenes/hp.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1242e-brown' }    // เรา — ใส่เกียร์ (ตรงกับ build-hp-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1260e-brown' }   // ศัตรู — ไม่ใส่เกียร์ เป็นฝ่ายตี
const GEAR = 'eq_2212_wpn_07'

async function loadData() {
  const [ally, enemy, { gear, bonus: b }] = await Promise.all([loadStats(ALLY.ranger), loadStats(ENEMY.ranger), loadGear(GEAR)])
  const hpBefore = ally.baseStats.hp
  const hpAfter = gearStat(hpBefore, b.hp)
  const enemyAtk = totalAtk(enemy)
  const hit = normalHit(enemy.baseStats.phyAtk, enemy.baseStats.magAtk, ally.baseStats)
  const ourRes = ally.rates.skillResistance ?? 0
  const skill = firstSkill(enemy)
  const skillMul = skillMultiplier(skill)
  return {
    ally, enemy, gear, switchable: gear.switchable?.effect ?? null,
    hpBefore, hpAfter, hpPct: b.hp?.pct ?? 0,
    enemyAtk, ourRes, hit,
    dmgNormal: hit.total,
    skill, skillMul,
    dmgSkill: Math.round(enemyAtk * skillMul * (1 - ourRes)),
  }
}

export default function HpTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearIcon = gearIconUrl(GEAR)
  const gearName = tGear(GEAR, 'Christmas Holy Bow')
  const allyName = tRanger(ALLY.ranger, 'Executor Anubis Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Rock Legend Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const { hpBefore: hpB, hpAfter: hpA, dmgNormal: dmgN, dmgSkill: dmgS } = d
  const hitsToDie = (hp: number, dmg: number) => Math.ceil(hp / dmg)
  const skillLeft = hpA - dmgS   // เหลือหลังโดนสกิลตอนใส่เกียร์ (< 0 = ตาย)

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    // 4 รอบ: ศัตรูตีปกติ / ใช้สกิล × เรายังไม่ใส่เกียร์ / ใส่เกียร์แล้ว (หลอดเลือดยาวขึ้น)
    const rounds = makeRounds(c, [dmgN, dmgS, dmgN, dmgS], [hpB, hpB, hpA, hpA])

    // ── รอด! ตอนโดนสกิลรอบ 4 (ใส่เกียร์แล้ว) ──
    const r4 = rounds[3]
    const surviveS = span(t, r4.at + 0.5, 47.6, 0.35, 0.35)
    const allyPos = c.actorAt(ALLY.actor)

    // ── สรุป ──
    const S = TL.summary
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const hpRows = [
      { label: T('ไม่ใส่เกียร์', 'No gear'), v: hpB, cls: 'from-slate-500 to-slate-300', at: S + 0.6 },
      { label: T(`ใส่${gearName} +5`, `${gearName} +5`), v: hpA, cls: 'from-emerald-500 to-lime-300', at: S + 1.1 },
    ]
    const cmp = [
      { label: T('โดนตีปกติ 1 ครั้ง เสีย HP', 'HP lost per normal hit'), a: pct(dmgN / hpB, 2), b: pct(dmgN / hpA, 2) },
      { label: T('ตีปกติกี่ครั้งถึงตาย', 'Normal hits to die'), a: fmtInt(hitsToDie(hpB, dmgN)), b: fmtInt(hitsToDie(hpA, dmgN)) },
      {
        label: T(`โดนสกิล ${skillName} 1 ครั้ง`, `Hit by ${skillName} once`),
        a: dmgS >= hpB ? T('ตาย', 'Dead') : T(`เหลือ ${pct((hpB - dmgS) / hpB)}`, `${pct((hpB - dmgS) / hpB)} left`),
        b: skillLeft <= 0 ? T('ตาย', 'Dead') : T(`รอด · เหลือ ${pct(skillLeft / hpA)}`, `Survive · ${pct(skillLeft / hpA)} left`),
      },
    ]

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('พลังชีวิต', 'HP')} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIcon} name={gearName} effName={effName} switchable={d.switchable} />

        {/* ค่าพลัง + ช่องเกียร์ของเรา — ฝั่งที่โดนตี: HP / DEF / ต้านสกิล ใช้หมด */}
        <RangerCard r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(hpB)} hlAt={8.75} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.ally, T)} hlAt={9.3} />
            <StatRow t={t} label={T('ต้านสกิล', 'Skill Resistance')} value={pct(d.ourRes)} dim
              note={T('ลดดาเมจสกิลที่เราโดน (ดูรอบที่ 2)', 'Reduces skill damage we take (see round 2)')} />
          </>}
          slots={<GearSlots t={t} />} />

        {/* ศัตรู — ไม่ใส่เกียร์ ใช้แค่ ATK */}
        <RangerCard r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('ศัตรู · ไม่ใส่เกียร์', 'Enemy · no gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.enemyAtk)} hlAt={13.05} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.enemy.baseStats.hp)} dim />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.enemy, T)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <NormalFormulaCard t={t} T={T} heading={T('ศัตรูโจมตีปกติ: DEF ของเราช่วยลดดาเมจ', 'Enemy normal attack: our DEF reduces damage')}
          defOwner={T('ของเรา', '(ours)')} hit={d.hit} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · HP ${fmtInt(hpB)}`} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ALLY.actor} rounds={rounds} />

        <EquipCard t={t} T={T} gearIcon={gearIcon} gearName={gearName} bonusPct={d.hpPct}
          stats={[{ icon: ICON.hp, label: T('พลังชีวิต', 'HP'), before: hpB, after: hpA }]} />

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK ของศัตรู', 'Enemy ATK')} atk={d.enemyAtk}
          resLabel={T('ต้านสกิลของเรา', 'Our Skill Resistance')} res={d.ourRes} dmg={dmgS} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · HP ${fmtInt(hpB)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · HP ${fmtInt(hpA)}`} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · HP ${fmtInt(hpA)}`} color={BANNER_COLOR.skillGear} />

        <Souls c={c} t={t} actor={ALLY.actor} rounds={rounds} />

        {/* รอด! — ใส่เกียร์แล้วโดนสกิลเดียวกันไม่ตาย */}
        {surviveS.on && allyPos && skillLeft > 0 && (() => {
          const sp = c.project({ x: allyPos.x, y: allyPos.y - 205 })
          const pop = easeOutBack(clamp01(surviveS.enter))
          return (
            // วางข้างขวาของหลอดเลือด (หลอดกว้าง 360 จัดกลางที่ x เดียวกับ HpBar) — ไม่ทับป้ายหัวรอบด้านบน
            <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 220), 1060) + 196, top: sp.y, transform: `translateY(-100%) scale(${0.6 + 0.4 * pop})`, transformOrigin: 'left bottom', opacity: surviveS.alpha }}>
              <div className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-lime-500 border-2 border-emerald-200/70 text-center whitespace-nowrap shadow-[0_10px_30px_rgba(16,185,129,0.55)]">
                <div className="text-[38px] font-black text-white leading-tight">{T('รอด!', 'Survived!')}</div>
                <div className="text-[22px] font-bold text-white/95 tabular-nums">{T('เหลือ HP', 'HP left')} {fmtInt(skillLeft)}</div>
              </div>
            </div>
          )
        })()}

        <SummaryShell t={t} T={T} top={-345} title={T('พลังชีวิตของเรา (ศัตรูตัวเดิม ไม่ใส่เกียร์)', 'Our HP (same enemy, no gear)')}>
          {hpRows.map(r => (
            <div key={r.label} className="mt-3" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
              <div className="flex justify-between text-[26px]">
                <span className="text-gray-200 font-bold">{r.label}</span>
                <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${(r.v / hpA) * 100 * bar(r.at)}%` }} />
              </div>
            </div>
          ))}
          {/* ตารางเทียบ ไม่ใส่ / ใส่เกียร์ */}
          <div className="mt-4 rounded-2xl border-2 border-white/10 overflow-hidden text-[24px]" style={{ opacity: easeOut(prog(t, S + 1.7, S + 2.1)) }}>
            <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-white/5 text-[20px] font-black text-gray-400">
              <span className="px-4 py-1.5" />
              <span className="px-4 py-1.5 text-center">{T('ไม่ใส่เกียร์', 'No gear')}</span>
              <span className="px-4 py-1.5 text-center text-emerald-300">{T('ใส่เกียร์', 'With gear')}</span>
            </div>
            {cmp.map((r, i) => (
              <div key={r.label} className="grid grid-cols-[1.5fr_1fr_1fr] border-t-2 border-white/10" style={{ opacity: easeOut(prog(t, S + 1.9 + i * 0.3, S + 2.3 + i * 0.3)) }}>
                <span className="px-4 py-2 font-bold text-gray-200">{r.label}</span>
                <span className={`px-4 py-2 text-center font-black tabular-nums ${r.a === T('ตาย', 'Dead') ? 'text-rose-400' : 'text-white'}`}>{r.a}</span>
                <span className="px-4 py-2 text-center font-black tabular-nums text-emerald-300">{r.b}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 3.0, TL.end, 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#0c2a1c] border-2 border-emerald-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('พลังชีวิต', 'HP')}</div>
              <div className="text-[46px] font-black text-emerald-300 leading-none mt-1">×{(hpA / hpB).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-[#250a2a] border-2 border-fuchsia-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T(`โดนสกิล ${skillName}`, `Hit by ${skillName}`)}</div>
              <div className="text-[40px] font-black leading-none mt-1.5">
                <span className="text-rose-400">{dmgS >= hpB ? T('ตาย', 'Dead') : T('รอด', 'Live')}</span>
                <span className="text-gray-400 mx-3">→</span>
                <span className="text-emerald-300">{skillLeft > 0 ? T('รอด', 'Live') : T('ตาย', 'Dead')}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-[18px] text-gray-500">
            {T('เลเวลเต็มทั้งสองฝั่ง · ไม่รวมคริติคอล / ธาตุ', 'Both at max level · no crit / element')}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} />
}
