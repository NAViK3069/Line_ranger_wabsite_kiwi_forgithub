'use client'

// ====================================================
// วิดีโอสอน: ม่านโลหิต (Blood Veil)
//   เรา = Rock Legend Brown (ซ้าย, ใส่ [GA]Rudo's Gas Mask +5 → ม่านโลหิต +100.2%) ตี Executor Anubis Brown (ขวา)
//   ให้เราเลือดเหลือ 40% ตั้งแต่ต้น (เหมือนโดนตีมาก่อน) จะได้เห็นการเติมเลือด
//   รอบ 1 ตีปกติ · 2 สกิล (ไม่ใส่เกียร์ → ไม่ฟื้น) · ใส่เกียร์ · 3 ตีปกติ → เลือดเต็ม + ส่วนเกินเป็นโล่ · 4 สกิล → โล่เพิ่ม
//   ฉาก: public/gear-options/scenes/blood-veil.anme.json ← scripts/gear-options/build-bloodveil-scene.cjs
//
// กฎของเกม (ถอดจาก libgame.so):
//   เกียร์ ABSSHD_PROP_MUL (0x2b) → รวม Basic ทุกชิ้น + Switchable ตรงเงื่อนไขตัวสูงสุด (0x111d8c8) → UnitData 0x8f0 (0xd5d490)
//   ทริกเกอร์ (0xceb914): onDamaged ของฝั่งที่โดน (UnitNode vfunc 0x418) เรียกให้ "ผู้ตี" เมื่อดาเมจ > 0 และ kind 1–3 (ทักษะ / ตีปกติ)
//     → ตีโดนทุกครั้ง (ทักษะโดนหลายตัว = ทำงานทุกตัวที่โดน)
//   ฟื้น = ตัดเศษ(ม่านโลหิต × HP สูงสุด) · ถ้ามากกว่าเลือดที่ขาด → เติมจนเต็ม แล้วส่วนเกินเป็นโล่ (0xcee760)
//     โล่สะสมได้ แต่มีเพดาน = HP สูงสุด × ค่าจาก config ของเกม (MAX_ABSORB_SHIELD_*)
//   เกียร์ +5 = นับเฉพาะ Basic
// ====================================================

import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { GearEffect } from '@/lib/pvpScraper'
import { clamp01, easeInOut, easeOut, easeOutBack, fmtInt, popStyle, prog, span } from './anim'
import {
  BANNER_COLOR, Banner, CUE_IDS, EquipCard, Fit1, FitCard, GEAR_LEVEL, GearCard, GearSlots, ICON, LoadBox, Opening,
  RangerCard, StatRow, SummaryShell, TL, gearIconUrl, loadGear, loadStats, pct, step, useTutorialData,
} from './kit'

const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }
const GEAR = { code: 'eq_2510_amr_28', grade: 8, en: "[GA]Rudo's Gas Mask" }
const START_HP = 0.4   // เลือดของเราตอนเริ่ม (สมมุติว่าโดนตีมาก่อน)
const TYPE = 'ABSSHD_PROP_MUL'
const f = Math.fround

async function loadData() {
  const [ally, g] = await Promise.all([loadStats(ALLY.ranger), loadGear(GEAR.code)])
  const rate = g.gear.basic.reduce((s, e) => s + (e.basicGrowth?.reinforceType === TYPE ? e.basicGrowth.maxValue * (GEAR_LEVEL + 1) : 0), 0)
  const maxHp = ally.baseStats.hp
  const start = Math.trunc(maxHp * START_HP)
  const heal = Math.trunc(f(f(rate) * f(maxHp)))      // ฟื้นต่อครั้งที่ตีโดน
  const missing = maxHp - start
  const shield1 = Math.max(0, heal - missing)         // รอบ 3: เติมเต็ม + ส่วนเกิน
  const shield2 = shield1 + heal                      // รอบ 4: เลือดเต็มแล้ว → เป็นโล่ทั้งก้อน
  return { ally, gear: g.gear, rate, maxHp, start, heal, missing, shield1, shield2 }
}
type Data = Awaited<ReturnType<typeof loadData>>
type Tr = (th: string, en: string) => string

export default function BloodVeilTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T: Tr = (th, en) => (lang === 'th' ? th : en)
  const { d, err } = useTutorialData(loadData)
  if (!d) return <LoadBox err={err} T={T} />

  const optName = tr('equip', 'GEAR_ATTR_ABSSHD_PROP_MUL_nm', T('ม่านโลหิต', 'Blood Veil'))
  const gearName = tGear(GEAR.code, GEAR.en)
  const allyName = tRanger(ALLY.ranger, 'Rock Legend Brown')
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const tested = d.gear.basic.map((e, i) => (e.basicGrowth?.reinforceType === TYPE ? i : -1)).filter(i => i >= 0)
  const totalTxt = `+${pct(d.rate, 1)}`

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const hits = CUE_IDS.map((id, i) => c.hitsOf(id)[0] ?? TL.hitFallback[i])
    const S = TL.summary
    return (
      <>
        <Opening t={t} lang={lang} T={T} title={optName} />
        <GearCard t={t} T={T} gear={d.gear} icon={gearIconUrl(GEAR.code)} name={gearName} effName={effName}
          switchable={null} kind="armor" grade={GEAR.grade} tested={tested} />

        <RangerCard T={T} r={d.ally} name={allyName} s={span(t, 8.2, 11.9)} x={680} y={24}
          tag={T('ตัวที่ใส่เกียร์ · เป็นฝ่ายตี', 'Gear wearer · the attacker')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} label={optName} value="0%" hlAt={8.75} note={T('เรนเจอร์ไม่มีค่านี้ติดตัว — ได้จากเกียร์', 'Rangers have none by default — it comes from gear')} />
            <StatRow t={t} icon={ICON.hp} label={T('HP สูงสุด', 'Max HP')} value={fmtInt(d.maxHp)} hlAt={9.5} />
            <StatRow t={t} icon={ICON.hp} label={T('HP ตอนนี้', 'HP now')} value={`${pct(START_HP)}`} hlAt={10.1} note={T('สมมุติว่าโดนตีมาก่อน — จะได้เห็นการเติมเลือด', 'Pretend we were hit earlier — so the refill shows')} />
          </>}
          slots={<GearSlots t={t} />} />

        <VeilFormulaCard t={t} T={T} d={d} optName={optName} totalTxt={totalTxt} />

        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')} sub={T('เราตีปกติ', 'We normal-attack')} color={BANNER_COLOR.normalNoGear} />
        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')} sub={T('เราใช้สกิล', 'We use a skill')} color={BANNER_COLOR.skillNoGear} />
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ${optName} ${totalTxt}`, `Round 3 · ${optName} ${totalTxt}`)} sub={T('ตีปกติโดน → ฟื้นเลือด', 'Normal hit lands → heal')} color={BANNER_COLOR.normalGear} />
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ${optName} ${totalTxt}`, `Round 4 · ${optName} ${totalTxt}`)} sub={T('สกิลโดน → ทำงานเหมือนกัน', 'Skill hit lands → works too')} color={BANNER_COLOR.skillGear} />

        <VeilBar c={c} t={t} d={d} hit3={hits[2]} hit4={hits[3]} T={T} />
        <VeilPop c={c} t={t} T={T} at={hits[2]} heal={d.missing} shield={d.shield1} />
        <VeilPop c={c} t={t} T={T} at={hits[3]} heal={0} shield={d.heal} />

        <EquipCard t={t} T={T} gearIcon={gearIconUrl(GEAR.code)} gearName={gearName} bonusPct={d.rate} kind="armor" grade={GEAR.grade}
          stats={[{ icon: ICON.hp, label: T('ฟื้นต่อการตีโดน 1 ครั้ง', 'Heal per hit landed'), before: 0, after: d.heal,
            formula: `${fmtInt(d.maxHp)} × ${pct(d.rate, 1)}` }]} />

        <SummaryShell t={t} T={T} top={-340} title={T(`${optName} — ทุกครั้งที่ ${allyName} ตีโดน`, `${optName} — every time ${allyName} lands a hit`)}>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center" style={popStyle(span(t, S + 0.5, TL.end, 0.5, 0.6))}>
            {[
              { k: T('ฟื้นต่อครั้ง', 'Heal per hit'), v: fmtInt(d.heal), cls: 'text-emerald-300' },
              { k: T('รอบ 3: เติมเลือด + โล่', 'Round 3: heal + shield'), v: `+${fmtInt(d.missing)} · ${fmtInt(d.shield1)}`, cls: 'text-white' },
              { k: T('รอบ 4: โล่สะสม', 'Round 4: shield stacks'), v: fmtInt(d.shield2), cls: 'text-amber-300' },
            ].map(x => (
              <div key={x.k} className="rounded-2xl bg-white/[0.05] border-2 border-white/10 p-3">
                <Fit1 className="text-center"><span className="text-[19px] text-gray-300 font-bold">{x.k}</span></Fit1>
                <Fit1 className="text-center"><span className={`text-[30px] font-black tabular-nums leading-tight ${x.cls}`}>{x.v}</span></Fit1>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.05] border-2 border-white/10 px-5 py-3 text-[20px] font-bold text-gray-200 text-balance" style={{ opacity: easeOut(prog(t, S + 1.4, S + 1.8)) }}>
            {T(`ฟื้น = ${optName} × HP สูงสุด ทุกครั้งที่ตีโดน (ตีปกติและสกิล · สกิลโดนหลายตัว = ฟื้นทุกตัว) · เติมเลือดที่ขาดก่อน ส่วนเกินกลายเป็นโล่สะสม (มีเพดานตามค่าของเกม) · หลายชิ้นบวกกัน`,
              `Heal = ${optName} × max HP on every hit landed (normal attacks and skills · a skill hitting several targets heals for each) · refills missing HP first, the rest stacks as a shield (capped by a game setting) · pieces add up`)}
          </div>
          <div className="mt-2 text-center text-[18px] text-gray-500">{T(`เกียร์ +${GEAR_LEVEL} (นับเฉพาะ Basic)`, `Gear +${GEAR_LEVEL} (Basic only)`)}</div>
        </SummaryShell>
      </>
    )
  }
  return <ScenePlayer src="/gear-options/scenes/blood-veil.anme.json" autoPlay={autoPlay} overlay={overlay} />
}

// ── การ์ดสูตร ──
function VeilFormulaCard({ t, T, d, optName, totalTxt }: { t: number; T: Tr; d: Data; optName: string; totalTxt: string }) {
  const s = span(t, 12.6, 20.4, 0.5, 0.4)
  if (!s.on) return null
  const a = 12.6
  return (
    <FitCard className="left-1/2 top-[30px] w-[920px] -ml-[460px] px-8 py-6" style={popStyle(s, 36)}>
      <Fit1><span className="text-[26px] font-black text-sky-300">{T('ม่านโลหิตทำงานแบบนี้', 'How Blood Veil works')}</span></Fit1>
      <div className="mt-3 rounded-2xl bg-white/[0.05] px-5 py-3 text-center" style={step(t, a + 0.3)}>
        <Fit1 className="text-center"><span className="text-[30px] font-black text-emerald-200">{T('ทุกครั้งที่ตีโดน', 'Every hit landed')}: {T('ฟื้น', 'heal')} = {optName} × HP {T('สูงสุด', 'max')}</span></Fit1>
        <div className="mt-1 text-[20px] font-bold text-gray-300 text-balance">{T('ทั้งตีปกติและสกิล · เติมเลือดที่ขาดก่อน ที่เหลือกลายเป็นโล่ (สะสมได้ มีเพดาน)', 'Normal attacks and skills · refills missing HP first, the rest becomes a shield (stacks, with a cap)')}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4" style={step(t, a + 1.6)}>
        <div className="rounded-2xl bg-white/[0.05] border-2 border-white/10 px-4 py-3"><div className="text-[20px] font-bold text-gray-400">{T('ไม่ใส่เกียร์', 'No gear')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{T('ฟื้น', 'Heal')} 0</div></div>
        <div className="rounded-2xl bg-[#082a1c] border-2 border-emerald-400/50 px-4 py-3"><div className="text-[20px] font-bold text-emerald-200">{optName} {totalTxt}</div>
          <Fit1><span className="text-[22px] font-bold text-gray-200 tabular-nums">{fmtInt(d.maxHp)} × {pct(d.rate, 1)}</span></Fit1>
          <div className="text-[40px] font-black text-emerald-300 leading-tight">{T('ฟื้น', 'Heal')} {fmtInt(d.heal)}</div></div>
      </div>
    </FitCard>
  )
}

/** หลอดเลือด + โล่ของเรา (เลือดเริ่ม 40% · รอบ 3 เติมเต็ม + โล่ · รอบ 4 โล่เพิ่ม) */
function VeilBar({ c, t, d, hit3, hit4, T }: { c: OverlayCtx; t: number; d: Data; hit3: number; hit4: number; T: Tr }) {
  const s = span(t, TL.refill[0] - 0.1, TL.summary, 0.35, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ALLY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 205 })
  const k3 = easeInOut(prog(t, hit3 + 0.05, hit3 + 0.6)), k4 = easeInOut(prog(t, hit4 + 0.05, hit4 + 0.6))
  const hp = d.start + d.missing * k3
  const shield = d.shield1 * k3 + d.heal * k4
  const W = 360
  const glow = Math.max(t >= hit3 ? 1 - prog(t, hit3, hit3 + 0.8) : 0, t >= hit4 ? 1 - prog(t, hit4, hit4 + 0.8) : 0)
  return (
    <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 220), 1060), top: sp.y, transform: 'translate(-50%,-100%)', opacity: s.alpha }}>
      <div className="rounded-2xl bg-[#0b1122] p-2.5 border-2 border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.7)]" style={{ width: W }}>
        <div className="relative h-6 rounded-lg bg-slate-800 overflow-hidden ring-1 ring-black/60">
          <div className="absolute inset-y-0 left-0 bg-gradient-to-b from-rose-400 via-red-500 to-red-700" style={{ width: `${(hp / d.maxHp) * 100}%` }} />
          {glow > 0 && <div className="absolute inset-0 bg-emerald-300 mix-blend-screen" style={{ opacity: 0.5 * glow }} />}
        </div>
        {shield > 0 && (
          <div className="relative h-3 mt-1 rounded bg-slate-800 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-300 to-yellow-100" style={{ width: `${Math.min(1, shield / (d.maxHp * 2)) * 100}%` }} />
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 whitespace-nowrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON.hp} alt="" className="w-7 h-7" />
          <span className="text-[22px] font-black text-white tabular-nums">{fmtInt(hp)}</span>
          {shield <= 0 && <span className="text-[18px] text-gray-400 tabular-nums">/ {fmtInt(d.maxHp)}</span>}
          {shield > 0 && <span className="ml-auto text-[20px] font-black text-amber-200 tabular-nums">{T('โล่', 'Shield')} {fmtInt(shield)}</span>}
        </div>
      </div>
    </div>
  )
}

/** ป้ายฟื้นเลือด / โล่ที่ตัวเรา */
function VeilPop({ c, t, T, at, heal, shield }: { c: OverlayCtx; t: number; T: Tr; at: number; heal: number; shield: number }) {
  const s = span(t, at + 0.05, at + 2.8, 0.25, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ALLY.actor)
  if (!pos) return null
  const p = c.project({ x: pos.x, y: pos.y - 120 })
  const pop = easeOutBack(clamp01(s.enter))
  const rise = easeOut(prog(t, at + 0.05, at + 0.7)) * 36
  return (
    <div className="absolute flex flex-col items-center gap-1.5" style={{ left: p.x + 150, top: p.y - rise, transform: `translate(-50%,-100%) scale(${0.6 + 0.4 * pop})`, opacity: s.alpha }}>
      {heal > 0 && <div className="px-4 py-1.5 rounded-2xl bg-emerald-600 border-2 border-emerald-200/70 text-[28px] font-black text-white tabular-nums whitespace-nowrap">+{fmtInt(heal)} HP</div>}
      <div className="px-4 py-1.5 rounded-2xl bg-amber-500 border-2 border-amber-100/70 text-[26px] font-black text-[#2a1600] tabular-nums whitespace-nowrap">{T('โล่', 'Shield')} +{fmtInt(shield)}</div>
    </div>
  )
}
