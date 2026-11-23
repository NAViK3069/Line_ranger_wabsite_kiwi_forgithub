'use client'

// ====================================================
// วิดีโอสอน: พลังโจมตี (ATK) — ใช้อาวุธ "ร่มกันจันทรา" (eq_wpn_evt_057) +10
//
// เรื่องราว (เวลาตรงกับฉาก public/gear-options/scenes/atk.anme.json):
//   0–7.5    ชื่อหัวข้อ → การ์ดเกียร์ ไฮไลท์ "พลังโจมตีรวม +444%"
//   7.5–12   ค่าพลังเรนเจอร์ของเรา (เลเวลเต็ม)            กล้องซูมตัวเรา
//   12–16    ค่าพลังเป้าหมาย (HP / DEF)                    กล้องแพนไปเป้าหมาย
//   16–20.5  สูตรลดดาเมจจาก DEF: K / (K + DEF), K = 18000
//   20.5–24  รอบ 1 ก่อนใส่เกียร์ — โจมตีปกติ + ตัวเลขดาเมจ + หลอด HP
//   24–28.5  ใส่เกียร์ — ไอคอนบินเข้าตัว + ท่าเพิ่มพลัง + ATK วิ่งขึ้น
//   28.5–32  รอบ 2 หลังใส่เกียร์ — โจมตีปกติอีกครั้ง
//   32–38    สรุปเปรียบเทียบ
//
// ตัวเลขทั้งหมดคำนวณสดจากข้อมูลชุดเดียวกับ Ranger Book / Gear Book (ไม่พิมพ์ตายตัว):
//   ค่าพลังเลเวลเต็ม = /data/ranger/stats/<id>.json → baseStats
//   ATK หลังใส่เกียร์ = aggregateGearBonuses + applyBonus (โลจิกเดียวกับ RangerStatPanel)
//   ค่าเกียร์ +10 = /data/gear/effects/<code>.json ระดับ "5" (เท่ากับหน้าต่างเกียร์ที่ +10 Max)
// ====================================================

import { useEffect, useState } from 'react'
import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch, DATA_BASE, gearEffectsFile, lericoProxy } from '@/lib/staticApi'
import { aggregateGearBonuses, applyBonus } from '@/lib/gearEffectParser'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { clamp01, countUp, easeInOut, easeOut, easeOutBack, fmtInt, popStyle, prog, pulse, span } from './anim'

const SCENE = '/gear-options/scenes/atk.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1353e-brown' }
const GEAR = 'eq_wpn_evt_057'
const GEAR_LEVEL = '5'            // ระดับในไฟล์ effects ที่ตรงกับ +10 (Max)
const SHOWN_SWITCHABLE = 'GEAR_ATTR_PRD_SPE_MUL_nm'   // ช่อง Switchable ที่แสดงบนการ์ด (ตามภาพในเกม) — ไม่มีผลกับ ATK
const K = 18000                   // ค่าคงที่สูตรลดดาเมจจาก DEF

interface RangerStats {
  id: string
  imageUrl: string
  playerMaxLevel: number | null
  category: string | null
  element: string | null
  baseStats: { phyAtk: number; magAtk: number; phyDef: number; magDef: number; hp: number }
}

interface Data {
  ally: RangerStats
  enemy: RangerStats
  gear: GearEffects
  switchable: GearEffect | null
  atkBefore: number
  atkAfter: number
  atkPct: number          // 4.44
  enemyDef: number
  factor: number          // K / (K + DEF)
  dmgBefore: number
  dmgAfter: number
}

async function loadData(): Promise<Data> {
  const stats = (id: string) => apiFetch(`/api/meta/ranger-stats?id=${encodeURIComponent(id)}`).then(r => r.json() as Promise<RangerStats>)
  const [ally, enemy, fx] = await Promise.all([
    stats(ALLY.ranger), stats(ENEMY.ranger),
    fetch(`${DATA_BASE}/${gearEffectsFile(GEAR)}`).then(r => r.json() as Promise<Record<string, GearEffects>>),
  ])
  const gear = fx[GEAR_LEVEL]
  // เหมือน Ranger Book: Overall ATK กระจายเข้าทั้ง phy และ mag · ใช้เฉพาะ Basic (Switchable ที่โชว์ไม่เกี่ยวกับ ATK)
  const b = aggregateGearBonuses([gear], [null])
  const s = ally.baseStats
  const atkBefore = s.phyAtk + s.magAtk
  const atkAfter = Math.round(applyBonus(s.phyAtk, b.phyAtk)) + Math.round(applyBonus(s.magAtk, b.magAtk))
  const enemyDef = enemy.baseStats.phyDef + enemy.baseStats.magDef
  const factor = K / (K + enemyDef)
  const switchable = gear.switchable?.allEffects.find(e => e.effect.nameKey === SHOWN_SWITCHABLE)?.effect ?? null
  return {
    ally, enemy, gear, switchable,
    atkBefore, atkAfter, atkPct: b.magAtk?.pct ?? b.phyAtk?.pct ?? 0,
    enemyDef, factor,
    dmgBefore: Math.round(atkBefore * factor),
    dmgAfter: Math.round(atkAfter * factor),
  }
}

// ── ชิ้นส่วนหน้าตา (หน่วย = พิกเซลเวที 1280×720) ──────────────────

const CARD = 'rounded-2xl border border-white/15 bg-[#0d1324]/90 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md'
const ICON = { atk: '/gacha/images/atk.png', hp: '/gacha/images/hp.png', def: '/gacha/images/def.png' }

function StatRow({ icon, label, value, hl, t }: { icon: string; label: string; value: string; hl?: boolean; t: number }) {
  const g = hl ? 0.55 + 0.45 * pulse(t) : 0
  return (
    <div className="relative flex items-center gap-3 rounded-xl px-3 py-2"
      style={hl ? { background: `rgba(251,191,36,${0.12 + 0.1 * g})`, boxShadow: `0 0 0 2px rgba(251,191,36,${0.5 + 0.4 * g}), 0 0 ${18 + 14 * g}px rgba(251,191,36,${0.35 * g})` } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" className="w-7 h-7 object-contain" />
      <span className="text-[17px] text-gray-300">{label}</span>
      <span className={`ml-auto text-[22px] font-black tabular-nums ${hl ? 'text-amber-200' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function RangerCard({ r, name, rows, t, s, x, y, tag, tagColor }: {
  r: RangerStats; name: string; rows: React.ReactNode; t: number; s: ReturnType<typeof span>
  x: number; y: number; tag: string; tagColor: string
}) {
  if (!s.on) return null
  return (
    <div className={`absolute w-[400px] p-4 ${CARD}`} style={{ left: x, top: y, ...popStyle(s) }}>
      <div className="flex items-center gap-3 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lericoProxy(r.imageUrl)} alt="" crossOrigin="anonymous" className="w-16 h-16 rounded-xl bg-white/5 object-contain" />
        <div className="min-w-0">
          <span className={`inline-block text-[12px] font-bold px-2 py-0.5 rounded-md ${tagColor}`}>{tag}</span>
          <div className="text-[20px] font-black text-white leading-tight truncate mt-1">{name}</div>
          <div className="text-[13px] text-cyan-300 font-bold">Lv.{r.playerMaxLevel ?? 'MAX'} · MAX</div>
        </div>
      </div>
      <div className="space-y-1.5">{rows}</div>
    </div>
  )
}

function Banner({ t, start, end, title, sub, color }: { t: number; start: number; end: number; title: string; sub: string; color: string }) {
  const s = span(t, start, end, 0.4, 0.35)
  if (!s.on) return null
  const e = easeOut(s.enter)
  return (
    <div className="absolute left-1/2 top-[34px]" style={{ opacity: s.alpha, transform: `translateX(-50%) translateY(${(1 - e) * -40}px)` }}>
      <div className={`px-7 py-2.5 rounded-2xl text-center ${color} shadow-[0_10px_40px_-8px_rgba(0,0,0,0.8)]`}>
        <div className="text-[26px] font-black text-white leading-tight tracking-wide">{title}</div>
        <div className="text-[15px] text-white/85 font-semibold">{sub}</div>
      </div>
    </div>
  )
}

function DamagePop({ c, t, at, value, big }: { c: OverlayCtx; t: number; at: number; value: number; big?: boolean }) {
  const p = prog(t, at, at + 1.7)
  if (t < at || p >= 1) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 150 })
  const inS = easeOutBack(clamp01(p / 0.18))
  const fade = 1 - clamp01((p - 0.7) / 0.3)
  return (
    <div className="absolute" style={{ left: sp.x, top: sp.y - 40 * easeOut(p), transform: `translate(-50%,-50%) scale(${(big ? 1.35 : 1) * (0.4 + 0.6 * inS)})`, opacity: fade }}>
      <div className={`font-black tabular-nums whitespace-nowrap ${big ? 'text-[54px] text-orange-300' : 'text-[42px] text-white'}`}
        style={{ WebkitTextStroke: big ? '2px #7c2d12' : '2px #1e293b', textShadow: big ? '0 0 24px rgba(251,146,60,0.9)' : '0 4px 12px rgba(0,0,0,0.8)' }}>
        -{fmtInt(value)}
      </div>
    </div>
  )
}

function HpBar({ c, t, d, hits }: { c: OverlayCtx; t: number; d: Data; hits: { at: number; dmg: number }[] }) {
  const s = span(t, 20.4, 32.3, 0.4, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 200 })
  const max = d.enemy.baseStats.hp
  // HP ลดทันทีตอนโดน (ส่วนสีแดง) · แถบขาวไล่ตามช้าๆ ให้เห็นว่าหายไปเท่าไหร่
  let hp = max, ghost = max
  for (const h of hits) {
    if (t >= h.at) { ghost = hp - h.dmg * (1 - easeInOut(prog(t, h.at + 0.25, h.at + 0.9))); hp -= h.dmg }
  }
  ghost = Math.max(hp, ghost)
  return (
    <div className="absolute" style={{ left: sp.x, top: sp.y, transform: 'translate(-50%,-100%)', opacity: s.alpha }}>
      <div className="w-[230px] rounded-lg bg-black/70 p-1.5 border border-white/15">
        <div className="relative h-3.5 rounded bg-slate-800 overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-white/80" style={{ width: `${(ghost / max) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-rose-400" style={{ width: `${(hp / max) * 100}%` }} />
        </div>
        <div className="flex items-center gap-1 mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON.hp} alt="" className="w-4 h-4" />
          <span className="text-[13px] font-bold text-white tabular-nums">{fmtInt(hp)}</span>
          <span className="text-[11px] text-gray-400 tabular-nums">/ {fmtInt(max)}</span>
        </div>
      </div>
    </div>
  )
}

// ── วิดีโอ ────────────────────────────────────────────

export default function AtkTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { loadData().then(setD).catch(e => setErr(String(e))) }, [])

  if (err) return <div className="aspect-video grid place-items-center text-red-300 text-sm">{T('โหลดข้อมูลไม่ได้', 'Failed to load data')}: {err}</div>
  if (!d) return <div className="w-full aspect-video bg-black rounded-xl grid place-items-center text-gray-400 text-sm">Loading...</div>

  const gearIcon = lericoProxy(`https://rangers.lerico.net/res/gear_icon/${GEAR}_icon.png`)
  const gearName = tGear(GEAR, 'Moonbrella')
  const allyName = tRanger(ALLY.ranger, 'Rock Legend Brown')
  const enemyName = tRanger(ENEMY.ranger, 'Underworld Agent Brown')
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const mult = 1 + d.atkPct

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const hitBefore = c.hitsOf('atk_before')[0] ?? 21.6
    const hitAfter = c.hitsOf('atk_after')[0] ?? 30.0
    const hits = [{ at: hitBefore, dmg: d.dmgBefore }, { at: hitAfter, dmg: d.dmgAfter }]

    // ── 1. ฉากเปิด ──
    const dim = span(t, 0, 7.6, 0.01, 0.5)
    const title = span(t, 0.2, 2.4, 0.5, 0.4)
    const gear = span(t, 2.1, 7.4, 0.55, 0.4)
    const hl = t >= 3.8

    // ── 2–3. การ์ดเรนเจอร์ ──
    const allyCard = span(t, 8.2, 11.9)
    const enemyCard = span(t, 12.5, 15.9)

    // ── 4. สูตร ──
    const formula = span(t, 16.4, 20.4, 0.5, 0.4)
    const step = (a: number) => ({ opacity: easeOut(prog(t, a, a + 0.4)), transform: `translateX(${(1 - easeOut(prog(t, a, a + 0.4))) * -18}px)` })

    // ── 6. ใส่เกียร์ ──
    const allyPos = c.actorAt(ALLY.actor)
    const allyScreen = allyPos ? c.project({ x: allyPos.x, y: allyPos.y - 95 }) : { x: 520, y: 380 }
    const fly = prog(t, 24.4, 25.15)
    const flash = span(t, 25.1, 25.9, 0.08, 0.6)
    const atkUp = span(t, 25.3, 28.4, 0.4, 0.35)
    const atkNow = countUp(t, 25.7, 27.2, d.atkBefore, d.atkAfter)

    // ── 8. สรุป ──
    const sum = span(t, 32.3, 38, 0.55, 0.6)
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))

    return (
      <>
        {/* พื้นหลังมืดช่วงเปิด ให้การ์ดเด่น */}
        {dim.on && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,8,20,0.55),rgba(0,0,0,0.85))]" style={{ opacity: dim.alpha }} />}

        {/* หัวข้อ */}
        {title.on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={popStyle(title, 40)}>
            <div className="text-[18px] font-bold tracking-[0.35em] text-amber-300/90 uppercase">{T('ออพชั่นของอุปกรณ์', 'Gear option')}</div>
            <div className="text-[76px] font-black text-white leading-none mt-2 drop-shadow-[0_6px_24px_rgba(251,191,36,0.45)]">{T('พลังโจมตี', 'ATK')}</div>
            <div className="mt-4 h-[3px] bg-gradient-to-r from-transparent via-amber-300 to-transparent" style={{ width: 420 * easeOut(title.enter) }} />
          </div>
        )}

        {/* การ์ดเกียร์ (หน้าตาเดียวกับหน้าต่างเกียร์บนเว็บ) */}
        {gear.on && (
          <div className={`absolute left-1/2 top-[108px] w-[520px] -ml-[260px] p-5 ${CARD}`} style={popStyle(gear, 40)}>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-[84px] h-[84px] object-contain drop-shadow-[0_6px_16px_rgba(56,189,248,0.4)]" />
              <div>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/gear_weapon.png" alt="" className="h-6" />
                  <span className="text-[15px] text-gray-300">{T('อาวุธ', 'Weapon')}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/7star.png" alt="" className="h-5" />
                </div>
                <div className="text-[30px] font-black text-white leading-tight">{gearName}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 text-[14px]">
              <span className="text-gray-400">{T('ค่าเกียร์ที่ระดับ', 'Gear level')}</span>
              <span className="text-amber-300 font-black">+10 (Max)</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 mt-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-300" style={{ width: `${100 * easeOut(prog(t, 2.6, 3.4))}%` }} />
            </div>
            <div className="mt-4 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3">
              <div className="text-[13px] font-black text-blue-200 tracking-wider mb-1.5">BASIC EFFECT</div>
              {d.gear.basic.map((e, i) => {
                const isAtk = i === 0
                const g = isAtk && hl ? 0.5 + 0.5 * pulse(t, 1.6) : 0
                const zoom = isAtk && hl ? 1 + 0.045 * easeOutBack(prog(t, 3.8, 4.25)) : 1
                return (
                  <div key={e.nameKey ?? e.name} className="relative flex items-center justify-between rounded-lg px-2 py-1 text-[17px]"
                    style={isAtk && hl ? {
                      transform: `scale(${zoom})`,
                      background: `rgba(251,191,36,${0.14 + 0.12 * g})`,
                      boxShadow: `0 0 0 2px rgba(251,191,36,${0.55 + 0.4 * g}), 0 0 ${20 + 16 * g}px rgba(251,191,36,${0.4 * g})`,
                    } : { opacity: hl ? 0.55 : 1 }}>
                    <span className={isAtk && hl ? 'text-amber-100 font-bold' : 'text-blue-100'}>{effName(e)}</span>
                    <span className={`font-black tabular-nums ${isAtk && hl ? 'text-amber-200 text-[20px]' : 'text-white'}`}>{e.value}</span>
                  </div>
                )
              })}
            </div>
            {d.switchable && (
              <div className="mt-2.5 rounded-xl border border-orange-400/30 bg-orange-500/10 p-3" style={{ opacity: hl ? 0.55 : 1 }}>
                <div className="text-[13px] font-black text-orange-200 tracking-wider mb-1">SWITCHABLE EFFECT</div>
                <div className="flex items-center justify-between px-2 text-[16px]">
                  <span className="text-orange-100">{effName(d.switchable)}</span>
                  <span className="font-black text-white tabular-nums">{d.switchable.value}</span>
                </div>
              </div>
            )}
            {/* ป้ายชี้ค่าที่จะทดสอบ */}
            {hl && (
              <div className="absolute -right-[230px] top-[178px] flex items-center gap-2"
                style={{ opacity: easeOut(prog(t, 4.1, 4.6)), transform: `translateX(${(1 - easeOut(prog(t, 4.1, 4.6))) * 30 + Math.sin(t * 5) * 4}px)` }}>
                <span className="material-icons-round text-amber-300 text-[40px]">west</span>
                <span className="px-3 py-1.5 rounded-lg bg-amber-400 text-[16px] font-black text-[#1a1200] whitespace-nowrap">
                  {T('ทดสอบค่านี้', 'Testing this')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ค่าพลังเรนเจอร์ของเรา */}
        <RangerCard r={d.ally} name={allyName} t={t} s={allyCard} x={790} y={112}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.atkBefore)} hl />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.ally.baseStats.hp)} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.ally.baseStats.phyDef + d.ally.baseStats.magDef)} />
            <div className="text-[13px] text-gray-400 pt-1.5 px-1">{T('ยังไม่ใส่เกียร์ · เลเวลเต็มทั้งสองฝั่ง', 'No gear yet · both sides at max level')}</div>
          </>} />

        {/* ค่าพลังเป้าหมาย */}
        <RangerCard r={d.enemy} name={enemyName} t={t} s={enemyCard} x={90} y={112}
          tag={T('เป้าหมาย', 'Target')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.enemy.baseStats.hp)} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.enemyDef)} hl />
          </>} />

        {/* สูตรลดดาเมจ */}
        {formula.on && (
          <div className={`absolute left-1/2 top-[96px] w-[600px] -ml-[300px] p-6 ${CARD}`} style={popStyle(formula, 36)}>
            <div className="text-[15px] font-black text-sky-300 tracking-wider">{T('พลังป้องกันลดดาเมจ', 'DEF reduces damage')}</div>
            <div className="mt-3 flex items-center justify-center gap-3 text-white" style={step(16.7)}>
              <span className="text-[24px] font-bold">{T('ดาเมจจริง', 'Damage')} = ATK ×</span>
              <span className="inline-flex flex-col items-center text-[24px] font-black leading-tight">
                <span className="px-2">K</span>
                <span className="w-full h-[2px] bg-white" />
                <span className="px-2">K + DEF</span>
              </span>
            </div>
            <div className="mt-4 space-y-2 text-[18px]">
              <div className="flex justify-between" style={step(17.5)}>
                <span className="text-gray-300">K</span><span className="font-black text-white tabular-nums">{fmtInt(K)}</span>
              </div>
              <div className="flex justify-between" style={step(18.0)}>
                <span className="text-gray-300">{T('DEF ของเป้าหมาย', 'Target DEF')}</span><span className="font-black text-rose-300 tabular-nums">{fmtInt(d.enemyDef)}</span>
              </div>
              <div style={step(18.6)}>
                <div className="flex justify-between">
                  <span className="text-gray-300">{T('ดาเมจที่ผ่านเข้าไป', 'Damage that gets through')}</span>
                  <span className="font-black text-amber-300 tabular-nums">{(d.factor * 100).toFixed(2)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${d.factor * 100 * easeOut(prog(t, 18.8, 19.6))}%` }} />
                </div>
              </div>
              {/* ผลลัพธ์ = ตัวเลขที่จะเด้งตอนตีรอบแรก */}
              <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-white/10" style={step(19.5)}>
                <span className="text-gray-300">{fmtInt(d.atkBefore)} × {(d.factor * 100).toFixed(2)}%</span>
                <span className="text-[24px] font-black text-white tabular-nums">= {fmtInt(d.dmgBefore)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── รอบ 1 ── */}
        <Banner t={t} start={20.4} end={24.0} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`ATK ${fmtInt(d.atkBefore)}`} color="bg-gradient-to-r from-slate-700/95 to-slate-600/95 border border-white/15" />
        <HpBar c={c} t={t} d={d} hits={hits} />
        <DamagePop c={c} t={t} at={hitBefore} value={d.dmgBefore} />

        {/* ── ใส่เกียร์ ── */}
        {t >= 24.4 && fly < 1 && (() => {
          const k = easeInOut(fly)
          const x = 640 + (allyScreen.x - 640) * k
          const y = 80 + (allyScreen.y - 80) * k - Math.sin(k * Math.PI) * 60
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={gearIcon} alt="" crossOrigin="anonymous" className="absolute w-[96px] h-[96px] object-contain"
              style={{ left: x, top: y, transform: `translate(-50%,-50%) rotate(${k * 540}deg) scale(${1.4 - 0.7 * k})`, filter: 'drop-shadow(0 0 18px rgba(125,211,252,0.95))' }} />
          )
        })()}
        {flash.on && (
          <div className="absolute rounded-full border-[6px] border-sky-200"
            style={{ left: allyScreen.x, top: allyScreen.y, width: 40 + 320 * easeOut(flash.enter), height: 40 + 320 * easeOut(flash.enter), transform: 'translate(-50%,-50%)', opacity: 1 - flash.enter * 0.9 * (1 - flash.exit) - flash.exit, boxShadow: '0 0 60px rgba(125,211,252,0.9)' }} />
        )}
        {atkUp.on && (
          <div className={`absolute w-[430px] p-5 ${CARD}`} style={{ left: 760, top: 150, ...popStyle(atkUp) }}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-12 h-12 object-contain" />
              <div>
                <div className="text-[14px] text-gray-400">{T('ใส่เกียร์แล้ว', 'Equipped')}</div>
                <div className="text-[20px] font-black text-white">{gearName} +10</div>
              </div>
              <span className="ml-auto px-2.5 py-1 rounded-lg bg-amber-400 text-[16px] font-black text-[#1a1200]">+{(d.atkPct * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ICON.atk} alt="" className="w-8 h-8" />
              <span className="text-[17px] text-gray-300">{T('พลังโจมตี', 'ATK')}</span>
              <span className="ml-auto text-[34px] font-black text-amber-200 tabular-nums" style={{ textShadow: `0 0 ${12 + 12 * pulse(t, 3) * (t < 27.2 ? 1 : 0)}px rgba(251,191,36,0.7)` }}>
                {fmtInt(atkNow)}
              </span>
            </div>
            <div className="mt-1 text-right text-[14px] text-gray-400 tabular-nums" style={{ opacity: easeOut(prog(t, 27.2, 27.6)) }}>
              {fmtInt(d.atkBefore)} × {mult.toFixed(2)}
            </div>
          </div>
        )}

        {/* ── รอบ 2 ── */}
        <Banner t={t} start={28.6} end={32.2} title={T(`รอบที่ 2 · ใส่${gearName}`, `Round 2 · ${gearName}`)}
          sub={`ATK ${fmtInt(d.atkAfter)}`} color="bg-gradient-to-r from-amber-600/95 to-orange-600/95 border border-amber-200/40" />
        <DamagePop c={c} t={t} at={hitAfter} value={d.dmgAfter} big />

        {/* ── สรุป ── */}
        {sum.on && (
          <div className="absolute inset-0 bg-black/60" style={{ opacity: sum.alpha }}>
            <div className={`absolute left-1/2 top-1/2 w-[640px] -ml-[320px] -mt-[190px] p-7 ${CARD}`} style={popStyle(sum, 40)}>
              <div className="text-[15px] font-black text-amber-300 tracking-wider">{T('สรุป', 'Summary')}</div>
              <div className="text-[28px] font-black text-white leading-tight mt-1">
                {T('ดาเมจโจมตีปกติต่อครั้ง', 'Normal attack damage per hit')}
              </div>
              {[
                { label: T('ไม่ใส่เกียร์', 'No gear'), v: d.dmgBefore, cls: 'from-slate-500 to-slate-400', at: 32.9 },
                { label: `${gearName} +10`, v: d.dmgAfter, cls: 'from-amber-500 to-orange-400', at: 33.5 },
              ].map(r => (
                <div key={r.label} className="mt-5" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
                  <div className="flex justify-between text-[17px]">
                    <span className="text-gray-300">{r.label}</span>
                    <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
                  </div>
                  <div className="h-5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${(r.v / d.dmgAfter) * 100 * bar(r.at)}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-6 flex items-center justify-center gap-3" style={popStyle(span(t, 34.6, 38, 0.5, 0.6))}>
                <span className="text-[20px] text-gray-300">{T('แรงขึ้น', 'Stronger by')}</span>
                <span className="text-[48px] font-black text-amber-300 leading-none">×{(d.dmgAfter / d.dmgBefore).toFixed(2)}</span>
              </div>
              <div className="mt-3 text-center text-[13px] text-gray-500">
                {T('เลเวลเต็มทั้งสองฝั่ง · โจมตีปกติ · ไม่รวมคริติคอล/ธาตุ/ทักษะ', 'Both at max level · normal attack · no crit/element/skills')}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} />
}
