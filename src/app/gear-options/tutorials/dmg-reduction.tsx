'use client'

// ====================================================
// วิดีโอสอน: ลดความเสียหาย (Damage Reduction) — ชุดที่ลดได้มากที่สุดในเกม (มีแค่เกราะ + เครื่องประดับ ไม่มีอาวุธ):
//   [YD]Yozakura T-Shirt (eq_2506_amr_07, −30%) + [DA] Hikari's Whistle (eq_2406_acc_18, −30%) ที่ +5
//   เรา = Executor Anubis Brown (ซ้าย, ใส่เกียร์) · ศัตรู = Vocalist Brown (ขวา, ไม่ใส่เกียร์) เป็นฝ่ายตีเรา
//   ไม่ใส่เกียร์: โดนสกิลตาย → ใส่เกียร์: ดาเมจ × (1 − 0.3) × (1 − 0.3) = × 0.49 (ลด 51% ไม่ใช่ 60%) → รอด · ตีปกติก็ลดเท่ากัน
//   ฉาก: public/gear-options/scenes/dmg-reduction.anme.json ← scripts/gear-options/build-dmgred-scene.cjs
//
// กฎของเกม (libgame.so):
//   ลดความเสียหาย (ชนิด 0x2a) รวมแบบคูณ (0x111da60): Π(1 − Basic แต่ละชิ้น) × (1 − Switchable ตรงเงื่อนไขที่สูงสุดตัวเดียว)
//   คูณดาเมจตอนท้ายทั้งตีปกติ (0xcec4d0 — ทั้งส่วนกายภาพและเวท) และสกิล (0xcf7228) เมื่อผลคูณ < 1
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { clamp01, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, Fit1, FitCard, GEAR_LEVEL, GearCard, healRingLayers, GearSlots, HpBar, Heals, ICON, LoadBox, NormalFormulaCard, Opening,
  RangerCard, SkillFormulaCard, Souls, StatRow, SummaryShell, TL, firstSkill, gearIconUrl, loadGear, loadStats, step,
  defParts, makeRounds, normalHit, pct, pctAuto, skillMultiplier, totalAtk, useTutorialData, type GearKind, type SlotGear, equipSlots,
} from './kit'

const SCENE = '/gear-options/scenes/dmg-reduction.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1242e-brown' }    // เรา — ใส่เกียร์ (ตรงกับ build-dmgred-scene.cjs)
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1224e-brown' }   // ศัตรู — ไม่ใส่เกียร์ เป็นฝ่ายตี
/** ชุดลดความเสียหาย (+5) — การ์ดเกียร์ตอนต้นโชว์ชิ้นแรก */
const GEARS: { code: string; kind: GearKind; grade: number; en: string }[] = [
  { code: 'eq_2506_amr_07', kind: 'armor', grade: 7, en: '[YD]Yozakura T-Shirt' },
  { code: 'eq_2406_acc_18', kind: 'acc', grade: 8, en: "[DA] Hikari's Whistle" },
]
const RE_DMG = 'RE_DMG_MUL'

async function loadData() {
  const [ally, enemy, ...gs] = await Promise.all([loadStats(ALLY.ranger), loadStats(ENEMY.ranger), ...GEARS.map(g => loadGear(g.code))])
  const hp = ally.baseStats.hp
  const enemyAtk = totalAtk(enemy)
  const hit = normalHit(enemy.baseStats.phyAtk, enemy.baseStats.magAtk, ally.baseStats)
  const res = ally.rates.skillResistance ?? 0
  // ลดความเสียหายของแต่ละชิ้น (Basic ที่ +5) · รวมแบบคูณ (float32 แบบเกม)
  const parts = gs.map(g => g.gear.basic.filter(e => e.basicGrowth?.reinforceType === RE_DMG).map(e => e.basicGrowth!.maxValue * (GEAR_LEVEL + 1)))
  const f = Math.fround
  const factor = parts.flat().reduce((m, v) => f(m * f(1 - Math.abs(v))), 1)
  const skill = firstSkill(enemy)
  const skillMul = skillMultiplier(skill)
  const raw = Math.round(enemyAtk * skillMul * (1 - Math.min(0.97, Math.max(0, res))))
  return {
    ally, enemy, gears: gs.map(g => g.gear), parts, factor,
    hp, enemyAtk, hit, res, skill, skillMul,
    dmgNormalBefore: hit.total, dmgNormalAfter: Math.trunc(f(hit.total * factor)),
    dmgBefore: raw, dmgAfter: Math.trunc(f(raw * factor)),
  }
}

export default function DmgReductionTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const gearName = (i: number) => tGear(GEARS[i].code, GEARS[i].en)
  const allyName = tRanger(ALLY.ranger, 'Executor Anubis Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Vocalist Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const optName = tr('equip', 'GEAR_ATTR_RE_DMG_MUL_nm', T('ลดความเสียหาย', 'Damage Reduction'))
  const shown = d.gears[0]
  const tested = shown.basic.map((e, i) => (e.basicGrowth?.reinforceType === RE_DMG ? i : -1)).filter(i => i >= 0)
  const { hp, dmgNormalBefore: nB, dmgNormalAfter: nA, dmgBefore: dmgB, dmgAfter: dmgA } = d
  const leftAfter = hp - dmgA
  const cut = 1 - d.factor
  const naive = d.parts.flat().reduce((s, v) => s + v, 0)
  const factorTxt = d.parts.flat().map(v => `(1 − ${pctAuto(v)})`).join(' × ')
  const slots = Object.fromEntries(GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>

  /** 4 รอบ: ตีปกติ / สกิล × ไม่ใส่ / ใส่ (ดาเมจทั้งสองแบบ × 0.49) */
  const roundsOf = (c: Pick<OverlayCtx, 'hitsOf'>) => makeRounds(c, [nB, dmgB, nA, dmgA], [hp, hp, hp, hp])

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
      { label: T(`ใส่ชุดลดความเสียหาย`, 'Damage Reduction set'), v: dmgA, cls: 'from-emerald-500 to-lime-300', at: S + 1.1 },
    ]
    const cmp = [
      { label: T('ดาเมจที่โดน', 'Damage taken'), a: '100%', b: `${pctAuto(d.factor)} (${T('ลด', '−')}${pctAuto(cut)})` },
      { label: T('โดนตีปกติ 1 ครั้ง', 'One normal hit'), a: fmtInt(nB), b: fmtInt(nA) },
      {
        label: T(`โดนสกิล ${skillName} 1 ครั้ง`, `Hit by ${skillName} once`),
        a: dmgB >= hp ? T('ตาย', 'Dead') : fmtInt(dmgB),
        b: leftAfter <= 0 ? T('ตาย', 'Dead') : T(`รอด · ${fmtInt(dmgA)}`, `Survive · ${fmtInt(dmgA)}`),
      },
    ]
    const at = TL.equip
    const eq = span(t, at - 0.9, at + 2.7, 0.4, 0.35)

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('ลดความเสียหาย', 'Damage Reduction')} />
        <GearCard t={t} T={T} gear={shown} icon={gearIconUrl(GEARS[0].code)} name={gearName(0)} effName={effName} switchable={null} kind={GEARS[0].kind} grade={GEARS[0].grade} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(hp)} hlAt={8.75} />
            <StatRow t={t} label={optName} value="0%" hlAt={9.3} note={T('ลดทั้งตีปกติและสกิลที่เราโดน', 'Cuts both normal hits and skills we take')} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} parts={defParts(d.ally, T)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <RangerCard T={T} r={d.enemy} name={enemyName} s={span(t, 12.5, 15.9)} x={40} y={24}
          tag={T('ศัตรู · ไม่ใส่เกียร์', 'Enemy · no gear')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.enemyAtk)} hlAt={13.05} />
            <StatRow t={t} label={T('ความแรงสกิล', 'Skill power')} value={`ATK × ${pct(d.skillMul)}`} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <NormalFormulaCard t={t} T={T} heading={T('ตีปกติ: DEF ลดก่อน แล้วลดความเสียหายคูณลดอีกที', 'Normal attack: DEF first, then Damage Reduction multiplies it down')}
          defOwner={T('ของเรา', '(ours)')} hit={d.hit} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · ${fmtInt(nB)}`} color={BANNER_COLOR.normalNoGear} />
        <Heals c={c} t={t} actor={ALLY.actor} rounds={rounds} />
        <HpBar c={c} t={t} actor={ALLY.actor} rounds={rounds} />

        {/* ใส่ชุด 2 ชิ้น: ลดรวมแบบคูณ */}
        {eq.on && (
          <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(eq) }}>
            <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
            <div className="mt-2 space-y-2">
              {GEARS.map((g, i) => (
                <div key={g.code} className="flex items-center gap-3" style={step(t, at - 0.75 + i * 0.12)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gearIconUrl(g.code)} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
                  <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{gearName(i)}</span></Fit1>
                  <span className="shrink-0 text-[24px] font-black text-amber-300 tabular-nums">−{pctAuto(d.parts[i].reduce((s, v) => s + v, 0))}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t-2 border-white/10">
              <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{T('ดาเมจ', 'Damage')} × {factorTxt} = × {pctAuto(d.factor)}</span></Fit1>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[22px] font-bold text-gray-300">{optName} {T('รวม', 'total')}</span>
                <span className="text-[40px] font-black text-amber-300 leading-none" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>−{pctAuto(cut)}</span>
              </div>
              <div className="mt-1 text-right text-[19px] font-bold text-rose-200">{T(`ไม่ใช่ −${pctAuto(naive)} (คูณกัน ไม่ใช่บวกกัน)`, `Not −${pctAuto(naive)} (they multiply, not add)`)}</div>
            </div>
            <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
              <GearSlots t={t} equip={equipSlots(slots, at)} />
            </div>
          </FitCard>
        )}

        <SkillFormulaCard t={t} T={T} skill={d.skill} skillName={skillName} mul={d.skillMul}
          atkLabel={T('ATK ของศัตรู', 'Enemy ATK')} atk={d.enemyAtk}
          resLabel={T('ต้านสกิลของเรา', 'Our Skill Resistance')} res={d.res} dmg={dmgB} />

        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · ${fmtInt(dmgB)}`} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T('รอบที่ 3 · ใส่ชุดลดความเสียหาย', 'Round 3 · Damage Reduction set')}
          sub={`${T('ศัตรูโจมตีปกติ', 'Enemy normal attack')} · ${fmtInt(nB)} × ${pctAuto(d.factor)}`} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T('รอบที่ 4 · ใส่ชุดลดความเสียหาย', 'Round 4 · Damage Reduction set')}
          sub={`${T('ศัตรูใช้สกิล', 'Enemy skill')} ${skillName} · × ${pctAuto(d.factor)}`} color={BANNER_COLOR.skillGear} />

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
                <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${(r.v / dmgB) * 100 * bar(r.at)}%` }} />
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
            {T(`ลดความเสียหายหลายชิ้น "คูณกัน" — ${factorTxt} = ${pctAuto(d.factor)} จึงลดได้ ${pctAuto(cut)} ไม่ใช่ ${pctAuto(naive)} · ใส่เพิ่มชิ้นละ 30% จะลดได้น้อยลงเรื่อยๆ ไม่มีวันถึง 100% · ลดทั้งตีปกติและสกิล`,
              `Damage Reduction pieces multiply — ${factorTxt} = ${pctAuto(d.factor)}, so it cuts ${pctAuto(cut)}, not ${pctAuto(naive)} · each extra 30% cuts less, and it never reaches 100% · it reduces both normal hits and skills`)}
          </div>
          <div className="mt-3 text-center text-[18px] text-gray-500">
            {T(`เกียร์ +${GEAR_LEVEL} · เลเวลเต็มทั้งสองฝั่ง · ไม่รวมคริติคอล / ธาตุ`, `Gear +${GEAR_LEVEL} · both at max level · no crit / element`)}
          </div>
        </SummaryShell>
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={healRingLayers(ALLY.actor, roundsOf)} />
}
