'use client'

// ====================================================
// วิดีโอสอน: ความเร็วในการโจมตี (Attack Speed)
//   MEGA MAN (u1010e-rockman) 2 ตัวแข่งยิง 16 วินาที — บน = ไม่ใส่เกียร์ · ล่าง = ใส่ชุด Attack Speed +225% (3 ชิ้น × 75% ที่ +5)
//   ฉาก: public/gear-options/scenes/atk-speed.anme.json ← scripts/gear-options/build-atkspeed-scene.cjs (RACE / ตัวยิง / เป้า ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so — ดู gearAttackDelay / attackInterval ใน ./kit.tsx):
//   attackDelay ที่ใส่เกียร์ = ตัดเศษ(attackDelay ÷ (1 + Attack Speed รวม))
//   ยิงทุก = max(attackDelay ÷ 30, ความยาวท่ายิง attack_ready + attack ÷ 30) — ท่ายิงเล่นความเร็วปกติ ยิงเร็วกว่าท่าไม่ได้
// ตัวเลขทั้งหมดคำนวณสดจากข้อมูลเกม (ค่าหน่วงจากไฟล์สเตตัส · ค่าเกียร์จากไฟล์เกียร์ · ความยาวท่ายิงจากไฟล์ .sam ที่ฉากโหลด)
// จำนวนนัดนับจากจังหวะกระสุนโดนจริงในไทม์ไลน์ของฉาก
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import { assets } from '@/anme/engine/assets'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Banner, BANNER_COLOR, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  attackInterval, gearAttackDelay, gearIconUrl, loadGear, loadStats, step, useTutorialData,
  type GearKind, type RangerStats, type SlotGear,
} from './kit'
import { spaceTrainLayers } from './spaceTrain'

const SCENE = '/gear-options/scenes/atk-speed.anme.json'
const RANGER = 'u1010e-rockman'
/** เลนบน / ล่าง — id คิวยิงในฉาก = `${id}_${ลำดับ}` · actor ตรงกับ build-atkspeed-scene.cjs */
const LANES = [
  { id: 'base', shooter: 'mm_base', target: 'tg_base' },
  { id: 'gear', shooter: 'mm_gear', target: 'tg_gear' },
] as const
/** ชุด Attack Speed สูงสุดที่ +5 (ค้นทุกเกียร์ในเกม): 3 ชิ้นนี้ Attack Speed Basic +75% เท่ากัน ไม่มี Switchable · grade จาก game_item_equip */
const GEARS: { code: string; kind: GearKind; grade: number; en: string }[] = [
  { code: 'eq_ace_wpn_06', kind: 'weapon', grade: 6, en: "[AA]Phoenix's Magatama" },
  { code: 'eq_amr_0086', kind: 'armor', grade: 6, en: 'Dark God Gloves' },
  { code: 'eq_acc_0046', kind: 'acc', grade: 6, en: 'Black Pearl Bracelet' },
]
const ATK_SPE = 'ATK_SPE_MUL'
/** เวลาในวิดีโอ (วินาทีของฉาก) — RACE ต้องตรงกับ build-atkspeed-scene.cjs */
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [18.4, 20.8], equipAt: 19.4, race: [21, 37], summary: [38.6, 46] } as const
/** ช่วงแข่งเล่นเร็ว ×2 */
const RACE_RATE = 2

/** แผนที่ตู้รถไฟอวกาศ — กลางหน้าต่างอยู่ตรงกลางระหว่างตัวยิงกับเป้า (./spaceTrain.ts) */
const spaceTrain = spaceTrainLayers({ centerX: 620 })

/** Attack Speed ของเกียร์ 1 ชิ้นที่ +5 (Basic = ค่า × (ระดับ + 1)) */
const atkSpeedOf = (g: GearEffects) =>
  g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === ATK_SPE ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)

async function loadData() {
  const [ranger, ...gs] = await Promise.all([loadStats(RANGER), ...GEARS.map(g => loadGear(g.code))])
  const delay = (ranger.baseStats as RangerStats['baseStats'] & { attackDelayFrames?: number }).attackDelayFrames ?? 30
  const perGear = gs.map(g => atkSpeedOf(g.gear))
  const r = perGear.reduce((s, v) => s + v, 0)   // ไม่มี Switchable Attack Speed ในชุดนี้ → Basic รวมล้วน
  return { ranger, gears: gs.map(g => g.gear), perGear, r, delay, delayGear: gearAttackDelay(delay, r) }
}

/** ความยาวท่ายิง (เฟรม) จากไฟล์ .sam ที่ฉากโหลด — ยังโหลดไม่เสร็จใช้ค่าที่วัดไว้ */
function animFramesOf(c: OverlayCtx): number {
  const a = c.scene.actors.find(x => x.id === LANES[0].shooter)
  const rt = a && assets.get(a.assetId)
  if (rt?.kind !== 'ranger') return 24
  return (rt.sam.animations['attack_ready']?.length ?? 0) + (rt.sam.animations['attack']?.length ?? 0)
}

/** จังหวะโดนทั้งหมดของเลน (เรียงเวลา) */
function laneHits(c: OverlayCtx, lane: string): number[] {
  const out: number[] = []
  for (let k = 0; k < 80; k++) {
    const h = c.hitsOf(`${lane}_${k}`)
    if (!h.length && k > 2) break
    out.push(...h)
  }
  return out.sort((a, b) => a - b)
}

const sec = (frames: number) => (frames / 30).toFixed(2)
/** ขอบดำรอบตัวเลขนับนัด (ไม่มีกล่องพื้นหลัง) — paint-order วาดขอบก่อน ตัวอักษรไม่ผอมลง */
const COUNT_STROKE: React.CSSProperties = { WebkitTextStroke: '8px #0b0d18', paintOrder: 'stroke fill', textShadow: '0 4px 10px rgba(0,0,0,0.55)' }

export default function AtkSpeedTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const name = tRanger(RANGER, 'MEGA MAN')
  const gearName = (i: number) => tGear(GEARS[i].code, GEARS[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const shownGear = d.gears[0]
  const tested = shownGear.basic.map((e, i) => (e.basicGrowth?.reinforceType === ATK_SPE ? i : -1)).filter(i => i >= 0)
  const rPct = `+${Math.round(d.r * 100)}%`
  const slots = Object.fromEntries(GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const anim = animFramesOf(c)
    const ivBase = attackInterval(d.delay, anim)
    const ivGear = attackInterval(d.delayGear, anim)
    const raceLen = TL.race[1] - TL.race[0]
    const hits = LANES.map(L => laneHits(c, L.id))
    const counts = hits.map(h => h.filter(x => x <= t).length)
    const finals = hits.map(h => h.filter(x => x <= TL.race[1] + 0.5).length)

    // ── ป้ายเลน + ตัวนับ (ช่วงแข่ง → ก่อนสรุป) ──
    const hud = span(t, TL.race[0] - 0.5, TL.summary[0] + 0.2, 0.4, 0.4)
    const laneUi = hud.on && LANES.map((L, i) => {
      const sp = c.actorAt(L.shooter), tp = c.actorAt(L.target)
      if (!sp || !tp) return null
      const s = c.project(sp), e = c.project(tp)
      const last = hits[i].filter(x => x <= t).pop()
      const bump = last != null ? 1 - prog(t, last, last + 0.25) : 0
      const gear = i === 1
      return (
        <div key={L.id}>
          {/* ป้ายซ้ายตัวยิง (เลนห่างกันน้อย วางเหนือหัวจะทับตัวบน) */}
          <div className="absolute" style={{ right: 1280 - s.x + 75, top: s.y - 75, transform: 'translateY(-50%)', opacity: hud.alpha }}>
            <div className={`px-4 py-1.5 rounded-xl border-2 text-right whitespace-nowrap ${gear ? 'bg-amber-500/90 border-amber-200/70 text-[#1a1200]' : 'bg-slate-700/90 border-white/25 text-white'}`}>
              <div className="text-[22px] font-black leading-tight">{gear ? `Attack Speed ${rPct}` : T('ไม่ใส่เกียร์', 'No gear')}</div>
              <div className="text-[17px] font-bold tabular-nums">{T(`ยิงทุก ${(gear ? ivGear : ivBase).toFixed(2)} วิ`, `1 shot / ${(gear ? ivGear : ivBase).toFixed(2)} s`)}</div>
            </div>
          </div>
          {/* ตัวนับข้างเป้า */}
          <div className="absolute flex items-baseline gap-2" style={{ left: e.x + 70, top: e.y - 85, transform: 'translateY(-50%)', opacity: hud.alpha }}>
            <span className={`inline-block text-center font-black tabular-nums leading-none ${gear ? 'text-amber-300' : 'text-white'}`}
              style={{ ...COUNT_STROKE, fontSize: 72, minWidth: '1.2em', transform: `scale(${1 + 0.3 * bump})` }}>{counts[i]}</span>
            <span className="font-black text-white" style={{ ...COUNT_STROKE, fontSize: 28 }}>{T('นัด', 'shots')}</span>
          </div>
        </div>
      )
    })

    // ── ตัวจับเวลาแข่ง ──
    const raceT = Math.min(raceLen, Math.max(0, t - TL.race[0]))
    const timer = span(t, TL.race[0] - 0.3, TL.race[1] + 1.2, 0.3, 0.4)

    // ── สรุป ──
    const S = TL.summary[0]
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const maxShots = Math.max(1, ...finals)

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('ความเร็วโจมตี', 'Attack Speed')} />
        <GearCard t={t} T={T} gear={shownGear} icon={gearIconUrl(GEARS[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={GEARS[0].kind} grade={GEARS[0].grade} tested={tested} />

        {/* MEGA MAN: ค่าหน่วงระหว่างนัด + ความยาวท่ายิง */}
        <RangerCard T={T} r={d.ranger} name={name} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('เรนเจอร์ที่ทดสอบ', 'Test ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={T('ค่าหน่วงระหว่างนัด', 'Attack delay')} value={T(`${d.delay} เฟรม`, `${d.delay} frames`)} hlAt={8.6}
              note={T(`= ${sec(d.delay)} วิ (30 เฟรม = 1 วิ)`, `= ${sec(d.delay)} s (30 frames = 1 s)`)} />
            <StatRow t={t} label={T('ความยาวท่ายิง', 'Attack animation')} value={T(`${anim} เฟรม`, `${anim} frames`)} hlAt={9.6}
              note={T(`ท่าเตรียม + ท่ายิง = ${sec(anim)} วิ`, `wind-up + shot = ${sec(anim)} s`)} />
            <StatRow t={t} label={T('ยิงทุก', 'Shoots every')} value={T(`${ivBase.toFixed(2)} วิ`, `${ivBase.toFixed(2)} s`)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <FormulaCard t={t} T={T} delay={d.delay} delayGear={d.delayGear} anim={anim} r={d.r} rPct={rPct} ivBase={ivBase} ivGear={ivGear} />

        <EquipSetCard t={t} T={T} names={GEARS.map((_, i) => gearName(i))} perGear={d.perGear} rPct={rPct} slots={slots} ivBase={ivBase} ivGear={ivGear} />

        <Banner t={t} start={TL.race[0] - 0.4} end={TL.race[0] + 1.6} title={T(`แข่งยิง ${raceLen} วินาที`, `${raceLen}-second shooting race`)}
          sub={T(`เล่นเร็ว ×${RACE_RATE} · นับนัดที่โดนเป้า`, `Played at ×${RACE_RATE} · counting hits`)} color={BANNER_COLOR.normalGear} />
        {laneUi}
        {timer.on && t > TL.race[0] + 1.6 && (
          <div className="absolute left-1/2 top-[22px] -translate-x-1/2 flex items-center gap-3 px-6 py-2 rounded-2xl bg-black/70 border-2 border-white/15"
            style={{ opacity: timer.alpha }}>
            <span className="material-icons-round text-[34px] text-amber-300">timer</span>
            <span className="text-[34px] font-black text-white tabular-nums">{raceT.toFixed(1)}<span className="text-white/60"> / {raceLen.toFixed(1)}</span></span>
            <span className="ml-1 px-2.5 py-0.5 rounded-lg bg-amber-400 text-[22px] font-black text-[#1a1200]">▶▶ ×{RACE_RATE}</span>
          </div>
        )}

        <SummaryShell t={t} T={T} start={TL.summary[0]} end={TL.summary[1]} top={-330}
          title={T(`ยิงได้กี่นัดใน ${raceLen} วินาที`, `Shots in ${raceLen} seconds`)}>
          {LANES.map((L, i) => (
            <div key={L.id} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
              <div className="flex justify-between items-baseline text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{i ? T(`ใส่ Attack Speed ${rPct}`, `Attack Speed ${rPct}`) : T('ไม่ใส่เกียร์', 'No gear')}</span></Fit1>
                <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>
                  {Math.round(finals[i] * bar(S + 0.5 + i * 0.5))} <span className="text-[20px] text-gray-400">{T('นัด', 'shots')}</span>
                </span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`}
                  style={{ width: `${(finals[i] / maxShots) * 100 * bar(S + 0.5 + i * 0.5)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, TL.summary[1], 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('ยิงถี่ขึ้น', 'Fires faster')}</div>
              <div className="text-[52px] font-black text-amber-300 leading-none mt-1">×{(ivBase / ivGear).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-[#0b1f2a] border-2 border-sky-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('ยิงทุก', 'One shot every')}</div>
              <div className="text-[40px] font-black text-sky-300 leading-none mt-2 tabular-nums">{ivBase.toFixed(2)} → {ivGear.toFixed(2)} {T('วิ', 's')}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance"
            style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
            {T('Attack Speed ไปลด "ค่าหน่วงระหว่างนัด" แต่ยิงเร็วกว่าความยาวท่ายิงไม่ได้ — เรนเจอร์ที่ท่ายิงยาวกว่าค่าหน่วงอยู่แล้ว ใส่เพิ่มก็ไม่เร็วขึ้น',
              'Attack Speed cuts the attack delay, but a ranger can never shoot faster than its attack animation — if the animation is already longer than the delay, more Attack Speed does nothing')}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">
            {T(`เกียร์ +${GEAR_LEVEL} · ${name} ${rPct} ชนเพดานท่ายิงพอดี (ใส่มากกว่านี้ไม่เร็วขึ้น)`, `Gear +${GEAR_LEVEL} · ${name} at ${rPct} reaches the animation cap exactly (more won't help)`)}
          </div>
        </SummaryShell>
      </>
    )
  }

  return (
    <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={spaceTrain}
      rateAt={t => (t >= TL.race[0] && t < TL.race[1] + 0.3 ? RACE_RATE : 1)} />
  )
}

/** การ์ดสูตร (TL.formula): เกมคิดความเร็วยิงยังไง */
function FormulaCard({ t, T, delay, delayGear, anim, r, rPct, ivBase, ivGear }: {
  t: number; T: (th: string, en: string) => string; delay: number; delayGear: number; anim: number; r: number; rPct: string; ivBase: number; ivGear: number
}) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  const exact = (delay / (1 + r)).toFixed(1)
  const capped = delayGear <= anim
  return (
    <FitCard className="left-1/2 top-[30px] w-[900px] -ml-[450px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมคิดความเร็วยิงแบบนี้', 'How the game times each shot')}</span></Fit1>

      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[34px] font-black text-white">
          {T('ยิงทุก', 'Shot every')} = max( {T('ค่าหน่วง', 'delay')} ÷ 30 , {T('ความยาวท่ายิง', 'animation')} )
        </span></Fit1>
        <div className="mt-1 text-center text-[20px] font-bold text-gray-300 text-balance">
          {T('ท่ายิงต้องเล่นจนจบก่อน — ยิงเร็วกว่าความยาวท่ายิงไม่ได้', 'The attack animation always plays in full — no shot can come faster than it')}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-[#2a1f08] border-2 border-amber-400/40 px-5 py-3" style={step(t, a + 1.4)}>
        <Fit1><span className="text-[24px] font-bold text-amber-100">
          {T('Attack Speed จากเกียร์ไปลดค่าหน่วง:', 'Attack Speed lowers the delay:')} <span className="font-black text-white">{T('ค่าหน่วงใหม่', 'new delay')} = {T('ค่าหน่วง', 'delay')} ÷ (1 + Attack Speed)</span>
        </span></Fit1>
        <Fit1 className="mt-1.5"><span className="text-[30px] font-black text-white tabular-nums">
          {delay} ÷ (1 + {rPct}) = {exact} → <span className="text-amber-300">{delayGear} {T('เฟรม', 'frames')}</span>
          <span className="text-[20px] font-bold text-gray-400"> {T('(ตัดเศษทิ้ง)', '(rounded down)')}</span>
        </span></Fit1>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3">
          <div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <Fit1><span className="text-[24px] font-bold text-gray-200 tabular-nums">max({sec(delay)}, {sec(anim)})</span></Fit1>
          <div className="text-[40px] font-black text-white tabular-nums leading-tight">{ivBase.toFixed(2)} {T('วิ/นัด', 's/shot')}</div>
        </div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3">
          <div className="text-[20px] font-bold text-amber-200">{T(`ใส่ Attack Speed ${rPct}`, `Attack Speed ${rPct}`)}</div>
          <Fit1><span className="text-[24px] font-bold text-gray-200 tabular-nums">max({sec(delayGear)}, {sec(anim)})</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 tabular-nums leading-tight">{ivGear.toFixed(2)} {T('วิ/นัด', 's/shot')}</div>
        </div>
      </div>
      {capped && (
        <div className="mt-3 text-center text-[21px] font-black text-sky-300" style={step(t, a + 3.4)}>
          {T('ค่าหน่วงลดลงจนเท่าความยาวท่ายิงพอดี = เร็วที่สุดที่ตัวนี้ยิงได้', 'The delay now equals the animation length — the fastest this ranger can fire')}
        </div>
      )}
    </FitCard>
  )
}

/** ตัวล่างใส่ชุด Attack Speed (TL.equip) — 3 ชิ้น + ผลรวม + ช่องเกียร์เต็ม */
function EquipSetCard({ t, T, names, perGear, rPct, slots, ivBase, ivGear }: {
  t: number; T: (th: string, en: string) => string; names: string[]; perGear: number[]; rPct: string
  slots: Partial<Record<GearKind, SlotGear>>; ivBase: number; ivGear: number
}) {
  const s = span(t, TL.equip[0], TL.equip[1], 0.4, 0.35)
  if (!s.on) return null
  const at = TL.equipAt
  return (
    <FitCard className="w-[560px] p-6" style={{ left: 690, top: 40, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ตัวล่างใส่เกียร์แล้ว', 'Bottom ranger equipped') : T('ตัวล่างกำลังใส่เกียร์', 'Bottom ranger equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, TL.equip[0] + 0.15 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(GEARS[i].code)} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[24px] font-bold text-white">{n}</span></Fit1>
            <span className="shrink-0 text-[24px] font-black text-amber-300 tabular-nums">+{Math.round(perGear[i] * 100)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between">
        <span className="text-[24px] font-bold text-gray-300">Attack Speed {T('รวม', 'total')}</span>
        <span className="text-[44px] font-black text-amber-300 leading-none" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{rPct}</span>
      </div>
      <div className="mt-1 text-right text-[22px] font-bold text-gray-300 tabular-nums">
        {T('ยิงทุก', 'One shot every')} {ivBase.toFixed(2)} → <span className="text-amber-300 font-black">{ivGear.toFixed(2)} {T('วิ', 's')}</span>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} filled={t >= at ? slots : undefined} />
      </div>
    </FitCard>
  )
}

