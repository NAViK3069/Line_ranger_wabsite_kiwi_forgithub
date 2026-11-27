'use client'

// ====================================================
// วิดีโอสอน: ระยะโจมตี (Attack Range)
//   Foot Soldier Crush (u2018e-crush · ซ้าย · สายว่องไว AGI · ระยะ 100 pt · ตีปกติยิงกระสุน WEAPON) เดินเข้าหา Rock Legend Brown (ขวา ยืนนิ่ง) แล้วยิงเมื่อเข้าระยะ
//   รอบ A ไม่ใส่เกียร์ (หยุดที่ x 730) · รอบ B ใส่ 3 ชิ้น ระยะ +108.6% → 208 pt (หยุดที่ x 514 — ยิงจากไกลกว่าเดิม)
//   ฉาก: public/gear-options/scenes/atk-range.anme.json ← scripts/gear-options/build-range-scene.cjs (ค่าคงที่ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ ATK_RNGE_MUL (0x16): Basic ทุกชิ้นบวกกัน · โบนัส = ตัดเศษ(ระยะ × ค่ารวม) (0x1124fb4 · fcvtzu) บวกเข้า attackRange (UnitData 0x160)
//   หาเป้า (UnitNode 0xcd6f90 · ช่วยคำนวณ 0xce29f0): ช่องตรวจจับ = [x ของเรา, x + ระยะ × (1 + บัฟ)] · สูง 320
//     กรอบเป้า (0xccd030) = [x − กว้าง/2, x + กว้าง/2] (กว้าง = กรอบเวที .sam ÷ 2 pt) → สองช่องทับกัน = ในระยะ → หยุดเดิน ตี
//   1 pt = 2 พิกเซลไฟล์ · เกียร์ +5 = นับเฉพาะ Basic
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  equipSlots, gearIconUrl, loadGear, loadStats, step, useTutorialData, type GearKind, type SlotGear,
} from './kit'

type Tr = (th: string, en: string) => string
const WALKER = 'u2018e-crush', TARGET = 'u1260e-brown'
/** ตรงกับ build-range-scene.cjs */
const TARGET_X = 1000, TARGET_HALF_W = 70
const GO_A = 19.6, GO_B = 30.9, EQUIP_AT = 27.8, SUMMARY = 37.4, END = 45
interface GearDef { code: string; kind: GearKind; grade: number; en: string }
const GEARS: GearDef[] = [
  { code: 'eq_wpn_evt_046', kind: 'weapon', grade: 6, en: "Thunder Brown's Glove" },
  { code: 'eq_rg_amr_16', kind: 'armor', grade: 6, en: '[RG] Yakuza Training Gear' },
  { code: 'eq_acc_26co', kind: 'acc', grade: 6, en: '[Kid] Monocle' },
]
const TYPE = 'ATK_RNGE_MUL'

async function loadData() {
  const [w, tg, ...gs] = await Promise.all([loadStats(WALKER), loadStats(TARGET), ...GEARS.map(g => loadGear(g.code))])
  const gears = gs.map(x => x.gear as GearEffects)
  const per = gears.map(g => g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === TYPE ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0))
  const total = per.reduce((s, v) => s + v, 0)
  const raw = w as typeof w & { attackRange?: number; movingSpeed?: number }
  const range = raw.attackRange ?? 0
  const bonus = Math.trunc(Math.fround(range * Math.fround(total)))
  return { w, tg, gears, per, total, range, bonus, rangeAfter: range + bonus, speed: raw.movingSpeed ?? 0 }
}
type Data = Awaited<ReturnType<typeof loadData>>
const pc = (v: number) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }

export default function AtkRangeTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const optName = tr('equip', 'GEAR_ATTR_ATK_RNGE_MUL_nm', T('ระยะโจมตี', 'Attack Range'))
  const gearName = (i: number) => tGear(GEARS[i].code, GEARS[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const wName = tRanger(WALKER, 'Foot Soldier Crush'), tName = tRanger(TARGET, 'Rock Legend Brown')
  const tested = d.gears[0].basic.map((e, i) => (e.basicGrowth?.reinforceType === TYPE ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pc(d.total)}`
  const slots = Object.fromEntries(GEARS.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const after = t >= EQUIP_AT
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gears[0]} icon={gearIconUrl(GEARS[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={GEARS[0].kind} grade={GEARS[0].grade} tested={tested} />

        <RangerCard T={T} r={d.w} name={wName} s={span(t, 8.0, 12.2)} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์ · สายว่องไว ยิงกระสุน', 'Gear wearer · agility, shoots')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={T('ระยะโจมตี', 'Attack range')} value={`${d.range}`} hlAt={8.75} note={T('หน่วยในเกม (1 = 2 พิกเซล) · เดินเข้าไปจนเป้าเข้าระยะแล้วค่อยยิง', 'Game units (1 = 2 px) · walks up until the target is in range, then shoots')} />
            <StatRow t={t} label={T('ความเร็วเดิน', 'Move speed')} value={`${d.speed}`} dim />
          </>}
          slots={<GearSlots t={t} />} />

        <RangeFormulaCard t={t} T={T} d={d} optName={optName} totalTxt={totalTxt} />

        <Banner t={t} start={GO_A - 0.8} end={GO_A + 3.4} title={T('ยังไม่ใส่เกียร์', 'No gear')} sub={T(`ระยะ ${d.range} → เดินเข้าไปใกล้`, `Range ${d.range} → walks in close`)} color={BANNER_COLOR.normalNoGear} />
        <Banner t={t} start={GO_B - 0.8} end={GO_B + 3.4} title={T(`ใส่เกียร์ · ${optName} ${totalTxt}`, `With gear · ${optName} ${totalTxt}`)} sub={T(`ระยะ ${d.range} + ${d.bonus} = ${d.rangeAfter} → ยิงจากไกลขึ้น`, `Range ${d.range} + ${d.bonus} = ${d.rangeAfter} → shoots from farther`)} color={BANNER_COLOR.normalGear} />

        <RangeBand c={c} t={t} T={T} actor={after ? 'walker_b' : 'walker_a'} rangePt={after ? d.rangeAfter : d.range}
          from={after ? GO_B - 1.2 : GO_A - 1.2} to={after ? SUMMARY - 0.3 : EQUIP_AT - 1.6} />

        <RangeSetCard t={t} T={T} names={GEARS.map((_, i) => gearName(i))} per={d.per} optName={optName} totalTxt={totalTxt} slots={slots} />

        <SummaryShell t={t} T={T} start={SUMMARY} end={END} top={-320} title={T(`${optName} — ${wName}`, `${optName} — ${wName}`)}>
          <div className="mt-3 grid grid-cols-2 gap-4" style={popStyle(span(t, SUMMARY + 0.5, END, 0.5, 0.6))}>
            {[false, true].map(g => (
              <div key={String(g)} className={`rounded-2xl border-2 p-3 text-center ${g ? 'bg-[#2a1f08] border-amber-400/50' : 'bg-white/[0.05] border-white/10'}`}>
                <div className="text-[20px] text-gray-300 font-bold">{g ? `${optName} ${totalTxt}` : T('ไม่ใส่เกียร์', 'No gear')}</div>
                <div className={`text-[40px] font-black tabular-nums leading-tight ${g ? 'text-amber-300' : 'text-white'}`}>{g ? d.rangeAfter : d.range}</div>
                <div className="text-[19px] font-bold text-gray-400">{T(`หยุดยิงห่างเป้า ${g ? d.rangeAfter : d.range} หน่วย`, `Stops ${g ? d.rangeAfter : d.range} units from the target`)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, SUMMARY + 1.4, SUMMARY + 1.8)) }}>
            {T(`ระยะใหม่ = ${d.range} + ตัดเศษ(${d.range} × ${pc(d.total)}) = ${d.rangeAfter} · หลายชิ้นบวกกัน · เกมนับว่า "ในระยะ" เมื่อช่องตรวจจับข้างหน้าแตะขอบตัวเป้า · ตีปกติและหาเป้าของสกิลใช้ระยะเดียวกัน`,
              `New range = ${d.range} + floor(${d.range} × ${pc(d.total)}) = ${d.rangeAfter} · pieces add up · the game counts "in range" once the detection band in front touches the target's edge · normal attacks and skill targeting use the same range`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · เป้า ${tName}`, `Gear +${GEAR_LEVEL} (Basic only) · target ${tName}`)}</div>
        </SummaryShell>
      </>
    )
  }
  return <ScenePlayer src="/gear-options/scenes/atk-range.anme.json" autoPlay={autoPlay} overlay={overlay} />
}

/** แถบช่องตรวจจับบนพื้น: จากตัวเราไปข้างหน้า "ระยะ × 2 px" · เส้นขอบกรอบเป้า · เข้าระยะแล้วแถบเปลี่ยนเป็นสีทอง */
function RangeBand({ c, t, T, actor, rangePt, from, to }: { c: OverlayCtx; t: number; T: Tr; actor: string; rangePt: number; from: number; to: number }) {
  const s = span(t, from, to, 0.4, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(actor)
  if (!pos) return null
  const x0 = pos.x, x1 = pos.x + rangePt * 2
  const edge = TARGET_X - TARGET_HALF_W
  const inRange = x1 >= edge - 0.5
  const a = c.project({ x: x0, y: pos.y + 8 }), b = c.project({ x: x1, y: pos.y + 8 })
  const e = c.project({ x: edge, y: pos.y + 8 }), top = c.project({ x: edge, y: pos.y - 230 })
  return (
    <div className="absolute inset-0" style={{ opacity: s.alpha }}>
      <div className="absolute rounded-full" style={{ left: a.x, top: a.y - 14, width: Math.max(0, b.x - a.x), height: 28,
        background: inRange ? 'linear-gradient(90deg, rgba(251,191,36,0.15), rgba(251,191,36,0.7))' : 'linear-gradient(90deg, rgba(56,189,248,0.12), rgba(56,189,248,0.6))',
        border: `3px solid ${inRange ? '#fde68a' : '#7dd3fc'}` }} />
      <div className="absolute px-3 py-1 rounded-lg bg-black/75 text-[20px] font-black whitespace-nowrap tabular-nums" style={{ left: (a.x + b.x) / 2, top: a.y + 18, transform: 'translateX(-50%)', color: inRange ? '#fde68a' : '#bae6fd' }}>
        {T('ระยะ', 'Range')} {rangePt}{inRange ? ` · ${T('เข้าระยะ! ยิง', 'in range! shoot')}` : ''}
      </div>
      <div className="absolute border-l-[3px] border-dashed border-rose-300/90" style={{ left: e.x, top: top.y, height: e.y - top.y + 14 }} />
      <div className="absolute px-2 py-0.5 rounded bg-rose-900/80 text-[16px] font-bold text-rose-100 whitespace-nowrap" style={{ left: e.x, top: top.y - 30, transform: 'translateX(-50%)' }}>{T('ขอบตัวเป้า', "Target's edge")}</div>
    </div>
  )
}

function RangeFormulaCard({ t, T, d, optName, totalTxt }: { t: number; T: Tr; d: Data; optName: string; totalTxt: string }) {
  const s = span(t, 12.6, 18.8, 0.5, 0.4)
  if (!s.on) return null
  const a = 12.6
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('เกมคิดระยะโจมตีแบบนี้', 'How the game handles attack range')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-amber-200">{T('ระยะใหม่', 'New range')} = {T('ระยะ', 'range')} + {T('ตัดเศษ', 'floor')}({T('ระยะ', 'range')} × {optName})</span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">{T('เดินจนช่องตรวจจับข้างหน้า (ยาวเท่าระยะ) แตะขอบตัวเป้า แล้วหยุดยิง · ระยะไกลขึ้น = หยุดยิงได้ไกลกว่า', 'Walks until the detection band in front (as long as the range) touches the target, then stops to attack · longer range = attacks from farther')}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{d.range}</div></div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3"><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{d.range} + {T('ตัดเศษ', 'floor')}({d.range} × {pc(d.total)}) = {d.range} + {d.bonus}</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 leading-tight">{d.rangeAfter}</div></div>
      </div>
    </FitCard>
  )
}

function RangeSetCard({ t, T, names, per, optName, totalTxt, slots }: { t: number; T: Tr; names: string[]; per: number[]; optName: string; totalTxt: string; slots: Partial<Record<GearKind, SlotGear>> }) {
  const at = EQUIP_AT
  const s = span(t, at - 0.9, at + 2.4, 0.4, 0.35)
  if (!s.on) return null
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, at - 0.75 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(GEARS[i].code)} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n} +{GEAR_LEVEL}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">+{pc(per[i])}</span>
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

