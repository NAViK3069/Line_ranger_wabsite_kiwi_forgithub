'use client'

// ====================================================
// วิดีโอสอน: ค่าใช้จ่ายการผลิตแร่ (mineral-cost) / ระยะเวลาที่สร้างเรนเจอร์ใหม่ (regen-time)
//   ปุ่มเรียกเรนเจอร์จากไฟล์เกม (battle_ui.plist): 9★ = battle_btn_bottom_cha_bg_06 + frame06 (เลือกตามชนิด/ดาว — 0xc868cc)
//   Rock Legend Brown Lv.180 — แร่ 1,800 · productionSpeed 8 วิ · ลิมิตเบรก 4 ขั้น → X = 0.5 → เกิดใหม่ทุก 4 วิ
//   ฉาก: public/gear-options/scenes/<mode>.anme.json ← scripts/gear-options/build-summon-scene.cjs (เวลา/จังหวะเรียกต้องตรงกัน)
//
// กฎของเกม (ถอดจาก libgame.so):
//   แร่ (SUMMON_ENGY_MUL 0x14): รวมแบบคูณ r = Π(1 − |Basic|) × (1 − |Switchable สูงสุดที่ตรงเงื่อนไข|) (0x111da60)
//     ค่าแร่ใหม่ = max(ขั้นต่ำ UNIT_MIN_SUMMON_ENERGY 1, ตัดเศษ(ค่าแร่ + (r − 1) × ค่าแร่)) (0x1124e78 + 0xd5e054)
//   เวลาเกิดใหม่ (PRD_SPE_MUL 0x15): รวมแบบบวก r (ค่าติดลบ) · T' = T + r × T × (1 − X) (0x1124f0c)
//     เวลาที่ใช้จริง = max(UNIT_PRODUCTION_SPEED_MIN_LIMIT 1.3, T' × (1 − X)) (UI 0x132f114)
//     X = unit_level_expansion.productionSpeedDecreaseRate (ชนิดวิวัฒน์ · จำนวนขั้นเกินเลเวลตัน — 0xe644f8)
//   เกียร์ +5 = นับเฉพาะ Basic
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { lericoProxy } from '@/lib/staticApi'
import { easeOut, easeOutBack, popStyle, prog, span } from './anim'
import { AtlasSprite } from './sam'
import {
  BANNER_COLOR, Banner, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, LoadBox, Opening, RangerCard, StatRow, SummaryShell,
  equipSlots, gearIconUrl, loadGear, loadStats, step, useTutorialData, type GearKind, type SlotGear,
} from './kit'

export type SummonMode = 'mineral-cost' | 'regen-time'
type Tr = (th: string, en: string) => string
const RANGER = 'u1260e-brown'
const f = Math.fround
/** ตรงกับ build-summon-scene.cjs */
const PHASE_A = 19.5, PHASE_B = 34.5, EQUIP_AT = 32.0, SUMMARY = 48.0, END = 55
const WALLET = 3000            // สมมุติมีแร่ 3,000 (คลิปแร่)
const X_RATE = 0.5             // ลิมิตเบรก 4 ขั้น (unit_level_expansion evolution 4 → 0.5)
const MIN_REGEN = 1.3
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
  const [r, ...gs] = await Promise.all([loadStats(RANGER), ...m.gears.map(g => loadGear(g.code))])
  const gears = gs.map(x => x.gear as GearEffects)
  const per = gears.map(g => g.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === m.type ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0))
  const raw = r as typeof r & { mineral?: number; growth?: { productionSpeed?: number } }
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
  return { r, gears, per, cost, costAfter, mul, sum, prod, tAfter, regenBefore, regenAfter }
}
type Data = Awaited<ReturnType<typeof loadData>>
const pc = (v: number) => { const x = Math.abs(v) * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }
const sec = (v: number) => `${(Math.round(v * 100) / 100).toString()}`
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** จังหวะกดเรียกในช่วง A / B (ตรงกับฉาก) */
function spawns(mode: SummonMode, d: Data) {
  if (mode === 'regen-time') return {
    a: [0, 1, 2].map(k => PHASE_A + k * d.regenBefore),
    b: [0, 1, 2, 3, 4, 5, 6].map(k => PHASE_B + k * d.regenAfter),
  }
  return { a: [PHASE_A], b: [0, 1, 2, 3].map(k => PHASE_B + k * d.regenBefore) }
}

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
  const sp = spawns(mode, d)

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const after = t >= EQUIP_AT
    const list = after ? sp.b : sp.a
    const cost = after && mineral ? d.costAfter : d.cost
    const regen = after && !mineral ? d.regenAfter : d.regenBefore
    const phaseStart = after ? PHASE_B : PHASE_A
    const done = list.filter(s => t >= s)
    const last = done.length ? done[done.length - 1] : null
    const cd = last != null ? Math.max(0, regen - (t - last)) : 0
    const wallet = WALLET - done.length * cost
    const broke = mineral && wallet < cost
    const barOn = span(t, PHASE_A - 0.6, SUMMARY - 0.2, 0.4, 0.4)
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gears[0]} icon={gearIconUrl(m.gears[0].code)} name={gearName(0)} effName={effName}
          switchable={null} kind={m.gears[0].kind} grade={m.gears[0].grade} tested={tested} />

        <RangerCard T={T} r={d.r} name={rangerName} s={span(t, 8.0, 12.2)} x={680} y={24}
          tag={T('เรนเจอร์ที่ใส่เกียร์', 'Gear wearer')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={T('ค่าแร่ต่อการเรียก 1 ตัว', 'Mineral cost per summon')} value={fmt(d.cost)} hlAt={mineral ? 8.75 : undefined} dim={!mineral} />
            <StatRow t={t} label={T('เวลาเกิดใหม่', 'Regeneration time')} value={T(`${sec(d.regenBefore)} วิ`, `${sec(d.regenBefore)} s`)} hlAt={mineral ? undefined : 8.75} dim={mineral}
              note={T(`พื้นฐาน ${sec(d.prod)} วิ × (1 − ${pc(X_RATE)} ลิมิตเบรก 4 ขั้น)`, `Base ${sec(d.prod)} s × (1 − ${pc(X_RATE)} from 4 limit breaks)`)} />
          </>}
          slots={<GearSlots t={t} />} />

        <SummonFormulaCard t={t} T={T} d={d} mineral={mineral} optName={optName} totalTxt={totalTxt} />

        <Banner t={t} start={PHASE_A - 0.6} end={PHASE_A + 2.6} title={T('ยังไม่ใส่เกียร์', 'No gear')}
          sub={mineral ? T(`สมมุติมีแร่ ${fmt(WALLET)} · เรียกตัวละ ${fmt(d.cost)}`, `Say we have ${fmt(WALLET)} minerals · ${fmt(d.cost)} per summon`) : T(`เรียกได้ทุก ${sec(d.regenBefore)} วิ (แร่พอเสมอ)`, `Summon every ${sec(d.regenBefore)} s (plenty of minerals)`)}
          color={BANNER_COLOR.normalNoGear} />
        <Banner t={t} start={PHASE_B - 0.6} end={PHASE_B + 2.6} title={T(`ใส่เกียร์ · ${optName} ${totalTxt}`, `With gear · ${optName} ${totalTxt}`)}
          sub={mineral ? T(`เรียกตัวละ ${fmt(d.costAfter)} · แร่ ${fmt(WALLET)} เท่าเดิม`, `${fmt(d.costAfter)} per summon · same ${fmt(WALLET)} minerals`) : T(`เรียกได้ทุก ${sec(d.regenAfter)} วิ`, `Summon every ${sec(d.regenAfter)} s`)}
          color={BANNER_COLOR.normalGear} />

        {barOn.on && (t < EQUIP_AT - 0.8 || t >= PHASE_B - 0.8) && (
          <div className="absolute left-[56px] top-[468px] flex items-end gap-5" style={{ opacity: barOn.alpha }}>
            <SummonButton t={t} d={d} cost={cost} cd={cd} regen={regen} dim={broke} imageUrl={d.r.imageUrl} lastTap={last} />
            <div className="mb-2 flex flex-col gap-2">
              {mineral && (
                <div className={`px-4 py-1.5 rounded-xl border-2 text-[24px] font-black tabular-nums ${broke ? 'bg-rose-900/80 border-rose-300/60 text-rose-100' : 'bg-black/70 border-white/20 text-white'}`}>
                  {T('แร่', 'Minerals')} {fmt(Math.max(0, wallet))}{broke ? ` · ${T('ไม่พอ!', 'not enough!')}` : ''}
                </div>
              )}
              <div className="px-4 py-1.5 rounded-xl bg-black/70 border-2 border-white/20 text-[22px] font-black text-amber-200 tabular-nums">
                {T('เรียกแล้ว', 'Summoned')} {done.length} {T('ตัว', '')} · {sec(Math.max(0, Math.min(t, phaseStart + 13) - phaseStart))}{T(' วิ', ' s')}
              </div>
            </div>
          </div>
        )}

        <SummonSetCard t={t} T={T} names={m.gears.map((_, i) => gearName(i))} codes={m.gears.map(g => g.code)} per={d.per} optName={optName} totalTxt={totalTxt} slots={slots} mineral={mineral} />

        <SummaryShell t={t} T={T} start={SUMMARY} end={END} top={-330} title={T(`${optName} — ${rangerName}`, `${optName} — ${rangerName}`)}>
          <div className="mt-3 grid grid-cols-2 gap-4" style={popStyle(span(t, SUMMARY + 0.5, END, 0.5, 0.6))}>
            {[false, true].map(g => (
              <div key={String(g)} className={`rounded-2xl border-2 p-3 text-center ${g ? 'bg-[#2a1f08] border-amber-400/50' : 'bg-white/[0.05] border-white/10'}`}>
                <div className="text-[20px] text-gray-300 font-bold">{g ? T(`ใส่เกียร์ ${optName} ${totalTxt}`, `${optName} ${totalTxt}`) : T('ไม่ใส่เกียร์', 'No gear')}</div>
                <div className={`text-[40px] font-black tabular-nums leading-tight ${g ? 'text-amber-300' : 'text-white'}`}>
                  {mineral ? fmt(g ? d.costAfter : d.cost) : T(`${sec(g ? d.regenAfter : d.regenBefore)} วิ`, `${sec(g ? d.regenAfter : d.regenBefore)} s`)}
                </div>
                <div className="text-[19px] font-bold text-gray-400">
                  {mineral ? T(`แร่ ${fmt(WALLET)} เรียกได้ ${Math.floor(WALLET / (g ? d.costAfter : d.cost))} ตัว`, `${fmt(WALLET)} minerals = ${Math.floor(WALLET / (g ? d.costAfter : d.cost))} summons`)
                    : T(`12 วิ เรียกได้ ${(g ? sp.b : sp.a).length} ตัว`, `${(g ? sp.b : sp.a).length} summons in 12 s`)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, SUMMARY + 1.4, SUMMARY + 1.8)) }}>
            {mineral
              ? T(`หลายชิ้น "คูณกัน" ไม่ใช่บวกกัน: ${m.gears.map((_, i) => `(1 − ${pc(d.per[i])})`).join(' × ')} = ${(Math.round(d.mul * 1000) / 1000)} → ค่าแร่ ${fmt(d.cost)} × ${(Math.round(d.mul * 1000) / 1000)} = ${fmt(d.costAfter)} (ตัดเศษ · ต่ำสุด 1)`,
                `Pieces multiply, they don't add: ${m.gears.map((_, i) => `(1 − ${pc(d.per[i])})`).join(' × ')} = ${(Math.round(d.mul * 1000) / 1000)} → ${fmt(d.cost)} × ${(Math.round(d.mul * 1000) / 1000)} = ${fmt(d.costAfter)} (rounded down · minimum 1)`)
              : T(`หลายชิ้นบวกกัน (${pc(d.sum)}) แต่คิดกับเวลาที่ลิมิตเบรกลดแล้ว: ${sec(d.prod)} + (−${pc(d.sum)} × ${sec(d.prod)} × ${pc(1 - X_RATE)}) = ${sec(d.tAfter)} → × ${pc(1 - X_RATE)} = ${sec(d.regenAfter)} วิ · ต่ำสุด ${MIN_REGEN} วิ`,
                `Pieces add up (${pc(d.sum)}) but apply on top of the limit-break cut: ${sec(d.prod)} + (−${pc(d.sum)} × ${sec(d.prod)} × ${pc(1 - X_RATE)}) = ${sec(d.tAfter)} → × ${pc(1 - X_RATE)} = ${sec(d.regenAfter)} s · minimum ${MIN_REGEN} s`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic) · Lv.180`, `Gear +${GEAR_LEVEL} (Basic only) · Lv.180`)}</div>
        </SummaryShell>
      </>
    )
  }
  return <ScenePlayer src={`/gear-options/scenes/${mode}.anme.json`} autoPlay={autoPlay} overlay={overlay} />
}

/** ปุ่มเรียกเรนเจอร์แบบในเกม (9★: bg_06 + frame06) · ค่าแร่ในแถบล่าง · เวลารอ = เงาทับจากบนลงล่าง + ตัวเลขวินาที */
function SummonButton({ t, cost, cd, regen, dim, imageUrl, lastTap }: { t: number; d: Data; cost: number; cd: number; regen: number; dim: boolean; imageUrl: string; lastTap: number | null }) {
  const W = 124, H = 132
  const tap = lastTap != null ? 1 - prog(t, lastTap, lastTap + 0.25) : 0
  return (
    <div className="relative" style={{ width: W * 1.3, height: H * 1.3, transform: `scale(${1 - 0.08 * tap})`, transformOrigin: 'center bottom' }}>
      <div className="absolute left-0 top-0" style={{ width: W, height: H, transform: 'scale(1.3)', transformOrigin: '0 0' }}>
        <AtlasSprite atlas="hd/battle/battle_ui" name="battle_btn_bottom_cha_bg_06.png" x={W / 2} y={H / 2} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lericoProxy(imageUrl)} alt="" crossOrigin="anonymous" className="absolute object-contain" style={{ left: 14, top: 8, width: 96, height: 92 }} />
        <AtlasSprite atlas="hd/battle/battle_ui" name="battle_btn_bottom_cha_frame06.png" x={W / 2} y={H / 2} />
        {(cd > 0 || dim) && (
          <div className="absolute rounded-[14px] bg-black/60" style={{ left: 12, top: 8, width: 100, height: (dim ? 1 : cd / regen) * 96 }} />
        )}
        {cd > 0 && <div className="absolute left-0 right-0 text-center text-[28px] font-black text-white tabular-nums" style={{ top: 34, WebkitTextStroke: '5px #0b0d18', paintOrder: 'stroke fill' }}>{cd.toFixed(1)}</div>}
        <div className="absolute left-0 right-0 text-center text-[19px] font-black tabular-nums" style={{ top: 104, color: dim ? '#fda4af' : '#fde68a', WebkitTextStroke: '4px #2a1200', paintOrder: 'stroke fill' }}>{cost.toLocaleString('en-US')}</div>
        {tap > 0 && <div className="absolute inset-0 rounded-[18px] bg-white" style={{ opacity: 0.45 * tap }} />}
      </div>
    </div>
  )
}

function SummonFormulaCard({ t, T, d, mineral, optName, totalTxt }: { t: number; T: Tr; d: Data; mineral: boolean; optName: string; totalTxt: string }) {
  const s = span(t, 12.6, 18.6, 0.5, 0.4)
  if (!s.on) return null
  const a = 12.6
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
