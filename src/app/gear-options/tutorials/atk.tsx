'use client'

// ====================================================
// วิดีโอสอน: พลังโจมตี (ATK) — ใช้อาวุธ "ร่มกันจันทรา" (eq_wpn_evt_057) +5
//
// เรื่องราว (เวลาตรงกับฉาก public/gear-options/scenes/atk.anme.json — id คิว atk_before / atk_after / skill_after):
//   0–7.5      ชื่อหัวข้อ → การ์ดเกียร์ ไฮไลท์ "พลังโจมตีรวม +444%"
//   7.5–12     ค่าพลังเรนเจอร์ของเรา (เลเวลเต็ม)                กล้องซูมตัวเรา
//   12–16      ค่าพลังเป้าหมาย (HP / DEF / ต้านสกิล)              กล้องแพนไปเป้าหมาย
//   16–20.8    สูตรโจมตีปกติ: ATK × K / (K + DEF), K = 18000
//   20.8–24.2  รอบ 1 ยังไม่ใส่เกียร์ — โจมตีปกติ
//   24.2–28    ใส่เกียร์ — ไอคอนบินเข้า + แสงจากเกียร์ (เรนเจอร์ไม่ใช้สกิล จะได้ไม่สับสนว่าแรงขึ้นจากอะไร)
//   28–31.6    รอบ 2 ใส่เกียร์ — โจมตีปกติ
//   31.6–36.8  สูตรสกิล: ATK × ความแรงสกิล × (1 − ต้านสกิล) — สกิลไม่โดนลดด้วย DEF
//   36.8–41.2  รอบ 3 ใส่เกียร์ — ร่ายสกิล 1
//   41.2–48    สรุป
//
// ตัวเลขทั้งหมดคำนวณสดจากข้อมูลชุดเดียวกับ Ranger Book / Gear Book (ไม่พิมพ์ตายตัว):
//   ค่าพลังเลเวลเต็ม = /data/ranger/stats/<id>.json → baseStats / rates / skills
//   ATK หลังใส่เกียร์ = aggregateGearBonuses + applyBonus (โลจิกเดียวกับ RangerStatPanel)
//   ค่าเกียร์ +5 = recalcGearEffects(ไฟล์ /data/gear/effects/<code>.json, 5) — ตัวเดียวกับสไลเดอร์ระดับในหน้าต่างเกียร์
//   (+5 = Basic เต็มแล้ว · ทดสอบแค่ค่า Basic จึงไม่ต้องตีถึง +10)
// ====================================================

import { useEffect, useState } from 'react'
import ScenePlayer, { type OverlayCtx } from '@/components/ScenePlayer'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch, DATA_BASE, gearEffectsFile, lericoProxy } from '@/lib/staticApi'
import { aggregateGearBonuses, applyBonus } from '@/lib/gearEffectParser'
import { recalcGearEffects } from '@/lib/gearLevelCalc'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { clamp01, countUp, easeInOut, easeOut, easeOutBack, fmtInt, popStyle, prog, pulse, span } from './anim'

const SCENE = '/gear-options/scenes/atk.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1353e-brown' }
const GEAR = 'eq_wpn_evt_057'
const GEAR_LEVEL = 5              // ระดับเกียร์ที่ใช้ทดสอบ (+5 = Basic เต็ม)
const GEAR_MAX = 10               // ระดับสูงสุดของเกียร์นี้ (หลอดบนการ์ด)
const SHOWN_SWITCHABLE = 'GEAR_ATTR_PRD_SPE_MUL_nm'   // ช่อง Switchable บนการ์ด (ตามภาพในเกม) — ไม่มีผลกับ ATK
const K = 18000                   // ค่าคงที่สูตรลดดาเมจจาก DEF

interface Skill { slot: string; code: string; name: string; description?: string; iconUrl?: string }
interface RangerStats {
  id: string
  imageUrl: string
  playerMaxLevel: number | null
  baseStats: { phyAtk: number; magAtk: number; phyDef: number; magDef: number; hp: number }
  rates: { skillResistance: number }
  skills: Skill[]
}

interface Data {
  ally: RangerStats
  enemy: RangerStats
  gear: GearEffects
  switchable: GearEffect | null
  atkBefore: number
  atkAfter: number
  atkPct: number
  enemyDef: number
  enemyRes: number        // ต้านสกิลของเป้าหมาย (0.3 = 30%)
  factor: number          // K / (K + DEF)
  dmgBefore: number
  dmgAfter: number
  skill: Skill
  skillMul: number        // 30 = ATK × 3000%
  dmgSkill: number
}

async function loadData(): Promise<Data> {
  const stats = (id: string) => apiFetch(`/api/meta/ranger-stats?id=${encodeURIComponent(id)}`).then(r => r.json() as Promise<RangerStats>)
  const [ally, enemy, fx] = await Promise.all([
    stats(ALLY.ranger), stats(ENEMY.ranger),
    fetch(`${DATA_BASE}/${gearEffectsFile(GEAR)}`).then(r => r.json() as Promise<Record<string, GearEffects>>),
  ])
  // ไฟล์ effects มีค่าการเติบโต (growth) ของแต่ละช่อง → คำนวณค่าที่ระดับ +5 ด้วยโลจิกเดียวกับหน้าต่างเกียร์
  const gear = recalcGearEffects(fx['5'], GEAR_LEVEL) as GearEffects
  // เหมือน Ranger Book: Overall ATK กระจายเข้าทั้ง phy และ mag · ใช้เฉพาะ Basic (Switchable ที่โชว์ไม่เกี่ยวกับ ATK)
  const b = aggregateGearBonuses([gear], [null])
  const s = ally.baseStats
  const atkBefore = s.phyAtk + s.magAtk
  const atkAfter = Math.round(applyBonus(s.phyAtk, b.phyAtk)) + Math.round(applyBonus(s.magAtk, b.magAtk))
  const enemyDef = enemy.baseStats.phyDef + enemy.baseStats.magDef
  const factor = K / (K + enemyDef)
  const enemyRes = enemy.rates.skillResistance ?? 0
  const skill = ally.skills.find(k => k.slot === 'skill1') ?? ally.skills[0]
  const mm = (skill.description ?? '').match(/ATK x ([\d.]+)%/)
  const skillMul = mm ? parseFloat(mm[1]) / 100 : 1
  const switchable = gear.switchable?.allEffects.find(e => e.effect.nameKey === SHOWN_SWITCHABLE)?.effect ?? null
  return {
    ally, enemy, gear, switchable,
    atkBefore, atkAfter, atkPct: b.magAtk?.pct ?? b.phyAtk?.pct ?? 0,
    enemyDef, enemyRes, factor,
    dmgBefore: Math.round(atkBefore * factor),
    dmgAfter: Math.round(atkAfter * factor),
    skill, skillMul,
    dmgSkill: Math.round(atkAfter * skillMul * (1 - enemyRes)),
  }
}

// ── ชิ้นส่วนหน้าตา (หน่วย = พิกเซลเวที 1280×720 — ตัวหนังสือใหญ่ไว้ ดูบนมือถือก็ยังอ่านได้) ──

const CARD = 'rounded-[22px] border-2 border-white/15 bg-[#0b1122]/92 shadow-[0_24px_70px_-10px_rgba(0,0,0,0.85)]'
const ICON = { atk: '/gacha/images/atk.png', hp: '/gacha/images/hp.png', def: '/gacha/images/def.png' }

/** กรอบไฮไลท์สีทองเต้นเป็นจังหวะ */
const glow = (t: number, on: boolean, hz = 1.4): React.CSSProperties => {
  if (!on) return {}
  const g = 0.5 + 0.5 * pulse(t, hz)
  return {
    background: `rgba(251,191,36,${0.14 + 0.12 * g})`,
    boxShadow: `0 0 0 3px rgba(251,191,36,${0.6 + 0.4 * g}), 0 0 ${24 + 18 * g}px rgba(251,191,36,${0.45 * g})`,
  }
}

function StatRow({ icon, label, value, hl, dim, t, note }: { icon?: string; label: string; value: string; hl?: boolean; dim?: boolean; t: number; note?: string }) {
  return (
    <div className="rounded-2xl px-4 py-2.5" style={{ ...glow(t, !!hl), opacity: dim ? 0.55 : 1 }}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {icon && <img src={icon} alt="" className="w-10 h-10 object-contain" />}
        <span className="text-[26px] text-gray-200 font-bold">{label}</span>
        <span className={`ml-auto text-[38px] font-black tabular-nums leading-none ${hl ? 'text-amber-200' : 'text-white'}`}>{value}</span>
      </div>
      {note && <div className="text-[18px] text-gray-400 mt-0.5 pl-[52px]">{note}</div>}
    </div>
  )
}

function RangerCard({ r, name, rows, s, x, y, tag, tagColor }: {
  r: RangerStats; name: string; rows: React.ReactNode; s: ReturnType<typeof span>
  x: number; y: number; tag: string; tagColor: string
}) {
  if (!s.on) return null
  return (
    <div className={`absolute w-[560px] p-5 ${CARD}`} style={{ left: x, top: y, ...popStyle(s, 34) }}>
      <div className="flex items-center gap-4 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lericoProxy(r.imageUrl)} alt="" crossOrigin="anonymous" className="w-[88px] h-[88px] rounded-2xl bg-white/5 object-contain" />
        <div className="min-w-0">
          <span className={`inline-block text-[18px] font-black px-3 py-0.5 rounded-lg ${tagColor}`}>{tag}</span>
          <div className="text-[32px] font-black text-white leading-tight truncate mt-1">{name}</div>
          <div className="text-[20px] text-cyan-300 font-black">Lv.{r.playerMaxLevel ?? 'MAX'} · MAX</div>
        </div>
      </div>
      <div className="space-y-2">{rows}</div>
    </div>
  )
}

function Banner({ t, start, end, title, sub, color }: { t: number; start: number; end: number; title: string; sub: string; color: string }) {
  const s = span(t, start, end, 0.4, 0.35)
  if (!s.on) return null
  const e = easeOut(s.enter)
  return (
    <div className="absolute left-1/2 top-[26px]" style={{ opacity: s.alpha, transform: `translateX(-50%) translateY(${(1 - e) * -50}px)` }}>
      <div className={`px-10 py-3 rounded-3xl text-center whitespace-nowrap ${color} shadow-[0_14px_44px_-8px_rgba(0,0,0,0.85)]`}>
        <div className="text-[38px] font-black text-white leading-tight">{title}</div>
        <div className="text-[24px] text-white/90 font-bold tabular-nums">{sub}</div>
      </div>
    </div>
  )
}

/** ตัวเลขดาเมจเด้งเหนือหัวเป้าหมาย ตรงเฟรมที่โดนจริง */
function DamagePop({ c, t, at, value, tone }: { c: OverlayCtx; t: number; at: number; value: number; tone: 'white' | 'orange' | 'purple' }) {
  const p = prog(t, at, at + 1.9)
  if (t < at || p >= 1) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 165 })
  const inS = easeOutBack(clamp01(p / 0.16))
  const fade = 1 - clamp01((p - 0.72) / 0.28)
  const style = {
    white: { cls: 'text-[70px] text-white', stroke: '3px #0f172a', shadow: '0 6px 16px rgba(0,0,0,0.85)' },
    orange: { cls: 'text-[86px] text-orange-300', stroke: '3px #7c2d12', shadow: '0 0 28px rgba(251,146,60,0.95)' },
    purple: { cls: 'text-[96px] text-fuchsia-200', stroke: '3px #4a044e', shadow: '0 0 34px rgba(217,70,239,0.95)' },
  }[tone]
  return (
    <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 330), 950), top: sp.y - 50 * easeOut(p), transform: `translate(-50%,-50%) scale(${0.4 + 0.6 * inS})`, opacity: fade }}>
      <div className={`font-black tabular-nums whitespace-nowrap ${style.cls}`} style={{ WebkitTextStroke: style.stroke, textShadow: style.shadow }}>
        -{fmtInt(value)}
      </div>
    </div>
  )
}

function HpBar({ c, t, d, hits, start, end }: { c: OverlayCtx; t: number; d: Data; hits: { at: number; dmg: number }[]; start: number; end: number }) {
  const s = span(t, start, end, 0.4, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 205 })
  const max = d.enemy.baseStats.hp
  // HP ลดทันทีตอนโดน (สีแดง) · แถบขาวไล่ตามช้าๆ ให้เห็นว่าหายไปเท่าไหร่
  let hp = max, ghost = max
  for (const h of hits) {
    if (t >= h.at) { ghost = hp - h.dmg * (1 - easeInOut(prog(t, h.at + 0.25, h.at + 0.9))); hp -= h.dmg }
  }
  hp = Math.max(0, hp)
  ghost = Math.max(hp, ghost)
  // เป้าหมายหลุดเฟรม (กล้องซูมตัวเราตอนใส่เกียร์) → ซ่อนหลอดไปด้วย ไม่ให้ไปทับการ์ดอื่น
  const inFrame = clamp01((1330 - sp.x) / 120) * clamp01((sp.x + 50) / 120)
    * (1 - span(t, 31.5, 36.9, 0.3, 0.3).alpha)   // หลบให้การ์ดสูตรสกิล
  if (inFrame <= 0) return null
  return (
    <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 200), 1080), top: sp.y, transform: 'translate(-50%,-100%)', opacity: s.alpha * inFrame }}>
      <div className="w-[330px] rounded-xl bg-black/75 p-2 border-2 border-white/15">
        <div className="relative h-5 rounded-md bg-slate-800 overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-white/85" style={{ width: `${(ghost / max) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-rose-400" style={{ width: `${(hp / max) * 100}%` }} />
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON.hp} alt="" className="w-6 h-6" />
          <span className="text-[22px] font-black text-white tabular-nums">{fmtInt(hp)}</span>
          <span className="text-[16px] text-gray-400 tabular-nums">/ {fmtInt(max)}</span>
        </div>
      </div>
    </div>
  )
}

// ── วิดีโอ ────────────────────────────────────────────

export default function AtkTutorial({ autoPlay }: { autoPlay: boolean }) {
  const { lang, t: tr, tGear, tRanger, tSkill } = useLanguage()
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
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const mult = 1 + d.atkPct
  const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    const hitBefore = c.hitsOf('atk_before')[0] ?? 21.8
    const hitAfter = c.hitsOf('atk_after')[0] ?? 29.2
    const hitSkill = c.hitsOf('skill_after')[0] ?? 38.0
    const hits = [{ at: hitBefore, dmg: d.dmgBefore }, { at: hitAfter, dmg: d.dmgAfter }, { at: hitSkill, dmg: d.dmgSkill }]
    const step = (a: number) => ({ opacity: easeOut(prog(t, a, a + 0.4)), transform: `translateX(${(1 - easeOut(prog(t, a, a + 0.4))) * -24}px)` })

    // ── 1. ฉากเปิด ──
    const dim = span(t, 0, 7.6, 0.01, 0.5)
    const title = span(t, 0.2, 2.4, 0.5, 0.4)
    const gear = span(t, 2.1, 7.4, 0.55, 0.4)
    const hl = t >= 3.8

    // ── 2–3. การ์ดเรนเจอร์ ──
    const allyCard = span(t, 8.2, 11.9)
    const enemyCard = span(t, 12.5, 15.9)

    // ── 4. สูตรโจมตีปกติ ──
    const formula = span(t, 16.4, 20.6, 0.5, 0.4)

    // ── 6. ใส่เกียร์ (เอฟเฟกต์ของเกียร์ล้วนๆ — เรนเจอร์ยืนเฉยๆ) ──
    const allyPos = c.actorAt(ALLY.actor)
    const allyScreen = allyPos ? c.project({ x: allyPos.x, y: allyPos.y - 95 }) : { x: 455, y: 380 }
    const fly = prog(t, 24.5, 25.25)
    const flash = span(t, 25.2, 26.1, 0.08, 0.7)
    const aura = span(t, 25.2, 27.9, 0.3, 0.6)
    const atkUp = span(t, 25.4, 27.9, 0.4, 0.35)
    const atkNow = countUp(t, 25.8, 27.1, d.atkBefore, d.atkAfter)

    // ── 8. สูตรสกิล ──
    const skillCard = span(t, 31.8, 36.7, 0.5, 0.4)

    // ── 9. K.O. ──
    const ko = span(t, hitSkill + 0.15, 41.2, 0.25, 0.4)

    // ── 10. สรุป ──
    const sum = span(t, 41.4, 48, 0.55, 0.6)
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const sumRows = [
      { label: T('โจมตีปกติ · ไม่ใส่เกียร์', 'Normal attack · no gear'), v: d.dmgBefore, cls: 'from-slate-500 to-slate-300', at: 42.0 },
      { label: T(`โจมตีปกติ · ${gearName}`, `Normal attack · ${gearName}`), v: d.dmgAfter, cls: 'from-amber-500 to-orange-300', at: 42.6 },
      { label: T(`สกิล ${skillName} · ${gearName}`, `Skill ${skillName} · ${gearName}`), v: d.dmgSkill, cls: 'from-fuchsia-600 to-purple-400', at: 43.2 },
    ]
    // แท่งกราฟใช้สเกล log — ดาเมจสกิลใหญ่กว่าโจมตีปกติหลายร้อยเท่า ถ้าใช้สเกลตรงแท่งเล็กจะมองไม่เห็นเลย
    const logW = (v: number) => (Math.log10(v) - 4) / (Math.log10(d.dmgSkill) - 4)

    return (
      <>
        {/* พื้นหลังมืดช่วงเปิด ให้การ์ดเด่น */}
        {dim.on && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,8,20,0.6),rgba(0,0,0,0.88))]" style={{ opacity: dim.alpha }} />}

        {/* หัวข้อ */}
        {title.on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={popStyle(title, 40)}>
            <div className="text-[28px] font-black tracking-[0.3em] text-amber-300/90">{T('ออพชั่นของอุปกรณ์', 'GEAR OPTION')}</div>
            <div className="text-[120px] font-black text-white leading-none mt-3 drop-shadow-[0_8px_30px_rgba(251,191,36,0.5)]">{T('พลังโจมตี', 'ATK')}</div>
            <div className="mt-5 h-[4px] bg-gradient-to-r from-transparent via-amber-300 to-transparent" style={{ width: 620 * easeOut(title.enter) }} />
          </div>
        )}

        {/* การ์ดเกียร์ (หน้าตาเดียวกับหน้าต่างเกียร์บนเว็บ) */}
        {gear.on && (
          <div className={`absolute left-[120px] top-[34px] w-[720px] p-6 ${CARD}`} style={popStyle(gear, 40)}>
            <div className="flex items-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-[110px] h-[110px] object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
              <div>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/gear_weapon.png" alt="" className="h-9" />
                  <span className="text-[24px] text-gray-300 font-bold">{T('อาวุธ', 'Weapon')}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/gacha/images/7star.png" alt="" className="h-8" />
                </div>
                <div className="text-[46px] font-black text-white leading-tight">{gearName}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 text-[22px]">
              <span className="text-gray-400 font-bold">{T('ค่าเกียร์ที่ระดับ', 'Gear level')}</span>
              <span className="text-amber-300 font-black">+{GEAR_LEVEL}</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 mt-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-300" style={{ width: `${(GEAR_LEVEL / GEAR_MAX) * 100 * easeOut(prog(t, 2.6, 3.4))}%` }} />
            </div>
            <div className="mt-4 rounded-2xl border-2 border-blue-400/30 bg-blue-500/10 p-3.5">
              <div className="text-[20px] font-black text-blue-200 tracking-wider mb-1.5 px-2">BASIC EFFECT</div>
              {d.gear.basic.map((e, i) => {
                const isAtk = i === 0
                const zoom = isAtk && hl ? 1 + 0.04 * easeOutBack(prog(t, 3.8, 4.25)) : 1
                return (
                  <div key={e.nameKey ?? e.name} className="relative flex items-center justify-between rounded-xl px-3 py-1.5"
                    style={isAtk && hl ? { transform: `scale(${zoom})`, ...glow(t, true, 1.6) } : { opacity: hl ? 0.5 : 1 }}>
                    <span className={`text-[28px] font-bold ${isAtk && hl ? 'text-amber-100' : 'text-blue-100'}`}>{effName(e)}</span>
                    <span className={`font-black tabular-nums ${isAtk && hl ? 'text-amber-200 text-[36px]' : 'text-white text-[28px]'}`}>{e.value}</span>
                    {/* ป้ายชี้ — ผูกกับแถวนี้เลย จึงตรงแถวเสมอ */}
                    {isAtk && hl && (
                      <div className="absolute left-full top-1/2 ml-6 flex items-center gap-2 whitespace-nowrap"
                        style={{ opacity: easeOut(prog(t, 4.1, 4.6)), transform: `translateY(-50%) translateX(${(1 - easeOut(prog(t, 4.1, 4.6))) * 40 + Math.sin(t * 5) * 6}px)` }}>
                        <span className="material-icons-round text-amber-300 text-[56px]">west</span>
                        <span className="px-4 py-2 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">{T('ทดสอบค่านี้', 'Testing this')}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {d.switchable && (
              <div className="mt-3 rounded-2xl border-2 border-orange-400/30 bg-orange-500/10 p-3.5" style={{ opacity: hl ? 0.5 : 1 }}>
                <div className="text-[20px] font-black text-orange-200 tracking-wider mb-1 px-2">SWITCHABLE EFFECT</div>
                <div className="flex items-center justify-between px-3">
                  <span className="text-[26px] font-bold text-orange-100">{effName(d.switchable)}</span>
                  <span className="text-[28px] font-black text-white tabular-nums">{d.switchable.value}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ค่าพลังเรนเจอร์ของเรา */}
        <RangerCard r={d.ally} name={allyName} s={allyCard} x={680} y={60}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.atkBefore)} hl />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.ally.baseStats.hp)} dim />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.ally.baseStats.phyDef + d.ally.baseStats.magDef)} dim />
            <div className="text-[20px] text-gray-400 pt-1 px-2">{T('ยังไม่ใส่เกียร์ · เลเวลเต็มทั้งสองฝั่ง', 'No gear yet · both at max level')}</div>
          </>} />

        {/* ค่าพลังเป้าหมาย — ใช้ทั้ง HP และ DEF (ต้านสกิลใช้ตอนโดนสกิล) */}
        <RangerCard r={d.enemy} name={enemyName} s={enemyCard} x={40} y={60}
          tag={T('เป้าหมาย', 'Target')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.enemy.baseStats.hp)} hl />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.enemyDef)} hl />
            <StatRow t={t} label={T('ต้านสกิล', 'Skill Resistance')} value={pct(d.enemyRes)} dim
              note={T('ใช้ตอนโดนสกิล (ดูท้ายคลิป)', 'Used against skills (see later)')} />
          </>} />

        {/* สูตรโจมตีปกติ */}
        {formula.on && (
          <div className={`absolute left-1/2 top-[40px] w-[820px] -ml-[410px] p-7 ${CARD}`} style={popStyle(formula, 36)}>
            <div className="text-[24px] font-black text-sky-300">{T('โจมตีปกติ: พลังป้องกันช่วยลดดาเมจ', 'Normal attack: DEF reduces damage')}</div>
            <div className="mt-3 flex items-center justify-center gap-4 text-white" style={step(16.7)}>
              <span className="text-[38px] font-black">{T('ดาเมจ', 'Damage')} = ATK ×</span>
              <span className="inline-flex flex-col items-center text-[36px] font-black leading-tight">
                <span className="px-3">K</span>
                <span className="w-full h-[3px] bg-white" />
                <span className="px-3">K + DEF</span>
              </span>
            </div>
            <div className="mt-4 space-y-2 text-[28px]">
              <div className="flex justify-between" style={step(17.4)}>
                <span className="text-gray-300 font-bold">K</span><span className="font-black text-white tabular-nums">{fmtInt(K)}</span>
              </div>
              <div className="flex justify-between" style={step(17.9)}>
                <span className="text-gray-300 font-bold">{T('DEF ของเป้าหมาย', 'Target DEF')}</span><span className="font-black text-rose-300 tabular-nums">{fmtInt(d.enemyDef)}</span>
              </div>
              <div style={step(18.4)}>
                <div className="flex justify-between">
                  <span className="text-gray-300 font-bold">{T('ดาเมจที่ทะลุเข้าไป', 'Damage that gets through')}</span>
                  <span className="font-black text-amber-300 tabular-nums">{(d.factor * 100).toFixed(2)}%</span>
                </div>
                <div className="h-4 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${d.factor * 100 * easeOut(prog(t, 18.6, 19.4))}%` }} />
                </div>
              </div>
              <div className="flex justify-between items-baseline pt-3 mt-1 border-t-2 border-white/10" style={step(19.3)}>
                <span className="text-gray-300 font-bold tabular-nums">{fmtInt(d.atkBefore)} × {(d.factor * 100).toFixed(2)}%</span>
                <span className="text-[40px] font-black text-white tabular-nums">= {fmtInt(d.dmgBefore)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── รอบ 1 ── */}
        <Banner t={t} start={20.8} end={24.2} title={T('รอบที่ 1 · ยังไม่ใส่เกียร์', 'Round 1 · No gear')}
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkBefore)}`} color="bg-gradient-to-r from-slate-700/95 to-slate-600/95 border-2 border-white/15" />
        <HpBar c={c} t={t} d={d} hits={hits} start={20.8} end={41.3} />
        <DamagePop c={c} t={t} at={hitBefore} value={d.dmgBefore} tone="white" />

        {/* ── ใส่เกียร์: ไอคอนบินเข้า + วงแสง + ออร่าทองจากเกียร์ ── */}
        {aura.on && (
          <div className="absolute rounded-full"
            style={{
              left: allyScreen.x, top: allyScreen.y + 30, width: 330, height: 330, transform: `translate(-50%,-50%) scale(${0.85 + 0.08 * pulse(t, 2)})`,
              opacity: aura.alpha * 0.9,
              background: 'radial-gradient(circle, rgba(253,224,71,0.55) 0%, rgba(251,191,36,0.25) 40%, rgba(251,191,36,0) 70%)',
            }} />
        )}
        {t >= 24.5 && fly < 1 && (() => {
          const k = easeInOut(fly)
          const x = 640 + (allyScreen.x - 640) * k
          const y = 70 + (allyScreen.y - 70) * k - Math.sin(k * Math.PI) * 80
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={gearIcon} alt="" crossOrigin="anonymous" className="absolute w-[130px] h-[130px] object-contain"
              style={{ left: x, top: y, transform: `translate(-50%,-50%) rotate(${k * 540}deg) scale(${1.5 - 0.8 * k})`, filter: 'drop-shadow(0 0 22px rgba(125,211,252,0.95))' }} />
          )
        })()}
        {flash.on && (
          <div className="absolute rounded-full border-[8px] border-sky-200"
            style={{ left: allyScreen.x, top: allyScreen.y, width: 50 + 420 * easeOut(flash.enter), height: 50 + 420 * easeOut(flash.enter), transform: 'translate(-50%,-50%)', opacity: (1 - flash.enter * 0.85) * (1 - flash.exit), boxShadow: '0 0 70px rgba(125,211,252,0.9)' }} />
        )}
        {atkUp.on && (
          <div className={`absolute w-[560px] p-6 ${CARD}`} style={{ left: 690, top: 90, ...popStyle(atkUp) }}>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-16 h-16 object-contain" />
              <div>
                <div className="text-[20px] text-gray-400 font-bold">{T('ใส่เกียร์แล้ว', 'Equipped')}</div>
                <div className="text-[30px] font-black text-white leading-tight">{gearName} +{GEAR_LEVEL}</div>
              </div>
              <span className="ml-auto px-3.5 py-1.5 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">+{(d.atkPct * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ICON.atk} alt="" className="w-11 h-11" />
              <span className="text-[26px] text-gray-200 font-bold">{T('พลังโจมตี', 'ATK')}</span>
              <span className="ml-auto text-[50px] font-black text-amber-200 tabular-nums leading-none" style={{ textShadow: `0 0 ${14 + 14 * pulse(t, 3) * (t < 27.1 ? 1 : 0)}px rgba(251,191,36,0.75)` }}>
                {fmtInt(atkNow)}
              </span>
            </div>
            <div className="mt-2 text-right text-[22px] text-gray-400 tabular-nums" style={{ opacity: easeOut(prog(t, 27.0, 27.4)) }}>
              {fmtInt(d.atkBefore)} × {mult.toFixed(2)}
            </div>
          </div>
        )}

        {/* ── รอบ 2 ── */}
        <Banner t={t} start={28.0} end={31.6} title={T(`รอบที่ 2 · ใส่${gearName}`, `Round 2 · ${gearName}`)}
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkAfter)}`} color="bg-gradient-to-r from-amber-600/95 to-orange-600/95 border-2 border-amber-200/40" />
        <DamagePop c={c} t={t} at={hitAfter} value={d.dmgAfter} tone="orange" />

        {/* ── สูตรสกิล: ไม่โดน DEF แต่โดนต้านสกิลแทน ── */}
        {skillCard.on && (
          <div className={`absolute left-1/2 top-[34px] w-[860px] -ml-[430px] p-7 ${CARD}`} style={popStyle(skillCard, 36)}>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.skill.iconUrl && <img src={lericoProxy(d.skill.iconUrl)} alt="" crossOrigin="anonymous" className="w-[76px] h-[76px] rounded-2xl" />}
              <div>
                <div className="text-[22px] font-black text-fuchsia-300">{T('สกิลโจมตี', 'Attack skill')}</div>
                <div className="text-[40px] font-black text-white leading-tight">{skillName}</div>
              </div>
              <span className="ml-auto px-4 py-1.5 rounded-xl bg-fuchsia-500/25 border-2 border-fuchsia-400/50 text-[30px] font-black text-fuchsia-100">ATK × {pct(d.skillMul)}</span>
            </div>
            <div className="mt-4 rounded-2xl bg-rose-500/10 border-2 border-rose-400/30 px-4 py-2.5 text-[24px] font-bold text-rose-100" style={step(32.4)}>
              {T('สกิลไม่โดนลดด้วยพลังป้องกัน (DEF) — ใช้ "ต้านสกิล" ของเป้าหมายลดแทน', 'Skills ignore DEF — the target\'s Skill Resistance reduces them instead')}
            </div>
            <div className="mt-4 flex items-center justify-center text-white text-[36px] font-black" style={step(33.0)}>
              {T('ดาเมจ', 'Damage')} = ATK × {pct(d.skillMul)} × (1 − {T('ต้านสกิล', 'Skill Res.')})
            </div>
            <div className="mt-4 space-y-2 text-[28px]">
              <div className="flex justify-between" style={step(33.6)}>
                <span className="text-gray-300 font-bold">{T('ATK (ใส่เกียร์แล้ว)', 'ATK (with gear)')}</span><span className="font-black text-amber-200 tabular-nums">{fmtInt(d.atkAfter)}</span>
              </div>
              <div className="flex justify-between" style={step(34.1)}>
                <span className="text-gray-300 font-bold">{T('ต้านสกิลของเป้าหมาย', 'Target Skill Resistance')}</span><span className="font-black text-rose-300 tabular-nums">{pct(d.enemyRes)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t-2 border-white/10" style={step(34.8)}>
                <span className="text-gray-300 font-bold tabular-nums">{fmtInt(d.atkAfter)} × {pct(d.skillMul)} × {pct(1 - d.enemyRes)}</span>
                <span className="text-[40px] font-black text-fuchsia-200 tabular-nums">= {fmtInt(d.dmgSkill)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── รอบ 3: สกิล ── */}
        <Banner t={t} start={36.8} end={41.2} title={T(`สกิล ${skillName}`, `Skill · ${skillName}`)}
          sub={`${T(`ใส่${gearName}`, gearName)} · ATK × ${pct(d.skillMul)}`} color="bg-gradient-to-r from-fuchsia-700/95 to-purple-700/95 border-2 border-fuchsia-200/40" />
        <DamagePop c={c} t={t} at={hitSkill} value={d.dmgSkill} tone="purple" />
        {ko.on && d.dmgBefore + d.dmgAfter + d.dmgSkill >= d.enemy.baseStats.hp && (() => {
          const pos = c.actorAt(ENEMY.actor)
          const sp = pos ? c.project({ x: pos.x, y: pos.y - 60 }) : { x: 820, y: 480 }
          return (
            <div className="absolute text-[110px] font-black text-red-500 leading-none"
              style={{ left: Math.min(sp.x, 1100), top: sp.y, transform: `translate(-50%,-50%) rotate(-8deg) scale(${0.5 + 0.5 * easeOutBack(ko.enter)})`, opacity: ko.alpha, WebkitTextStroke: '4px #fff', textShadow: '0 0 30px rgba(239,68,68,0.9)' }}>
              K.O.
            </div>
          )
        })()}

        {/* ── สรุป ── */}
        {sum.on && (
          <div className="absolute inset-0 bg-black/65" style={{ opacity: sum.alpha }}>
            <div className={`absolute left-1/2 top-1/2 w-[900px] -ml-[450px] -mt-[300px] p-8 ${CARD}`} style={popStyle(sum, 40)}>
              <div className="text-[24px] font-black text-amber-300">{T('สรุป', 'Summary')}</div>
              <div className="text-[40px] font-black text-white leading-tight">{T('ดาเมจต่อครั้ง (เป้าหมายเดียวกัน)', 'Damage per hit (same target)')}</div>
              {sumRows.map(r => (
                <div key={r.label} className="mt-5" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
                  <div className="flex justify-between text-[26px]">
                    <span className="text-gray-200 font-bold">{r.label}</span>
                    <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
                  </div>
                  <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${Math.max(3, logW(r.v) * 100) * bar(r.at)}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-6 grid grid-cols-2 gap-4" style={popStyle(span(t, 44.2, 48, 0.5, 0.6))}>
                <div className="rounded-2xl bg-amber-500/15 border-2 border-amber-400/40 p-3 text-center">
                  <div className="text-[22px] text-gray-300 font-bold">{T('โจมตีปกติ แรงขึ้น', 'Normal attack')}</div>
                  <div className="text-[52px] font-black text-amber-300 leading-none mt-1">×{(d.dmgAfter / d.dmgBefore).toFixed(2)}</div>
                </div>
                <div className="rounded-2xl bg-fuchsia-500/15 border-2 border-fuchsia-400/40 p-3 text-center">
                  <div className="text-[22px] text-gray-300 font-bold">{T('สกิล แรงขึ้น', 'Skill')}</div>
                  <div className="text-[52px] font-black text-fuchsia-300 leading-none mt-1">×{mult.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-4 text-center text-[18px] text-gray-500">
                {T('เลเวลเต็มทั้งสองฝั่ง · ไม่รวมคริติคอล / ธาตุ · กราฟใช้สเกล log', 'Both at max level · no crit / element · log-scale bars')}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return <ScenePlayer src={SCENE} autoPlay={autoPlay} overlay={overlay} />
}
