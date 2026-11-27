'use client'

// ====================================================
// วิดีโอสอน: ค่าใช้จ่ายการผลิตแร่ (mineral-cost) / ระยะเวลาที่สร้างเรนเจอร์ใหม่ (regen-time)
//   ตู้รถไฟอวกาศ 2 เลน (แบบ atk-speed) — บน = ไม่ใส่เกียร์ · ล่าง = ใส่เกียร์ · แต่ละเลนมีป้อมของตัวเองเรียก Rock Legend Brown
//   แข่งกดเรียก 16 วินาที (เล่น ×2) กดทันทีที่ปุ่มพร้อม (แร่พอเสมอ):
//     regen-time   → นับจำนวนตัวที่ปล่อย (บนทุก 4 วิ · ล่างทุก 1.73 วิ)
//     mineral-cost → เวลาเกิดใหม่เท่ากัน ปล่อยเท่ากัน → นับแร่ที่ใช้ผลิต
//   ปุ่มเรียกเรนเจอร์วาดแบบเดียวกับเกม (./summonButton.tsx — ดาว · ค่าแร่ · แถบเวลารอ · มืดตอนรอ · ธาตุ · ไอคอนเกียร์)
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-summon-scene.cjs (TL / LANES ต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   แร่ (SUMMON_ENGY_MUL 0x14): รวมแบบคูณ r = Π(1 − |Basic|) × (1 − |Switchable สูงสุดที่ตรงเงื่อนไข|) (0x111da60)
//     ค่าแร่ใหม่ = max(ขั้นต่ำ UNIT_MIN_SUMMON_ENERGY 1, ตัดเศษ(ค่าแร่ + (r − 1) × ค่าแร่)) (0x1124e78 + 0xd5e054)
//   เวลาเกิดใหม่ (PRD_SPE_MUL 0x15): รวมแบบบวก r (ค่าติดลบ) · T' = T + r × T × (1 − X) (0x1124f0c)
//     เวลาที่ใช้จริง = max(UNIT_PRODUCTION_SPEED_MIN_LIMIT 1.3, T' × (1 − X)) (UI 0x132f114)
//     X = unit_level_expansion.productionSpeedDecreaseRate (ชนิดวิวัฒน์ · จำนวนขั้นเกินเลเวลตัน — 0xe644f8)
//   ปุ่ม: กดเรียกแล้วนับเวลารอจาก 0 (0xc87dd8) · พร้อมเมื่อ ≥ เวลาเกิดใหม่ (0xc87ecc)
//   เกียร์ +5 = นับเฉพาะ Basic
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { apiFetch } from '@/lib/staticApi'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  equipSlots, gearIconUrl, loadGear, loadStats, step, useTutorialData, type GearKind, type SlotGear,
} from './kit'
import { spaceTrainLayers } from './spaceTrain'
import { SummonButton, type SummonUnit } from './summonButton'

export type SummonMode = 'mineral-cost' | 'regen-time'
type Tr = (th: string, en: string) => string
const RANGER = 'u1260e-brown'
const SIZE_RATIO = 1            // unit.sizeRatio ของ u1260e-brown
const f = Math.fround
/** เวลาในวิดีโอ — race ต้องตรงกับ build-summon-scene.cjs */
const TL = { ranger: [8.0, 12.2], formula: [12.6, 18.0], equipAt: 19.4, race: [21, 37], summary: [38.6, 46] } as const
const END = 46
const RACE_RATE = 2
const X_RATE = 0.5             // ลิมิตเบรก 4 ขั้น (unit_level_expansion evolution 4 → 0.5)
const MIN_REGEN = 1.3
/** แผนที่ตู้รถไฟ: กลางหน้าต่างตรงกลางจอ */
const spaceTrain = spaceTrainLayers({ centerX: 640 })

interface GearDef { code: string; kind: GearKind; grade: number; en: string }
const MODES: Record<SummonMode, { type: string; nameKey: string; title: [string, string]; gears: GearDef[] }> = {
  'mineral-cost': {
    type: 'SUMMON_ENGY_MUL', nameKey: 'GEAR_ATTR_SUMMON_ENGY_MUL_nm', title: ['ค่าใช้จ่ายการผลิตแร่', 'Mineral Production cost'],
    // ไม่มีอาวุธชิ้นไหนลดค่าแร่ใน Basic
    gears: [
      { code: 'eq_acc_evt_046', kind: 'acc', grade: 6, en: "Thunder Brown's Cape" },
      { code: 'eq_amr_0046', kind: 'armor', grade: 6, en: 'Cloud Wing Shoes' },
    ],
  },
  'regen-time': {
    type: 'PRD_SPE_MUL', nameKey: 'GEAR_ATTR_PRD_SPE_MUL_nm', title: ['ระยะเวลาที่สร้างเรนเจอร์ใหม่', 'Ranger Regeneration Time'],
    gears: [
      { code: 'eq_wpn_0106', kind: 'weapon', grade: 6, en: 'Glorious Magic Wand' },
      { code: 'eq_amr_0006', kind: 'armor', grade: 6, en: 'Heart Crown' },
      { code: 'eq_acc_0016', kind: 'acc', grade: 6, en: 'Guardian Medal' },
    ],
  },
}

async function loadData(mode: SummonMode) {
  const m = MODES[mode]
  const [r, faces, ...gs] = await Promise.all([
    loadStats(RANGER),
    apiFetch('/api/ranger-faces').then(x => x.json() as Promise<Record<string, [number, number]>>).catch(() => ({} as Record<string, [number, number]>)),
    ...m.gears.map(g => loadGear(g.code)),
  ])
  const gears = gs.map(x => x.gear as GearEffects)
  const per = gears.map(g => g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0))
  const raw = r as typeof r & { mineral?: number; grade?: number; growth?: { productionSpeed?: number } }
  const cost = raw.mineral ?? 0
  const prod = raw.growth?.productionSpeed ?? 0   // productionSpeed ของเกม (วิ)
  // แร่: คูณกัน
  const mul = per.reduce((p, v) => f(p * f(1 - Math.abs(v))), 1)
  const costAfter = Math.max(1, Math.trunc(f(f(f(mul - 1) * cost) + cost)))
  // เวลาเกิดใหม่: บวกกัน
  const sum = per.reduce((s, v) => s + v, 0)
  const tAfter = f(prod + f(f(f(sum * prod)) * f(1 - X_RATE)))
  const regenBefore = Math.max(MIN_REGEN, f(prod * (1 - X_RATE)))
  const regenAfter = Math.max(MIN_REGEN, f(tAfter * (1 - X_RATE)))
  const unit: SummonUnit = { grade: raw.grade ?? 9, element: r.element, imageUrl: r.imageUrl, face: faces[RANGER] ?? null, sizeRatio: SIZE_RATIO }
  return { r, unit, gears, per, cost, costAfter, mul, sum, prod, tAfter, regenBefore, regenAfter }
}
type Data = Awaited<ReturnType<typeof loadData>>
const pc = (v: number) => { const x = Math.abs(v) * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }
const sec = (v: number) => `${(Math.round(v * 100) / 100).toString()}`
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** จังหวะกดเรียกของเลน (ตรงกับ spawnsOf ใน build-summon-scene.cjs) */
function spawnsOf(regen: number): number[] {
  const out: number[] = []
  for (let k = 0; ; k++) {
    const t = TL.race[0] + k * regen
    if (t >= TL.race[1] - 1e-6) break
    out.push(+t.toFixed(4))
  }
  return out
}
const COUNT_STROKE: React.CSSProperties = { WebkitTextStroke: '8px #0b0d18', paintOrder: 'stroke fill', textShadow: '0 4px 10px rgba(0,0,0,0.55)' }

export default function SummonTutorial({ autoPlay, mode }: { autoPlay: boolean; mode: SummonMode }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(() => loadData(mode))
  if (!d) return <LoadBox err={err} T={T} />

  const m = MODES[mode]
  const mineral = mode === 'mineral-cost'
  const optName = tr('equip', m.nameKey, T(m.title[0], m.title[1]))
  const gearName = (i: number) => tGear(m.gears[i].code, m.gears[i].en)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const rangerName = tRanger(RANGER, 'Rock Legend Brown')
  const tested = d.gears[0].basic.map((e, i) => (e.basicGrowth?.reinforceType === m.type ? i : -1)).filter(i => i >= 0)
  const totalTxt = mineral ? `×${(Math.round(d.mul * 1000) / 1000)}` : `−${pc(d.sum)}`
  const slots = Object.fromEntries(m.gears.map(g => [g.kind, { icon: gearIconUrl(g.code), grade: g.grade }])) as Partial<Record<GearKind, SlotGear>>
  const raceLen = TL.race[1] - TL.race[0]
  // เลนบน = ไม่ใส่เกียร์ · เลนล่าง = ใส่เกียร์
  const lanes = [
    { gear: false, regen: d.regenBefore, cost: d.cost },
    { gear: true, regen: mineral ? d.regenBefore : d.regenAfter, cost: mineral ? d.costAfter : d.cost },
  ].map(L => ({ ...L, spawns: spawnsOf(L.regen) }))
  const finals = lanes.map(L => L.spawns.length)
  const used = lanes.map(L => L.spawns.length * L.cost)

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const hud = span(t, TL.race[0] - 0.6, TL.summary[0] + 0.2, 0.4, 0.4)
    const raceT = Math.min(raceLen, Math.max(0, t - TL.race[0]))
    const timer = span(t, TL.race[0] - 0.3, TL.race[1] + 1.2, 0.3, 0.4)
    const S = TL.summary[0]
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const maxV = Math.max(1, ...(mineral ? used : finals))
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gears[0]} icon={gearIconUrl(m.gears[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={m.gears[0].kind} grade={m.gears[0].grade} tested={tested} />

        <RangerCard T={T} r={d.r} name={rangerName} s={span(t, TL.ranger[0], TL.ranger[1])} x={680} y={24}
          tag={T('เรนเจอร์ที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={T('ค่าแร่ต่อการเรียก 1 ตัว', 'Mineral cost per summon')} value={fmt(d.cost)} hlAt={mineral ? 8.75 : undefined} dim={!mineral} />
            <StatRow t={t} label={T('เวลาเกิดใหม่', 'Regeneration time')} value={T(`${sec(d.regenBefore)} วิ`, `${sec(d.regenBefore)} s`)} hlAt={mineral ? undefined : 8.75} dim={mineral}
              note={T(`พื้นฐาน ${sec(d.prod)} วิ × (1 − ${pc(X_RATE)} ลิมิตเบรก 4 ขั้น)`, `Base ${sec(d.prod)} s × (1 − ${pc(X_RATE)} from 4 limit breaks)`)} />
          </>}
          slots={<GearSlots t={t} />} />

        <SummonFormulaCard t={t} T={T} d={d} mineral={mineral} optName={optName} totalTxt={totalTxt} />
        <SummonSetCard t={t} T={T} names={m.gears.map((_, i) => gearName(i))} codes={m.gears.map(g => g.code)} per={d.per} optName={optName} totalTxt={totalTxt} slots={slots} mineral={mineral} />

        <Banner t={t} start={TL.race[0] - 0.4} end={TL.race[0] + 1.6} title={T(`แข่งกดเรียก ${raceLen} วินาที`, `${raceLen}-second summon race`)}
          sub={T(`เล่นเร็ว ×${RACE_RATE} · กดทันทีที่ปุ่มพร้อม (แร่พอเสมอ)`, `Played at ×${RACE_RATE} · tap as soon as the button is ready (plenty of minerals)`)} color={BANNER_COLOR.normalGear} />

        {/* แถบล่าง: ปุ่มเรียกแบบในเกม + ตัวนับของแต่ละเลน */}
        {hud.on && (
          <div className="absolute left-0 right-0 flex justify-center gap-6 px-6" style={{ top: 548, height: 164, opacity: hud.alpha }}>
            {lanes.map((L, i) => {
              const done = L.spawns.filter(s => t >= s)
              const last = done.length ? done[done.length - 1] : null
              const el = last != null ? t - last : Infinity
              const cool = el < L.regen ? el / L.regen : null
              const n = done.length
              const bump = last != null ? 1 - prog(t, last, last + 0.25) : 0
              return (
                <div key={i} className={`relative flex-1 rounded-2xl border-2 ${L.gear ? 'border-amber-400/60' : 'border-white/15'}`} style={{ maxWidth: 600, background: L.gear ? 'rgba(42,31,8,0.9)' : 'rgba(0,0,0,0.7)' }}>
                  <SummonButton unit={d.unit} cost={L.cost} cool={cool} gear={L.gear && t >= TL.equipAt} x={84} y={150} scale={1.05} />
                  <div className="absolute" style={{ left: 164, right: 16, top: 12 }}>
                    <Fit1><span className={`text-[22px] font-black ${L.gear ? 'text-amber-200' : 'text-gray-200'}`}>
                      {i ? T('เลนล่าง', 'Bottom lane') : T('เลนบน', 'Top lane')} · {L.gear ? `${optName} ${totalTxt}` : T('ไม่ใส่เกียร์', 'No gear')}
                    </span></Fit1>
                    <div className="text-[18px] font-bold text-gray-300 tabular-nums">
                      {mineral ? T(`ตัวละ ${fmt(L.cost)} แร่ · เกิดใหม่ทุก ${sec(L.regen)} วิ`, `${fmt(L.cost)} minerals each · every ${sec(L.regen)} s`)
                        : T(`เกิดใหม่ทุก ${sec(L.regen)} วิ`, `Regenerates every ${sec(L.regen)} s`)}
                    </div>
                    <div className="mt-1 flex items-baseline gap-5">
                      <div className="flex items-baseline gap-2">
                        <span className={`inline-block font-black tabular-nums leading-none ${L.gear ? 'text-amber-300' : 'text-white'}`}
                          style={{ ...COUNT_STROKE, fontSize: mineral ? 44 : 64, transform: `scale(${1 + 0.25 * bump})`, transformOrigin: 'left bottom' }}>{n}</span>
                        <span className="text-[22px] font-black text-white" style={COUNT_STROKE}>{T('ตัว', 'summoned')}</span>
                      </div>
                      {mineral && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-[20px] font-bold text-gray-300">{T('ใช้แร่', 'Used')}</span>
                          <span className={`font-black tabular-nums leading-none ${L.gear ? 'text-amber-300' : 'text-white'}`} style={{ ...COUNT_STROKE, fontSize: 52 }}>{fmt(n * L.cost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {timer.on && t > TL.race[0] + 1.6 && (
          <div className="absolute left-1/2 top-[22px] -translate-x-1/2 flex items-center gap-3 px-6 py-2 rounded-2xl bg-black/70 border-2 border-white/15" style={{ opacity: timer.alpha }}>
            <span className="material-icons-round text-[34px] text-amber-300">timer</span>
            <span className="text-[34px] font-black text-white tabular-nums">{raceT.toFixed(1)}<span className="text-white/60"> / {raceLen.toFixed(1)}</span></span>
            <span className="ml-1 px-2.5 py-0.5 rounded-lg bg-amber-400 text-[22px] font-black text-[#1a1200]">▶▶ ×{RACE_RATE}</span>
          </div>
        )}

        <SummaryShell t={t} T={T} start={S} end={END} top={-330}
          title={mineral ? T(`ใช้แร่เท่าไรใน ${raceLen} วินาที`, `Minerals spent in ${raceLen} seconds`) : T(`เรียกได้กี่ตัวใน ${raceLen} วินาที`, `Summons in ${raceLen} seconds`)}>
          {lanes.map((L, i) => {
            const a = S + 0.5 + i * 0.5
            const v = mineral ? used[i] : finals[i]
            return (
              <div key={i} className="mt-4" style={{ opacity: easeOut(prog(t, a - 0.2, a + 0.2)) }}>
                <div className="flex justify-between items-baseline text-[26px]">
                  <Fit1 className="flex-1"><span className="text-gray-200 font-bold">{L.gear ? `${optName} ${totalTxt}` : T('ไม่ใส่เกียร์', 'No gear')}</span></Fit1>
                  <span className={`shrink-0 ml-4 font-black tabular-nums ${L.gear ? 'text-amber-300' : 'text-white'}`}>
                    {mineral ? `${fmt(v * bar(a))} ` : `${Math.round(v * bar(a))} `}<span className="text-[20px] text-gray-400">{mineral ? T(`แร่ (${finals[i]} ตัว)`, `minerals (${finals[i]} summons)`) : T('ตัว', 'summons')}</span>
                  </span>
                </div>
                <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${L.gear ? 'from-amber-500 to-yellow-300' : 'from-slate-500 to-slate-300'}`} style={{ width: `${(v / maxV) * 100 * bar(a)}%` }} />
                </div>
              </div>
            )
          })}
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 1.8, S + 2.2)) }}>
            {mineral
              ? T(`ตัวละ ${fmt(d.cost)} → ${fmt(d.costAfter)} แร่ (ประหยัด ${fmt(d.cost - d.costAfter)} ต่อตัว) · หลายชิ้น "คูณกัน": ${m.gears.map((_, i) => `(1 − ${pc(d.per[i])})`).join(' × ')} = ${(Math.round(d.mul * 1000) / 1000)} · ตัดเศษ ต่ำสุด 1 · เวลาเกิดใหม่ไม่เปลี่ยน`,
                `${fmt(d.cost)} → ${fmt(d.costAfter)} minerals each (${fmt(d.cost - d.costAfter)} saved per summon) · pieces multiply: ${m.gears.map((_, i) => `(1 − ${pc(d.per[i])})`).join(' × ')} = ${(Math.round(d.mul * 1000) / 1000)} · rounded down, minimum 1 · regeneration time is unchanged`)
              : T(`เกิดใหม่ทุก ${sec(d.regenBefore)} → ${sec(d.regenAfter)} วิ · หลายชิ้นบวกกัน (${pc(d.sum)}) แต่คิดกับเวลาที่ลิมิตเบรกลดแล้ว: (${sec(d.prod)} − ${pc(d.sum)} × ${sec(d.prod)} × ${pc(1 - X_RATE)}) × ${pc(1 - X_RATE)} · ต่ำสุด ${MIN_REGEN} วิ · ค่าแร่ไม่เปลี่ยน`,
                `Every ${sec(d.regenBefore)} → ${sec(d.regenAfter)} s · pieces add up (${pc(d.sum)}) but apply on top of the limit-break cut: (${sec(d.prod)} − ${pc(d.sum)} × ${sec(d.prod)} × ${pc(1 - X_RATE)}) × ${pc(1 - X_RATE)} · minimum ${MIN_REGEN} s · mineral cost is unchanged`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · ${rangerName} Lv.180`, `Gear +${GEAR_LEVEL} (Basic only) · ${rangerName} Lv.180`)}</div>
        </SummaryShell>
      </>
    )
  }
  return (
    <ScenePlayer src={`/gear-options/scenes/${mode}.anme.json`} autoPlay={autoPlay} overlay={overlay} canvasLayers={spaceTrain}
      rateAt={t => (t >= TL.race[0] && t < TL.race[1] + 0.3 ? RACE_RATE : 1)} />
  )
}

function SummonFormulaCard({ t, T, d, mineral, optName, totalTxt }: { t: number; T: Tr; d: Data; mineral: boolean; optName: string; totalTxt: string }) {
  const s = span(t, TL.formula[0], TL.formula[1], 0.5, 0.4)
  if (!s.on) return null
  const a = TL.formula[0]
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{mineral ? T('เกมลดค่าแร่แบบนี้', 'How the game cuts the mineral cost') : T('เกมลดเวลาเกิดใหม่แบบนี้', 'How the game cuts the regeneration time')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[28px] font-black text-amber-200">
          {mineral ? T('ค่าแร่ = ค่าแร่เดิม × (1 − ชิ้นที่ 1) × (1 − ชิ้นที่ 2) …', 'Cost = base cost × (1 − piece 1) × (1 − piece 2) …')
            : T('เวลาเกิดใหม่ = (พื้นฐาน + พื้นฐาน × เกียร์รวม × (1 − ลิมิตเบรก)) × (1 − ลิมิตเบรก)', 'Regen = (base + base × gear total × (1 − limit break)) × (1 − limit break)')}
        </span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">
          {mineral ? T('ตัดเศษ · ต่ำสุด 1 แร่ · หลายชิ้นคูณกัน (ใส่หลายชิ้นจึงลดได้ไม่ถึง 100%)', 'Rounded down · minimum 1 · pieces multiply (so stacking never reaches 100%)')
            : T(`ต่ำสุด ${MIN_REGEN} วิ · หลายชิ้นบวกกัน · ลิมิตเบรกของตัวนี้ ${pc(X_RATE)}`, `Minimum ${MIN_REGEN} s · pieces add up · this ranger's limit-break cut is ${pc(X_RATE)}`)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{mineral ? fmt(d.cost) : T(`${sec(d.regenBefore)} วิ`, `${sec(d.regenBefore)} s`)}</div></div>
        <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 px-4 py-3"><div className="text-[20px] font-bold text-amber-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{mineral ? `${fmt(d.cost)} × ${(Math.round(d.mul * 1000) / 1000)}` : `${sec(d.tAfter)} × ${pc(1 - X_RATE)}`}</span></Fit1>
          <div className="text-[40px] font-black text-amber-300 leading-tight">{mineral ? fmt(d.costAfter) : T(`${sec(d.regenAfter)} วิ`, `${sec(d.regenAfter)} s`)}</div></div>
      </div>
    </FitCard>
  )
}

function SummonSetCard({ t, T, names, codes, per, optName, totalTxt, slots, mineral }: {
  t: number; T: Tr; names: string[]; codes: string[]; per: number[]; optName: string; totalTxt: string; slots: Partial<Record<GearKind, SlotGear>>; mineral: boolean
}) {
  const at = TL.equipAt
  const s = span(t, at - 0.9, TL.race[0] - 0.3, 0.4, 0.35)
  if (!s.on) return null
  return (
    <FitCard className="w-[580px] p-6" style={{ left: 680, top: 34, ...popStyle(s) }}>
      <div className="text-[20px] font-bold text-gray-400">{t >= at ? T('เลนล่างใส่เกียร์แล้ว', 'Bottom lane equipped') : T('เลนล่างกำลังใส่เกียร์', 'Bottom lane equipping')}</div>
      <div className="mt-2 space-y-2">
        {names.map((n, i) => (
          <div key={n} className="flex items-center gap-3" style={step(t, at - 0.75 + i * 0.12)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gearIconUrl(codes[i])} alt="" crossOrigin="anonymous" className="w-12 h-12 shrink-0 object-contain" />
            <Fit1 className="flex-1"><span className="text-[23px] font-bold text-white">{n} +{GEAR_LEVEL}</span></Fit1>
            <span className="shrink-0 text-[22px] font-black text-amber-300 tabular-nums">−{pc(per[i])}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10 flex items-baseline justify-between gap-3">
        <Fit1 className="flex-1"><span className="text-[22px] font-bold text-gray-300">{optName} {mineral ? T('(คูณกัน)', '(multiplied)') : T('(รวม)', '(total)')}</span></Fit1>
        <span className="text-[40px] font-black text-amber-300 leading-none shrink-0" style={{ transform: `scale(${t >= at ? 1 + 0.12 * (1 - prog(t, at, at + 0.4)) : 1})` }}>{totalTxt}</span>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-white/10" style={{ opacity: t >= at ? easeOutBack(prog(t, at, at + 0.4)) : 0.35 }}>
        <GearSlots t={t} equip={equipSlots(slots, at)} />
      </div>
    </FitCard>
  )
}

export const MineralCostTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SummonTutorial autoPlay={autoPlay} mode="mineral-cost" />
export const RegenTimeTutorial = ({ autoPlay }: { autoPlay: boolean }) => <SummonTutorial autoPlay={autoPlay} mode="regen-time" />
