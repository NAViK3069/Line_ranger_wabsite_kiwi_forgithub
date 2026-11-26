'use client'

// ====================================================
// วิดีโอสอน: ความเร็วการเคลื่อนที่ (Move Speed)
//   Wooden Box Cony (u1110e-cony — เรนเจอร์ที่ผู้เล่นใช้ได้ที่เดินช้าสุด) 2 ตัวแข่งเดินบนตู้รถไฟอวกาศจาก START ถึง FINISH — บน = ไม่ใส่เกียร์ · ล่าง = ชุด Move Speed +192
//   ฉาก: public/gear-options/scenes/move-speed.anme.json ← scripts/gear-options/build-movespeed-scene.cjs
//
// กฎของเกม (ถอดจาก libgame.so):
//   ใส่เกียร์: ความเร็วเดินใหม่ = movingSpeed + ตัดเศษ(Σ Move Speed)  — บวกตรง ไม่ใช่ % (Basic บวกกันทุกชิ้น · Switchable สูงสุด +15 ตัวเดียว)
//   ในสนาม: เดิน movingSpeed หน่วยระยะต่อวินาที (หน่วยเดียวกับระยะโจมตี) · ไม่มีเพดาน
// ตัวเลขคำนวณสดจากข้อมูลเกม (ความเร็ว/ระยะจากไฟล์สเตตัส · ค่าเกียร์จากไฟล์เกียร์) · จังหวะเริ่ม/ถึงเส้นชัยอ่านจากคิวเดินในฉาก
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  Banner, BANNER_COLOR, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  gearIconUrl, loadGear, loadStats, step, useTutorialData,
  type GearKind, type RangerStats, type SlotGear,
} from './kit'
import { spaceTrainLayers } from './spaceTrain'

const SCENE = '/gear-options/scenes/move-speed.anme.json'
const RANGER = 'u1110e-cony'
/** ระยะแข่ง (หน่วยระยะ) · START / FINISH บนเวที — ตรงกับ build-movespeed-scene.cjs (1 หน่วย = 2 พิกเซล) */
const DIST_PT = 350
const START_X = 250
const FINISH_X = START_X + DIST_PT * 2
/** เลนบน / ล่าง — id คิวเดินในฉาก = walk_${id} */
const LANES = [
  { id: 'base', actor: 'cony_base' },
  { id: 'gear', actor: 'cony_gear' },
] as const
/** ชุด Move Speed สูงสุดที่ +5 (ค้นทุกเกียร์ในเกม): Basic ล้วน ไม่ต้องมีเงื่อนไข · ชิ้นที่มี Switchable Move Speed ได้รวมน้อยกว่า (42 + 15) */
const GEARS: { code: string; kind: GearKind; grade: number; en: string }[] = [
  { code: 'eq_inu_wpn_06', kind: 'weapon', grade: 6, en: '[INU] Tessaiga' },
  { code: 'eq_amr_16co', kind: 'armor', grade: 6, en: '[Conan] Kick-boost shoes' },
  { code: 'eq_acc_lim_006', kind: 'acc', grade: 6, en: '[SP] Sea Necklace' },
]
/** การ์ดเกียร์ตอนต้นโชว์ชิ้นที่ Move Speed สูงสุด */
const SHOWN = 2
const SPE_ADD = 'SPE_ADD'
/** เวลาในวิดีโอ (วินาทีของฉาก) — จังหวะแข่งอ่านจากฉาก (raceOf) */
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equip: [18.4, 20.8], equipAt: 19.4, count: 21.0 } as const
/** เสียง arena_startcount: 3 · 2 · 1 · เริ่ม (วินาทีหลัง TL.count) */
const COUNT_BEATS = [0.1, 0.8, 1.25, 1.9]
/** เดินไปได้ FAST_AFTER วิแล้วเล่นเร็ว ×FAST_RATE จนตัวบนเข้าเส้นชัย (คลิปไม่ยาวเกิน) · นาฬิกายังนับเวลาจริงในเกม */
const FAST_AFTER = 3
const FAST_RATE = 2
const SPEED_TYPE: Record<string, [string, string]> = {
  VERYSLOW: ['ช้ามาก', 'Very slow'], SLOW: ['ช้า', 'Slow'], NORMAL: ['ปกติ', 'Normal'], FAST: ['เร็ว', 'Fast'], VERYFAST: ['เร็วมาก', 'Very fast'],
}

/** Move Speed ของเกียร์ 1 ชิ้นที่ +5 (Basic = ค่า × (ระดับ + 1)) */
const moveSpeedOf = (g: GearEffects) =>
  g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === SPE_ADD ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)

type RangerSpeedStats = RangerStats & { movingSpeed?: number; moveSpeedType?: string; attackRange?: number }

async function loadData() {
  const [ranger, ...gs] = await Promise.all([loadStats(RANGER) as Promise<RangerSpeedStats>, ...GEARS.map(g => loadGear(g.code))])
  const perGear = gs.map(g => moveSpeedOf(g.gear))
  const add = Math.trunc(perGear.reduce((s, v) => s + v, 0))   // เกม: ตัดเศษผลรวมแล้วบวกเข้า movingSpeed
  const speed = ranger.movingSpeed ?? 0
  return { ranger, gears: gs.map(g => g.gear), perGear, add, speed, speedGear: speed + add, range: ranger.attackRange ?? 0, type: ranger.moveSpeedType ?? '' }
}

/** จังหวะแข่งจากคิวเดินในฉาก: เริ่ม · เวลาเดินของแต่ละเลน · จบช่วงแข่ง · ช่วงสรุป */
function raceOf(c: OverlayCtx) {
  const walk = LANES.map(L => c.scene.cues.find(x => x.id === `walk_${L.id}`) as { start: number; duration: number } | undefined)
  const go = walk[0]?.start ?? TL.count + COUNT_BEATS[3]
  const dur = walk.map(w => w?.duration ?? 0)
  const end = go + Math.max(...dur) + 1.2
  return { go, dur, end, summary: [end + 0.5, c.scene.duration] as const }
}

const sec2 = (v: number) => v.toFixed(2)
/** ขอบดำรอบตัวหนังสือบนฉาก (ไม่มีกล่องพื้นหลัง) */
const STROKE: React.CSSProperties = { WebkitTextStroke: '8px #0b0d18', paintOrder: 'stroke fill', textShadow: '0 4px 10px rgba(0,0,0,0.55)' }

export default function MoveSpeedTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const name = tRanger(RANGER, 'Wooden Box Cony')
  const gearName = (i: number) => tGear(GEARS[i].code, GEARS[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const shownGear = d.gears[SHOWN]
  const tested = shownGear.basic.map((e, i) => (e.basicGrowth?.reinforceType === SPE_ADD ? i : -1)).filter(i => i >= 0)
  const addTxt = `+${d.add}`
  const slots = Object.fromEntries(GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const timeOf = (speed: number) => (speed > 0 ? DIST_PT / speed : 0)
  const timeBase = timeOf(d.speed), timeGear = timeOf(d.speedGear)
  const typeTxt = SPEED_TYPE[d.type] ? T(...SPEED_TYPE[d.type]) : d.type

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const R = raceOf(c)
    const S = R.summary[0]
    const elapsed = R.dur.map(dur => Math.min(dur, Math.max(0, t - R.go)))
    const done = R.dur.map(dur => t >= R.go + dur)

    // ── นับถอยหลัง 3 · 2 · 1 · เริ่ม ──
    const beats = COUNT_BEATS.map(b => TL.count + b)
    const beat = beats.reduce((k, at, i) => (t >= at ? i : k), -1)
    const beatT = beat >= 0 ? t - beats[beat] : 0
    const countOn = beat >= 0 && (beat < 3 || beatT < 0.7)
    const countTxt = beat < 3 ? String(3 - beat) : T('เริ่ม!', 'GO!')

    // ── ป้ายเหนือหัว + ผลเข้าเส้นชัย (ช่วงแข่ง → ก่อนสรุป) ──
    const hud = span(t, TL.count - 0.4, S + 0.2, 0.4, 0.4)
    const laneUi = hud.on && LANES.map((L, i) => {
      const p = c.actorAt(L.actor)
      if (!p) return null
      const s = c.project(p)
      const gear = i === 1
      const fin = done[i]
      const finK = fin ? easeOutBack(prog(t, R.go + R.dur[i], R.go + R.dur[i] + 0.35)) : 0
      return (
        <div key={L.id} className="absolute flex flex-col items-center" style={{ left: s.x, top: s.y - 200, transform: 'translateX(-50%)', opacity: hud.alpha }}>
          {fin && (
            <div className="mb-1 font-black tabular-nums whitespace-nowrap text-amber-300" style={{ ...STROKE, fontSize: 40, transform: `scale(${finK})` }}>
              🏁 {sec2(R.dur[i])} {T('วิ', 's')}
            </div>
          )}
          <div className={`px-3 py-1 rounded-lg border-2 text-[18px] font-black whitespace-nowrap ${gear ? 'bg-amber-500/90 border-amber-200/70 text-[#1a1200]' : 'bg-slate-700/90 border-white/25 text-white'}`}>
            {gear ? `Move Speed ${addTxt}` : T('ไม่ใส่เกียร์', 'No gear')}
          </div>
        </div>
      )
    })

    // ── กระดานเวลา (มุมขวาบน) ──
    const board = span(t, R.go - 0.2, S + 0.2, 0.3, 0.4)
    const fast = t >= R.go + FAST_AFTER && t < R.go + Math.max(...R.dur)

    // ── สรุป ──
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const finals = [timeBase, timeGear]
    const maxT = Math.max(...finals, 0.01)

    return (
      <>
        <Opening t={t} lang={lang} T={T} title={T('ความเร็วการเคลื่อนที่', 'Move Speed')} />
        <GearCard t={t} T={T} gear={shownGear} icon={gearIconUrl(GEARS[SHOWN].code)} name={gearName(SHOWN)} effName={effName}
          switchable={null} kind={GEARS[SHOWN].kind} grade={GEARS[SHOWN].grade} tested={tested} />

        {/* เรนเจอร์: ความเร็วเดิน + ระยะโจมตี (หน่วยเดียวกัน) */}
        <RangerCard T={T} r={d.ranger} name={name} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('เรนเจอร์ที่ทดสอบ', 'Test ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={T('ความเร็วเดิน', 'Move speed')} value={String(d.speed)} hlAt={8.6}
              note={T(`${typeTxt} · เดิน ${d.speed} หน่วยระยะต่อวินาที`, `${typeTxt} · walks ${d.speed} range units per second`)} />
            <StatRow t={t} label={T('ระยะโจมตี', 'Attack range')} value={String(d.range)} hlAt={9.6}
              note={T('หน่วยเดียวกับความเร็วเดิน', 'Same unit as move speed')} />
            <StatRow t={t} label={T(`เดิน ${DIST_PT} หน่วย`, `Walk ${DIST_PT} units`)} value={T(`${sec2(timeBase)} วิ`, `${sec2(timeBase)} s`)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <FormulaCard t={t} T={T} speed={d.speed} add={d.add} speedGear={d.speedGear} tBase={timeBase} tGear={timeGear} />

        <EquipSetCard t={t} T={T} names={GEARS.map((_, i) => gearName(i))} perGear={d.perGear} add={d.add} slots={slots} speed={d.speed} speedGear={d.speedGear} />

        <Banner t={t} start={TL.count - 0.4} end={R.go + 0.9} title={T(`แข่งเดิน ${DIST_PT} หน่วยระยะ`, `${DIST_PT}-unit walking race`)}
          sub={T('จาก START ถึง FINISH · จับเวลา', 'START to FINISH · timed')} color={BANNER_COLOR.normalGear} />
        {countOn && (
          <div className="absolute left-1/2 top-[300px] -translate-x-1/2 -translate-y-1/2 font-black text-white pointer-events-none"
            style={{ ...STROKE, WebkitTextStroke: '12px #0b0d18', fontSize: beat < 3 ? 150 : 120, color: beat < 3 ? '#fff' : '#fcd34d',
              transform: `translate(-50%, -50%) scale(${1.35 - 0.35 * easeOutBack(Math.min(1, beatT / 0.3))})`, opacity: beat < 3 ? 1 : 1 - prog(t, beats[3] + 0.45, beats[3] + 0.7) }}>
            {countTxt}
          </div>
        )}
        {laneUi}
        {board.on && (
          <div className="absolute right-[22px] top-[22px] rounded-2xl bg-black/70 border-2 border-white/15 px-5 py-3 space-y-1" style={{ opacity: board.alpha }}>
            {LANES.map((L, i) => (
              <div key={L.id} className="flex items-center gap-3">
                <span className={`material-icons-round text-[28px] ${done[i] ? 'text-amber-300' : 'text-white/70'}`}>{done[i] ? 'flag' : 'timer'}</span>
                <span className={`text-[20px] font-bold w-[180px] ${i ? 'text-amber-200' : 'text-gray-200'}`}>
                  <Fit1>{i ? `Move Speed ${addTxt}` : T('ไม่ใส่เกียร์', 'No gear')}</Fit1>
                </span>
                <span className={`text-[32px] font-black tabular-nums w-[118px] text-right ${done[i] ? 'text-amber-300' : 'text-white'}`}>{sec2(elapsed[i])}</span>
                <span className="text-[20px] font-bold text-gray-400">{T('วิ', 's')}</span>
              </div>
            ))}
            {fast && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-400 text-[20px] font-black text-[#1a1200]">▶▶ ×{FAST_RATE}</span>
              </div>
            )}
          </div>
        )}

        <SummaryShell t={t} T={T} start={S} end={R.summary[1]} top={-330}
          title={T(`เดิน ${DIST_PT} หน่วยระยะใช้เวลาเท่าไหร่`, `Time to walk ${DIST_PT} range units`)}>
          {LANES.map((L, i) => (
            <div key={L.id} className="mt-4" style={{ opacity: easeOut(prog(t, S + 0.5 + i * 0.5 - 0.2, S + 0.5 + i * 0.5 + 0.2)) }}>
              <div className="flex justify-between items-baseline text-[26px]">
                <Fit1 className="flex-1"><span className="text-gray-200 font-bold">
                  {i ? T(`ใส่ Move Speed ${addTxt} (เดิน ${d.speedGear})`, `Move Speed ${addTxt} (speed ${d.speedGear})`) : T(`ไม่ใส่เกียร์ (เดิน ${d.speed})`, `No gear (speed ${d.speed})`)}
                </span></Fit1>
                <span className={`shrink-0 ml-4 font-black tabular-nums ${i ? 'text-amber-300' : 'text-white'}`}>
                  {sec2(finals[i] * bar(S + 0.5 + i * 0.5))} <span className="text-[20px] text-gray-400">{T('วิ', 's')}</span>
                </span>
              </div>
              <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${i ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`}
                  style={{ width: `${(finals[i] / maxT) * 100 * bar(S + 0.5 + i * 0.5)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-5 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 1.9, R.summary[1], 0.5, 0.6))}>
            <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('เดินเร็วขึ้น', 'Walks faster')}</div>
              <div className="text-[52px] font-black text-amber-300 leading-none mt-1">×{(d.speedGear / Math.max(1, d.speed)).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-[#0b1f2a] border-2 border-sky-400/50 p-3 text-center">
              <div className="text-[22px] text-gray-300 font-bold">{T('ถึงก่อน', 'Arrives earlier by')}</div>
              <div className="text-[44px] font-black text-sky-300 leading-none mt-2 tabular-nums">{sec2(timeBase - timeGear)} {T('วิ', 's')}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance"
            style={{ opacity: easeOut(prog(t, S + 2.6, S + 3.0)) }}>
            {T(`Move Speed บวกค่าตรง ตัวที่เดินช้ายิ่งเห็นผลมาก: ${d.speed} → ${d.speedGear} (×${(d.speedGear / Math.max(1, d.speed)).toFixed(1)}) แต่ตัวที่เดิน 120 → ${120 + d.add} (×${((120 + d.add) / 120).toFixed(1)}) · ช่วยตอนเดินเข้าหาศัตรู ถึงระยะโจมตีไวขึ้น พอยืนยิงแล้วไม่มีผล`,
              `Move Speed is a flat bonus, so slow walkers gain the most: ${d.speed} → ${d.speedGear} (×${(d.speedGear / Math.max(1, d.speed)).toFixed(1)}), while a speed-120 ranger gets 120 → ${120 + d.add} (×${((120 + d.add) / 120).toFixed(1)}) · It only helps while walking toward enemies — once a ranger stops to attack, it does nothing`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">
            {T(`เกียร์ +${GEAR_LEVEL} · ชุด Move Speed สูงสุดในเกม ${addTxt} (ไม่ต้องตรงชนิด/ธาตุ)`, `Gear +${GEAR_LEVEL} · the highest Move Speed set in the game, ${addTxt} (works for any type/element)`)}
          </div>
        </SummaryShell>
      </>
    )
  }

  // ช่วงเร่ง: เดินไปได้ FAST_AFTER วิ → ตัวบน (ช้าสุด) ถึงเส้นชัย · เริ่มเดิน = TL.count + จังหวะ "เริ่ม" ของเสียงนับ (ตรงกับคิวเดินในฉาก)
  const goAt = TL.count + COUNT_BEATS[3]
  const fastEnd = goAt + timeOf(Math.min(d.speed, d.speedGear))
  const rateAt = (t: number) => (t >= goAt + FAST_AFTER && t < fastEnd ? FAST_RATE : 1)
  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} canvasLayers={MAP} rateAt={rateAt} />
}

/** แผนที่ตู้รถไฟ + ป้ายพื้น START / FINISH ทั้ง 2 เลน */
const MAP = spaceTrainLayers({ centerX: (START_X + FINISH_X) / 2, start: START_X, finish: FINISH_X })

/** การ์ดสูตร (TL.formula): เกมคิดความเร็วเดินยังไง */
function FormulaCard({ t, T, speed, add, speedGear, tBase, tGear }: {
  t: number; T: (th: string, en: string) => string; speed: number; add: number; speedGear: number; tBase: number; tGear: number
}) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  return (
    <FitCard className="left-1/2 top-[30px] w-[900px] -ml-[450px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมคิดความเร็วเดินแบบนี้', 'How the game sets walking speed')}</span></Fit1>

      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[34px] font-black text-white">
          {T('ความเร็วเดิน', 'Speed')} = {T('ความเร็วเดิม', 'base speed')} + Move Speed {T('จากเกียร์', 'from gear')}
        </span></Fit1>
        <div className="mt-1 text-center text-[20px] font-bold text-gray-300 text-balance">
          {T('Move Speed เป็นค่าบวกตรง ไม่ใช่ % · Basic ทุกชิ้นบวกกัน · Switchable Move Speed (+15) นับตัวสูงสุดตัวเดียว',
            'Move Speed is a flat bonus, not a % · Basic effects all add up · Switchable Move Speed (+15) only counts once')}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-[#2a1f08] border-2 border-amber-400/40 px-5 py-3 text-center" style={step(t, a + 1.4)}>
        <Fit1><span className="text-[40px] font-black text-white tabular-nums">
          {speed} + {add} = <span className="text-amber-300">{speedGear}</span>
          <span className="text-[22px] font-bold text-gray-400"> {T('หน่วยระยะ/วินาที', 'range units / s')}</span>
        </span></Fit1>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 2.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3">
          <div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <Fit1><span className="text-[24px] font-bold text-gray-200 tabular-nums">{DIST_PT} ÷ {speed}</span></Fit1>
          <div className="text-[40px] font-black text-white tabular-nums leading-tight">{sec2(tBase)} {T('วิ', 's')}</div>
        </div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3">
          <div className="text-[20px] font-bold text-amber-200">Move Speed +{add}</div>
          <Fit1><span className="text-[24px] font-bold text-gray-200 tabular-nums">{DIST_PT} ÷ {speedGear}</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 tabular-nums leading-tight">{sec2(tGear)} {T('วิ', 's')}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[21px] font-black text-sky-300 text-balance" style={step(t, a + 3.4)}>
        {T(`เวลาเดิน = ระยะ ÷ ความเร็ว · แข่งเดิน ${DIST_PT} หน่วยระยะ`, `Walk time = distance ÷ speed · race over ${DIST_PT} range units`)}
      </div>
    </FitCard>
  )
}

/** ตัวล่างใส่ชุด Move Speed (TL.equip) — 3 ชิ้น + ผลรวม + ช่องเกียร์เต็ม */
function EquipSetCard({ t, T, names, perGear, add, slots, speed, speedGear }: {
  t: number; T: (th: string, en: string) => string; names: string[]; perGear: number[]; add: number
  slots: Partial<Record<GearKind, SlotGear>>; speed: number; speedGear: number
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
            <span className="shrink-0 text-[24px] font-black text-amber-300 tabular-nums">+{Math.round(perGear[i])}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between">
        <span className="text-[24px] font-bold text-gray-300">Move Speed {T('รวม', 'total')}</span>
        <span className="text-[44px] font-black text-amber-300 leading-none" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>+{add}</span>
      </div>
      <div className="mt-1 text-right text-[22px] font-bold text-gray-300 tabular-nums">
        {T('ความเร็วเดิน', 'Move speed')} {speed} → <span className="text-amber-300 font-black">{speedGear}</span>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} filled={t >= at ? slots : undefined} />
      </div>
    </FitCard>
  )
}
