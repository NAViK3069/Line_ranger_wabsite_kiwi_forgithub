'use client'

// ====================================================
// วิดีโอสอน: พลังโจมตี (ATK) — ใช้อาวุธ "ร่มกันจันทรา" (eq_wpn_evt_057) +5
//
// เรื่องราว (เวลาตรงกับฉาก public/gear-options/scenes/atk.anme.json ที่สร้างจาก scripts/gear-options/build-atk-scene.cjs
//   — id คิว atk_before / skill_before / atk_after / skill_after · เลื่อนเวลาต้องแก้ทั้งสองไฟล์):
//   0–7.5      ชื่อหัวข้อ → การ์ดเกียร์ ไฮไลท์ "พลังโจมตีรวม +444%"
//   7.5–12     ค่าพลัง + ช่องเกียร์ของเรนเจอร์เรา (เลเวลเต็ม ยังว่าง)   กล้องซูมตัวเรา
//   12–16      ค่าพลัง + ช่องเกียร์ของเป้าหมาย (HP / DEF / ต้านสกิล)     กล้องแพนไปเป้าหมาย
//   16–20.8    สูตรโจมตีปกติ: ATK × K / (K + DEF), K = 18000
//   20.8–24.2  รอบ 1 ยังไม่ใส่เกียร์ — โจมตีปกติ (เป้าหมายเลือดเต็ม)
//   24.4–29.3  สูตรสกิล: ATK × ความแรงสกิล × (1 − ต้านสกิล) — สกิลไม่โดนลดด้วย DEF
//   29.3–34.8  รอบ 2 ยังไม่ใส่เกียร์ — ร่ายสกิล 1 → เป้าหมายตาย: knockback ค้างท่าสุดท้าย → จางหาย → วิญญาณลอยหาย
//   34.8–38.7  ใส่เกียร์ — ไอคอนบินเข้าช่องอาวุธ + แสงหลังเรนเจอร์ (icon_ab_light_eff2 อยู่ในฉาก) · เรนเจอร์ไม่ใช้สกิล
//              (เป้าหมายกลับมาตอนกล้องซูมตัวเราอยู่)
//   38.7–42.3  รอบ 3 ใส่เกียร์ — โจมตีปกติ (รีเลือดเป้าหมายก่อน)
//   42.4–47.8  รอบ 4 ใส่เกียร์ — ร่ายสกิล 1 → เป้าหมายตาย
//   48–55      สรุป
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
import { AtlasSprite, frameBBox, SamSprite } from './sam'
import { assets, type RangerRuntime } from '@/anme/engine/assets'

const SCENE = '/gear-options/scenes/atk.anme.json'
const ALLY = { actor: 'ak1zzx9ceu', ranger: 'u1260e-brown' }
const ENEMY = { actor: 'a9ijjdi134', ranger: 'u1242e-brown' }   // เปลี่ยนตัว → แก้ ENEMY_RANGER ใน build-atk-scene.cjs ด้วย
const GEAR = 'eq_wpn_evt_057'
const GEAR_LEVEL = 5              // ระดับเกียร์ที่ใช้ทดสอบ (+5 = Basic เต็ม)
const GEAR_MAX = 10               // ระดับสูงสุดของเกียร์นี้ (หลอดบนการ์ด)
const SHOWN_SWITCHABLE = 'GEAR_ATTR_PRD_SPE_MUL_nm'   // ช่อง Switchable บนการ์ด (ตามภาพในเกม) — ไม่มีผลกับ ATK
const K = 18000                   // ค่าคงที่สูตรลดดาเมจจาก DEF
const FPS = 30
/** เวลาในวิดีโอ — ต้องตรงกับฉาก (scripts/gear-options/build-atk-scene.cjs → const T) */
const TL = {
  /** รีเลือดเป้าหมายก่อนตีแต่ละรอบ (รอบ 1–4) */
  refill: [20.9, 29.45, 38.85, 42.65],
  /** จังหวะโดนของแต่ละรอบ ถ้ายังหาจากไทม์ไลน์ไม่ได้ */
  hitFallback: [22.32, 31.333, 40.42, 44.433],
  skillCard: [24.4, 29.3] as const,
  equip: 35.95,
  summary: 48.0,
  end: 55,
}
/** ตายแล้ว (นับจากจังหวะโดน): knockback → ค้างท่าสุดท้าย → ร่างจางหาย 1.4–1.55 (อยู่ในฉาก) · วิญญาณออกจากร่าง + เสียงตายตอน soul */
const DEATH = { soul: 1.4, soulDur: 1.9 }

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
  enemyRes: number
  factor: number
  dmgBefore: number
  dmgAfter: number
  skill: Skill
  skillMul: number
  dmgSkillBefore: number
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
    dmgSkillBefore: Math.round(atkBefore * skillMul * (1 - enemyRes)),
    dmgSkill: Math.round(atkAfter * skillMul * (1 - enemyRes)),
  }
}

// ── ชิ้นส่วนหน้าตา (หน่วย = พิกเซลเวที 1280×720 — ตัวหนังสือใหญ่ไว้ ดูบนมือถือก็ยังอ่านได้) ──

/** ผสมสีทีละนิดตามเวลา (k 0→1) — ไม่ให้สีตัวหนังสือเปลี่ยนแบบกระพริบทีเดียว */
type RGB = readonly [number, number, number]
const mix = (a: RGB, b: RGB, k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(k))).join(',')})`
const C = { white: [255, 255, 255], amber100: [254, 243, 199], amber200: [253, 230, 138], blue100: [219, 234, 254] } as const

const CARD = 'rounded-[22px] border-2 border-white/15 bg-[#0b1122] shadow-[0_24px_70px_-10px_rgba(0,0,0,0.9)]'
const ICON = { atk: '/gacha/images/atk.png', hp: '/gacha/images/hp.png', def: '/gacha/images/def.png' }

/**
 * ไฮไลท์แบบ "โหลด": เส้นแสงวิ่งรอบกรอบ 0 → 100% (มีหัวแสงสว่างนำ) แล้วค่อยเป็นกรอบทองเต้นจังหวะปกติ
 * ใช้ครอบแถวที่ต้องการเน้น · at = วินาทีที่เริ่มวิ่ง
 */
/** ขนาดเส้นกรอบ SVG — ตั้งผ่าน CSS (calc ในแอตทริบิวต์ width/height ของ SVG ใช้ไม่ได้ทุกเบราว์เซอร์) */
const RECT: React.CSSProperties = { width: 'calc(100% - 3px)', height: 'calc(100% - 3px)' }

function Highlight({ t, at, dur = 0.9, radius = 16, children, className = '' }: {
  t: number; at: number | null; dur?: number; radius?: number; children: React.ReactNode; className?: string
}) {
  const on = at != null && t >= at
  const p = on ? easeInOut(prog(t, at!, at! + dur)) : 0
  const settle = on ? easeOut(prog(t, at! + dur * 0.85, at! + dur + 0.35)) : 0
  const g = 0.5 + 0.5 * pulse(t, 1.4)
  return (
    <div className={`relative rounded-2xl ${className}`}
      style={settle > 0 ? {
        background: `rgba(251,191,36,${(0.12 + 0.1 * g) * settle})`,
        boxShadow: `0 0 0 3px rgba(251,191,36,${(0.55 + 0.4 * g) * settle}), 0 0 ${26 + 16 * g}px rgba(251,191,36,${0.45 * g * settle})`,
      } : undefined}>
      {children}
      {on && p < 1 && (
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
          <rect x="1.5" y="1.5" rx={radius} pathLength={100}
            fill="none" stroke="rgba(253,224,71,0.95)" strokeWidth="3.5" strokeDasharray={`${p * 100} 100`} strokeLinecap="round" style={RECT} />
          {/* หัวแสงวิ่งนำ */}
          <rect x="1.5" y="1.5" rx={radius} pathLength={100}
            fill="none" stroke="#fff" strokeWidth="6" strokeDasharray="3 97" strokeDashoffset={-(p * 100 - 3)} strokeLinecap="round"
            style={{ ...RECT, filter: 'drop-shadow(0 0 8px #fde047) drop-shadow(0 0 16px #f59e0b)' }} />
        </svg>
      )}
    </div>
  )
}

function StatRow({ icon, label, value, hlAt, dim, t, note }: { icon?: string; label: string; value: string; hlAt?: number; dim?: boolean; t: number; note?: string }) {
  const k = hlAt != null ? easeInOut(prog(t, hlAt, hlAt + 0.5)) : 0
  return (
    <Highlight t={t} at={hlAt ?? null} className="px-4 py-2.5">
      <div style={{ opacity: dim ? 0.55 : 1 }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {icon && <img src={icon} alt="" className="w-10 h-10 object-contain" />}
          <span className="text-[26px] text-gray-200 font-bold">{label}</span>
          <span className="ml-auto text-[38px] font-black tabular-nums leading-none" style={{ color: mix(C.white, C.amber200, k) }}>{value}</span>
        </div>
        {note && <div className="text-[18px] text-gray-400 mt-0.5 pl-[52px]">{note}</div>}
      </div>
    </Highlight>
  )
}

/**
 * หลอดดาเมจ: เริ่มเต็ม 100% → ส่วนที่ถูกลด (สีเทาลายทาง) กินเข้ามาจากขวา เหลือส่วนสีที่ยังเหลืออยู่
 *   keep = สัดส่วนดาเมจที่เหลือ (0–1) · ป้ายใต้หลอด: ซ้าย = ที่เหลือ · ขวา = ที่ถูกลดไป
 */
function DamageBar({ t, at, keep, keepCls, keepText, keepLabel, cutLabel }: {
  t: number; at: number; keep: number; keepCls: string; keepText: string; keepLabel: string; cutLabel: string
}) {
  const k = easeInOut(prog(t, at, at + 0.9))
  const cut = (1 - keep) * k
  const pctTxt = (v: number) => `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`
  return (
    <div>
      <div className="relative h-6 rounded-full bg-white/10 overflow-hidden ring-1 ring-black/50">
        <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${keepCls}`} style={{ width: `${(1 - cut) * 100}%` }} />
        <div className="absolute inset-y-0 right-0 bg-slate-600"
          style={{ width: `${cut * 100}%`, backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.10) 0 8px, transparent 8px 16px)' }} />
      </div>
      <div className="flex justify-between mt-1.5 text-[22px] font-bold tabular-nums" style={{ opacity: easeOut(prog(t, at + 0.5, at + 0.9)) }}>
        <span className={keepText}>■ {keepLabel} {pctTxt(keep)}</span>
        <span className="text-slate-400">{cutLabel} {pctTxt(1 - keep)} ■</span>
      </div>
    </div>
  )
}

// ── ช่องเกียร์ (res/gear_main) — กรอบ fx70-gear-slot + ป้ายบอกชนิดช่อง ──
const SLOT_KINDS = [
  { key: 'weapon', th: 'อาวุธ', en: 'Weapon' },
  { key: 'armor', th: 'เกราะ', en: 'Armor' },
  { key: 'acc', th: 'ของตกแต่ง', en: 'Accessory' },
] as const
const SLOT_W = 150    // ระยะห่างต่อช่องในแถว
/** กรอบช่องเรืองแสงสีส้มใน atlas ของ fx70-gear-slot (11 เฟรม) — เล่นครั้งเดียวตอนใส่เกียร์ */
const SLOT_GLOW = ['', '_2', '_3', '_4', '_5', '_6', '_7', '_8', '_9', '_10', '_11'].map(s => `fx70-gear-slot_106x112${s}.png`)

/**
 * แถวช่องเกียร์ 3 ช่อง (หน้าตาแบบในเกม) · equip = ใส่ของลงช่องอาวุธตอนเวลา at → กรอบเรืองแสงส้มวูบเดียว (เฟรมจาก fx70-gear-slot) + แสงวาบ
 *   กรอบช่อง = gear_main_slot_bg · ป้ายทองแดงทับขอบบน = gear_main_slot_plate_bg + ไอคอนชนิดช่อง (ไม่มีข้อความ)
 *   ช่องว่าง = ไอคอนมืดแบบสลัก · ช่องที่ใส่ของแล้ว = ไอคอน _on เรืองแสง
 */
const SLOT_Y = 76     // กึ่งกลางกรอบช่องในแถว
const GLOW_FPS = 16
function GearSlots({ t, equip }: { t: number; equip?: { at: number; icon: string } }) {
  return (
    <div className="relative mx-auto" style={{ width: SLOT_W * 3, height: 140 }}>
      {SLOT_KINDS.map((k, i) => {
        const cx = SLOT_W * i + SLOT_W / 2
        const eq = k.key === 'weapon' && equip && t >= equip.at ? equip : null
        // แสงช่องเล่นครั้งเดียว (ไม่วน) แล้วจางลงเหลือกรอบช่องปกติ
        const gi = eq ? Math.floor((t - eq.at) * GLOW_FPS) : -1
        const glowFrame = eq && gi < SLOT_GLOW.length ? SLOT_GLOW[gi] : null
        const glowAlpha = 1 - prog(gi, SLOT_GLOW.length - 4, SLOT_GLOW.length)
        const burst = eq ? 1 - prog(t, eq.at, eq.at + 0.5) : 0
        const pop = eq ? easeOutBack(prog(t, eq.at + 0.15, eq.at + 0.55)) : 0
        return (
          <div key={k.key}>
            {/* กรอบช่อง = gear_main_slot_bg ของเกม · ตอนของลงช่อง = กรอบเรืองแสงส้มของ fx70 วูบเดียว + แสงวาบ */}
            <AtlasSprite atlas="gear_main/gear_common" name="gear_main_slot_bg.png" x={cx} y={SLOT_Y} scale={0.9} />
            {glowFrame && <AtlasSprite atlas="gear_main/fx70-gear-slot" name={glowFrame} x={cx} y={SLOT_Y} scale={1.05} alpha={glowAlpha} />}
            {burst > 0 && (
              <div className="absolute rounded-full" style={{
                left: cx, top: SLOT_Y, width: 60 + 160 * (1 - burst), height: 60 + 160 * (1 - burst), transform: 'translate(-50%,-50%)',
                opacity: burst, background: 'radial-gradient(circle, rgba(255,247,200,0.95), rgba(251,191,36,0.5) 45%, rgba(251,191,36,0) 70%)',
              }} />
            )}
            {eq && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={eq.icon} alt="" crossOrigin="anonymous" className="absolute w-[76px] h-[76px] object-contain"
                style={{ left: cx - 38, top: SLOT_Y + 6 - 38, transform: `scale(${pop})`, filter: 'drop-shadow(0 0 10px rgba(253,224,71,0.8))' }} />
            )}
            {/* ป้ายทองแดงทับขอบบนของกรอบ + ไอคอนชนิดช่อง */}
            <AtlasSprite atlas="gear_main/gear_common" name="gear_main_slot_plate_bg.png" x={cx} y={SLOT_Y - 52} scale={1.05} />
            <AtlasSprite atlas="gear_main/gear_common" name={`gear_main_slot_icon_${k.key}_on.png`} x={cx} y={SLOT_Y - 53} scale={0.42}
              style={eq ? { filter: 'drop-shadow(0 0 6px rgba(253,224,71,0.9))' } : { filter: 'brightness(0.18) contrast(1.4)', opacity: 0.85 }} />
          </div>
        )
      })}
    </div>
  )
}

function RangerCard({ r, name, rows, s, x, y, tag, tagColor, slots }: {
  r: RangerStats; name: string; rows: React.ReactNode; s: ReturnType<typeof span>
  x: number; y: number; tag: string; tagColor: string; slots: React.ReactNode
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
      <div className="mt-3 pt-3 border-t-2 border-white/10">{slots}</div>
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

/**
 * หลอดเลือดเป้าหมาย
 *   รีเลือด (TL.refill) หลอดแดงวิ่งเต็มจากซ้ายไปขวา + แสงเขียววาบ (รอบที่แล้วตาย = หลอดค่อยๆ โผล่กลับมาพร้อมรีเลือด)
 *   โดนตี             หลอดขาวค้างที่ค่าเดิม · หลอดแดงไหลลง · ค้างสักพักหลอดขาวค่อยหดตาม · หลอดสั่น + แสงวาบ
 *   ตัวเลขดาเมจ       ป้ายแดงเด้งขึ้นบนหลอด ค้างไว้จนรีเลือดรอบถัดไป
 *   ตาย (ดาเมจ ≥ HP)  หลอดจางหายให้วิญญาณลอยผ่าน จนกว่าจะรีเลือดรอบถัดไป
 */
type Round = { refill: number; at: number; dmg: number }
function HpBar({ c, t, d, rounds }: { c: OverlayCtx; t: number; d: Data; rounds: Round[] }) {
  const s = span(t, rounds[0].refill - 0.1, TL.summary, 0.35, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(ENEMY.actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 205 })
  const max = d.enemy.baseStats.hp
  // รอบปัจจุบัน = รีเลือดล่าสุดที่ผ่านมา · ตีที่อยู่หลังรีเลือดนั้น
  const round = rounds.reduce((r, x, i) => (t >= x.refill ? i : r), 0)
  const cur = rounds[round]
  const prev = rounds[round - 1]
  const prevDead = !!prev && prev.dmg >= max
  const dead = cur.dmg >= max ? prog(t, cur.at + 0.85, cur.at + 1.15) : 0
  const back = prevDead ? prog(t, cur.refill - 0.05, cur.refill + 0.3) : 1
  // เป้าหมายหลุดเฟรม (กล้องซูมตัวเรา) / มีการ์ดสูตรสกิลบังอยู่ / ตายแล้ว → ซ่อน
  const vis = s.alpha * clamp01((1330 - sp.x) / 120) * clamp01((sp.x + 50) / 120)
    * (1 - span(t, TL.skillCard[0] - 0.1, TL.skillCard[1] + 0.1, 0.3, 0.3).alpha) * (1 - dead) * back
  if (vis <= 0) return null

  const prevLeft = prev ? Math.max(0, max - prev.dmg) : 0
  const refill = easeInOut(prog(t, cur.refill, cur.refill + 0.6))
  let red = prevLeft + (max - prevLeft) * refill
  let white = red
  let shake = 0, flash = 0
  if (t >= cur.at) {
    const after = Math.max(0, max - cur.dmg)
    red = max - (max - after) * easeOut(prog(t, cur.at, cur.at + 0.45))
    white = max - (max - after) * easeInOut(prog(t, cur.at + 0.75, cur.at + 1.15))
    const k = 1 - prog(t, cur.at, cur.at + 0.3)
    shake = Math.sin((t - cur.at) * 70) * 7 * k
    flash = k
  }
  const refillGlow = t >= cur.refill ? 1 - prog(t, cur.refill + 0.35, cur.refill + 0.9) : 0
  const dmgOn = t >= cur.at
  const pop = dmgOn ? easeOutBack(prog(t, cur.at, cur.at + 0.3)) : 0
  const W = 360
  return (
    <div className="absolute" style={{ left: Math.min(Math.max(sp.x, 220), 1060), top: sp.y, transform: `translate(calc(-50% + ${shake}px),-100%)`, opacity: vis }}>
      {dmgOn && (
        <div className="absolute right-0 -top-[46px] px-3 py-1 rounded-xl bg-red-600 border-2 border-red-300/70 text-[26px] font-black text-white tabular-nums whitespace-nowrap shadow-[0_6px_18px_rgba(220,38,38,0.55)]"
          style={{ transform: `translateY(${(1 - pop) * 14}px) scale(${0.7 + 0.3 * pop})`, transformOrigin: 'right bottom', opacity: clamp01(pop * 1.5) }}>
          -{fmtInt(cur.dmg)}
        </div>
      )}
      <div className="rounded-2xl bg-[#0b1122] p-2.5 border-2 border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.7)]" style={{ width: W }}>
        <div className="relative h-6 rounded-lg bg-slate-800 overflow-hidden ring-1 ring-black/60">
          <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${(white / max) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 bg-gradient-to-b from-rose-400 via-red-500 to-red-700" style={{ width: `${(red / max) * 100}%` }}>
            <div className="absolute inset-x-0 top-0 h-1/3 bg-white/25" />
          </div>
          {refillGlow > 0 && <div className="absolute inset-0 bg-emerald-300 mix-blend-screen" style={{ opacity: 0.45 * refillGlow }} />}
          {flash > 0 && <div className="absolute inset-0 bg-white" style={{ opacity: 0.55 * flash }} />}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON.hp} alt="" className="w-7 h-7" />
          <span className="text-[24px] font-black text-white tabular-nums">{fmtInt(red)}</span>
          <span className="text-[18px] text-gray-400 tabular-nums">/ {fmtInt(max)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * เอฟเฟกต์ฮิลเลือดที่ตัวเป้าหมาย (เล่นตอนรีเลือดแต่ละรอบ ~1.4 วิ)
 *   วงแสงรอบเท้า + เสาแสงเขียวที่ขอบล่างโค้งรับรอบตัว (ทรงกระบอก) · แสงเขียวอาบตัว · เครื่องหมาย + ลอยขึ้นรอบตัว (ตำแหน่ง/จังหวะสุ่มแบบคงที่ เลื่อนเวลากลับมาดูก็เหมือนเดิม)
 */
const HEAL_DUR = 1.4
const rand = (i: number) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v) }
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  x: (rand(i) - 0.5) * 130, delay: rand(i + 50) * 0.55, rise: 70 + rand(i + 100) * 60, size: 20 + rand(i + 150) * 16, y0: rand(i + 200) * 40,
}))
function HealFx({ c, t, at }: { c: OverlayCtx; t: number; at: number }) {
  const u = t - at
  if (u < 0 || u > HEAL_DUR) return null
  const p = c.actorAt(ENEMY.actor)
  if (!p) return null
  const feet = c.project(p)
  if (feet.x < -150 || feet.x > 1430) return null
  const z = (c.project({ x: p.x + 100, y: p.y }).x - feet.x) / 100
  const glow = clamp01(u / 0.15) * (1 - prog(u, 0.55, 1.05))
  // ฐานแสง = วงรีรอบเท้า · เสาแสงกว้างเท่าวง ขอบล่างโค้งตามครึ่งหน้าของวง (เหมือนทรงกระบอกครอบตัว)
  const ringW = 200 * z * (0.65 + 0.35 * easeOut(prog(u, 0, 0.5)))
  const ringH = ringW * 0.3
  const colH = 260 * z * easeOut(prog(u, 0, 0.3))
  const line = Math.max(2, 4 * z)
  const arc = `0 0 ${ringW / 2}px ${ringW / 2}px / 0 0 ${ringH / 2}px ${ringH / 2}px`
  return (
    <>
      {/* แสงเขียวอาบตัว */}
      <div className="absolute rounded-full pointer-events-none" style={{
        left: feet.x, top: feet.y - 85 * z, width: 230 * z, height: 260 * z, transform: 'translate(-50%,-50%)', opacity: glow,
        background: 'radial-gradient(ellipse, rgba(134,239,172,0.45), rgba(74,222,128,0.18) 45%, rgba(74,222,128,0) 70%)',
      }} />
      {/* วงแสงที่พื้น (ครึ่งหลัง — อยู่หลังเท้า) */}
      <div className="absolute rounded-[50%] pointer-events-none" style={{
        left: feet.x, top: feet.y, width: ringW, height: ringH, transform: 'translate(-50%,-50%)', opacity: glow,
        border: `${line}px solid rgba(187,247,208,0.8)`, boxShadow: '0 0 16px rgba(74,222,128,0.8)',
        background: 'radial-gradient(ellipse, rgba(74,222,128,0.4), rgba(74,222,128,0) 70%)',
      }} />
      {/* เสาแสงพุ่งขึ้น — ขอบล่างโค้งรับรอบตัวเรนเจอร์ + เส้นแสงตามขอบโค้ง */}
      <div className="absolute pointer-events-none" style={{
        left: feet.x - ringW / 2, top: feet.y + ringH / 2 - colH, width: ringW, height: colH, opacity: glow * 0.6,
        borderRadius: arc, background: 'linear-gradient(to top, rgba(187,247,208,0.7), rgba(134,239,172,0.3) 50%, rgba(134,239,172,0))',
      }} />
      <div className="absolute pointer-events-none" style={{
        left: feet.x - ringW / 2, top: feet.y + ringH / 2 - colH, width: ringW, height: colH, opacity: glow,
        borderRadius: arc, borderBottom: `${line * 1.3}px solid rgba(220,252,231,0.95)`,
        filter: 'drop-shadow(0 0 6px #4ade80) drop-shadow(0 0 12px #22c55e)',
      }} />
      {/* + ลอยขึ้นรอบตัว (ระดับลำตัว) */}
      {SPARKS.map((k, i) => {
        const q = prog(u, k.delay, k.delay + 0.75)
        if (q <= 0 || q >= 1) return null
        const sp = c.project({ x: p.x + k.x, y: p.y + 5 - k.y0 - k.rise * easeOut(q) })
        return (
          <span key={i} className="absolute font-black leading-none pointer-events-none" style={{
            left: sp.x, top: sp.y, transform: `translate(-50%,-50%) scale(${0.6 + 0.6 * Math.sin(q * Math.PI)})`,
            fontSize: k.size * z, color: '#dcfce7', opacity: Math.min(1, q * 6) * (1 - prog(q, 0.6, 1)),
            textShadow: '0 0 6px #4ade80, 0 0 14px #22c55e',
          }}>+</span>
        )
      })}
    </>
  )
}

/**
 * จุดที่วิญญาณออกจากร่าง = กลางร่างในเฟรมสุดท้ายของท่า knockback (ร่างล้มนอนอยู่ ไม่ใช่ท่ายืน)
 * คำนวณจากไฟล์ .sam จริงของเป้าหมาย แปลงเป็นพิกัดเวทีแบบเดียวกับที่ฉากวาดตัวละคร (จุดยืน · สเกล · กลับด้าน)
 */
const fallenCache = new WeakMap<RangerRuntime, { x: number; y: number } | null>()
function fallenCenter(c: OverlayCtx): { x: number; y: number; scale: number } | null {
  const a = c.scene.actors.find(x => x.id === ENEMY.actor)
  const rt = a && assets.get(a.assetId)
  const p = c.actorAt(ENEMY.actor)
  if (!a || !p || rt?.kind !== 'ranger') return null
  if (!fallenCache.has(rt)) {
    const n = rt.sam.animations['knockback']?.length ?? 0
    const box = n ? frameBBox(rt.sam, rt.sprites, 'knockback', n - 1) : null
    fallenCache.set(rt, box ? { x: (box.x0 + box.x1) / 2 - rt.stand.x, y: (box.y0 + box.y1) / 2 - rt.stand.y } : null)
  }
  const off = fallenCache.get(rt) ?? { x: 0, y: -60 }
  return { x: p.x + (a.flip ? -off.x : off.x) * a.scale, y: p.y + off.y * a.scale, scale: a.scale }
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
  const enemyName = tRanger(ENEMY.ranger, 'Executor Anubis Brown')
  const skillName = tSkill(d.skill.code, d.skill.name)
  const effName = (e: GearEffect) => (e.nameKey ? tr('equip', e.nameKey, e.name) : e.name)
  const mult = 1 + d.atkPct
  const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

  const overlay = (c: OverlayCtx) => {
    const t = c.t
    // 4 รอบ: โจมตีปกติ / สกิล × ไม่ใส่เกียร์ / ใส่เกียร์
    const rounds: Round[] = (['atk_before', 'skill_before', 'atk_after', 'skill_after'] as const).map((id, i) => ({
      refill: TL.refill[i],
      at: c.hitsOf(id)[0] ?? TL.hitFallback[i],
      dmg: [d.dmgBefore, d.dmgSkillBefore, d.dmgAfter, d.dmgSkill][i],
    }))
    const step = (a: number) => ({ opacity: easeOut(prog(t, a, a + 0.4)), transform: `translateX(${(1 - easeOut(prog(t, a, a + 0.4))) * -24}px)` })

    // ── 1. ฉากเปิด ──
    const dim = span(t, 0, 7.6, 0.01, 0.5)
    const title = span(t, 0.2, 2.4, 0.5, 0.4)
    const gear = span(t, 2.1, 7.4, 0.55, 0.4)
    const hl = t >= 3.8
    const hlK = easeInOut(prog(t, 3.8, 4.4))   // แถวอื่นค่อยๆ มืด · แถว ATK ค่อยๆ ขยาย (ไม่เด้งทีเดียว)

    // ── 2–3. การ์ดเรนเจอร์ ──
    const allyCard = span(t, 8.2, 11.9)
    const enemyCard = span(t, 12.5, 15.9)

    // ── 4. สูตรโจมตีปกติ ──
    const formula = span(t, 16.4, 20.6, 0.5, 0.4)

    // ── 6. ใส่เกียร์: ไอคอนบินเข้าช่องอาวุธบนการ์ด (แสงหลังเรนเจอร์อยู่ในฉากแล้ว) ──
    const EQ_CARD = { x: 690, y: 70 }
    const EQ_AT = TL.equip
    const equipCard = span(t, EQ_AT - 0.9, EQ_AT + 2.7, 0.4, 0.35)
    const slotTarget = { x: EQ_CARD.x + 24 + (560 - 48 - SLOT_W * 3) / 2 + SLOT_W / 2, y: EQ_CARD.y + 236 + SLOT_Y }
    const fly = prog(t, EQ_AT - 0.65, EQ_AT)
    const atkNow = countUp(t, EQ_AT + 0.55, EQ_AT + 1.85, d.atkBefore, d.atkAfter)

    // ── 5. สูตรสกิล (ก่อนร่ายสกิลรอบแรก) ──
    const skillCard = span(t, TL.skillCard[0], TL.skillCard[1], 0.5, 0.4)
    const sk = TL.skillCard[0]

    // ── เป้าหมายตาย: knockback ค้างท่าสุดท้าย → ร่างจางหาย (ในฉาก) → วิญญาณ eff_die_enemy ลอยออกจากร่างแล้วจางหาย ──
    const fallen = fallenCenter(c)
    const zoom = (c.project({ x: 100, y: 0 }).x - c.project({ x: 0, y: 0 }).x) / 100

    // ── สรุป ──
    const S = TL.summary
    const sum = span(t, S, TL.end, 0.55, 0.6)
    const bar = (a: number) => easeOut(prog(t, a, a + 0.9))
    const sumRows = [
      { label: T('โจมตีปกติ · ไม่ใส่เกียร์', 'Normal attack · no gear'), v: d.dmgBefore, cls: 'from-slate-500 to-slate-300', at: S + 0.6 },
      { label: T(`โจมตีปกติ · ${gearName}`, `Normal attack · ${gearName}`), v: d.dmgAfter, cls: 'from-amber-500 to-orange-300', at: S + 1.1 },
      { label: T(`สกิล ${skillName} · ไม่ใส่เกียร์`, `Skill ${skillName} · no gear`), v: d.dmgSkillBefore, cls: 'from-fuchsia-900 to-fuchsia-500', at: S + 1.6 },
      { label: T(`สกิล ${skillName} · ${gearName}`, `Skill ${skillName} · ${gearName}`), v: d.dmgSkill, cls: 'from-fuchsia-600 to-purple-400', at: S + 2.1 },
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
            <div className={`text-[30px] font-black text-amber-300/90 ${lang === 'th' ? 'tracking-normal' : 'tracking-[0.3em]'}`}>{T('ออพชั่นของอุปกรณ์', 'GEAR OPTION')}</div>
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
            <div className="mt-4 rounded-2xl border-2 border-blue-400/30 bg-[#0f1d3a] p-3.5">
              <div className="text-[20px] font-black text-blue-200 tracking-wider mb-1.5 px-2">BASIC EFFECT</div>
              {d.gear.basic.map((e, i) => {
                const isAtk = i === 0
                return (
                  <Highlight key={e.nameKey ?? e.name} t={t} at={isAtk ? 3.8 : null} radius={12}>
                    <div className="relative flex items-center justify-between px-3 py-1.5" style={isAtk ? undefined : { opacity: 1 - 0.5 * hlK }}>
                      <span className="text-[28px] font-bold" style={{ color: isAtk ? mix(C.blue100, C.amber100, hlK) : mix(C.blue100, C.blue100, 1) }}>{effName(e)}</span>
                      <span className="font-black tabular-nums"
                        style={isAtk ? { color: mix(C.white, C.amber200, hlK), fontSize: 28 + 8 * hlK } : { color: 'white', fontSize: 28 }}>{e.value}</span>
                      {/* ป้ายชี้ — ผูกกับแถวนี้เลย จึงตรงแถวเสมอ */}
                      {isAtk && hl && (
                        <div className="absolute left-full top-1/2 ml-6 flex items-center gap-2 whitespace-nowrap"
                          style={{ opacity: easeOut(prog(t, 4.6, 5.1)), transform: `translateY(-50%) translateX(${(1 - easeOut(prog(t, 4.6, 5.1))) * 40 + Math.sin(t * 5) * 6}px)` }}>
                          <span className="material-icons-round text-amber-300 text-[56px]">west</span>
                          <span className="px-4 py-2 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">{T('ทดสอบค่านี้', 'Testing this')}</span>
                        </div>
                      )}
                    </div>
                  </Highlight>
                )
              })}
            </div>
            {d.switchable && (
              <div className="mt-3 rounded-2xl border-2 border-orange-400/30 bg-[#2a1a10] p-3.5" style={{ opacity: 1 - 0.5 * hlK }}>
                <div className="text-[20px] font-black text-orange-200 tracking-wider mb-1 px-2">SWITCHABLE EFFECT</div>
                <div className="flex items-center justify-between px-3">
                  <span className="text-[26px] font-bold text-orange-100">{effName(d.switchable)}</span>
                  <span className="text-[28px] font-black text-white tabular-nums">{d.switchable.value}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ค่าพลัง + ช่องเกียร์ของเรนเจอร์เรา */}
        <RangerCard r={d.ally} name={allyName} s={allyCard} x={680} y={24}
          tag={T('เรนเจอร์ของเรา', 'Our ranger')} tagColor="bg-cyan-500/25 text-cyan-200"
          rows={<>
            <StatRow t={t} icon={ICON.atk} label={T('พลังโจมตี', 'ATK')} value={fmtInt(d.atkBefore)} hlAt={8.75} />
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.ally.baseStats.hp)} dim />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.ally.baseStats.phyDef + d.ally.baseStats.magDef)} dim />
          </>}
          slots={<GearSlots t={t} />} />

        {/* ค่าพลัง + ช่องเกียร์ของเป้าหมาย — ใช้ทั้ง HP และ DEF (ต้านสกิลใช้ตอนโดนสกิล) */}
        <RangerCard r={d.enemy} name={enemyName} s={enemyCard} x={40} y={24}
          tag={T('เป้าหมาย', 'Target')} tagColor="bg-rose-500/25 text-rose-200"
          rows={<>
            <StatRow t={t} icon={ICON.hp} label={T('พลังชีวิต', 'HP')} value={fmtInt(d.enemy.baseStats.hp)} hlAt={13.05} />
            <StatRow t={t} icon={ICON.def} label={T('พลังป้องกัน', 'DEF')} value={fmtInt(d.enemyDef)} hlAt={13.55} />
            <StatRow t={t} label={T('ต้านสกิล', 'Skill Resistance')} value={pct(d.enemyRes)} dim
              note={T('ใช้ตอนโดนสกิล (ดูรอบที่ 2)', 'Used against skills (see round 2)')} />
          </>}
          slots={<GearSlots t={t} />} />

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
                <DamageBar t={t} at={18.6} keep={d.factor} keepCls="from-amber-500 to-yellow-300" keepText="text-amber-300"
                  keepLabel={T('ดาเมจที่เหลือ', 'Damage left')} cutLabel={T('DEF ลดไป', 'Cut by DEF')} />
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
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkBefore)}`} color="bg-gradient-to-r from-slate-700 to-slate-600 border-2 border-white/15" />
        {rounds.map(r => <HealFx key={r.refill} c={c} t={t} at={r.refill} />)}
        <HpBar c={c} t={t} d={d} rounds={rounds} />

        {/* ── ใส่เกียร์: การ์ดช่องเกียร์ + ไอคอนบินลงช่องอาวุธ ── */}
        {equipCard.on && (
          <div className={`absolute w-[560px] p-6 ${CARD}`} style={{ left: EQ_CARD.x, top: EQ_CARD.y, ...popStyle(equipCard) }}>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-16 h-16 object-contain" />
              <div>
                <div className="text-[20px] text-gray-400 font-bold">{t >= EQ_AT ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
                <div className="text-[30px] font-black text-white leading-tight">{gearName} +{GEAR_LEVEL}</div>
              </div>
              <span className="ml-auto px-3.5 py-1.5 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">+{(d.atkPct * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ICON.atk} alt="" className="w-11 h-11" />
              <span className="text-[26px] text-gray-200 font-bold">{T('พลังโจมตี', 'ATK')}</span>
              <span className="ml-auto text-[50px] font-black text-amber-200 tabular-nums leading-none" style={{ textShadow: `0 0 ${14 + 14 * pulse(t, 3) * (t > EQ_AT + 0.55 && t < EQ_AT + 1.85 ? 1 : 0)}px rgba(251,191,36,0.75)` }}>
                {fmtInt(atkNow)}
              </span>
            </div>
            <div className="mt-1 text-right text-[22px] text-gray-400 tabular-nums" style={{ opacity: easeOut(prog(t, EQ_AT + 1.75, EQ_AT + 2.15)) }}>
              {fmtInt(d.atkBefore)} × {mult.toFixed(2)}
            </div>
            <div className="mt-3 pt-3 border-t-2 border-white/10">
              <GearSlots t={t} equip={{ at: EQ_AT, icon: gearIcon }} />
            </div>
          </div>
        )}
        {t >= EQ_AT - 0.65 && fly < 1 && equipCard.on && (() => {
          const k = easeInOut(fly)
          const x = 640 + (slotTarget.x - 640) * k
          const y = 30 + (slotTarget.y - 30) * k - Math.sin(k * Math.PI) * 90
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={gearIcon} alt="" crossOrigin="anonymous" className="absolute w-[120px] h-[120px] object-contain"
              style={{ left: x, top: y, transform: `translate(-50%,-50%) rotate(${k * 540}deg) scale(${1.4 - 0.7 * k})`, filter: 'drop-shadow(0 0 22px rgba(253,224,71,0.95))' }} />
          )
        })()}

        {/* ── สูตรสกิล (ก่อนร่ายสกิลรอบที่ 2): ไม่โดน DEF แต่โดนต้านสกิลแทน ── */}
        {skillCard.on && (
          <div className={`absolute left-1/2 top-[34px] w-[860px] -ml-[430px] p-7 ${CARD}`} style={popStyle(skillCard, 36)}>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.skill.iconUrl && <img src={lericoProxy(d.skill.iconUrl)} alt="" crossOrigin="anonymous" className="w-[76px] h-[76px] rounded-2xl" />}
              <div>
                <div className="text-[22px] font-black text-fuchsia-300">{T('สกิลโจมตี', 'Attack skill')}</div>
                <div className="text-[40px] font-black text-white leading-tight">{skillName}</div>
              </div>
              <span className="ml-auto px-4 py-1.5 rounded-xl bg-fuchsia-950 border-2 border-fuchsia-400/60 text-[30px] font-black text-fuchsia-100">ATK × {pct(d.skillMul)}</span>
            </div>
            <div className="mt-4 rounded-2xl bg-[#2a0f1a] border-2 border-rose-400/40 px-4 py-2.5 text-[24px] font-bold text-rose-100" style={step(sk + 0.6)}>
              {T('สกิลไม่โดนลดด้วยพลังป้องกัน (DEF) — ใช้ "ต้านสกิล" ของเป้าหมายลดแทน', "Skills ignore DEF — the target's Skill Resistance reduces them instead")}
            </div>
            <div className="mt-4 flex items-center justify-center text-white text-[36px] font-black" style={step(sk + 1.2)}>
              {T('ดาเมจ', 'Damage')} = ATK × {pct(d.skillMul)} × (1 − {T('ต้านสกิล', 'Skill Res.')})
            </div>
            <div className="mt-4 space-y-2 text-[28px]">
              <div className="flex justify-between" style={step(sk + 1.8)}>
                <span className="text-gray-300 font-bold">{T('ATK (ยังไม่ใส่เกียร์)', 'ATK (no gear)')}</span><span className="font-black text-white tabular-nums">{fmtInt(d.atkBefore)}</span>
              </div>
              <div className="flex justify-between" style={step(sk + 2.3)}>
                <span className="text-gray-300 font-bold">{T('ต้านสกิลของเป้าหมาย', 'Target Skill Resistance')}</span><span className="font-black text-rose-300 tabular-nums">{pct(d.enemyRes)}</span>
              </div>
              <div style={step(sk + 2.7)}>
                <DamageBar t={t} at={sk + 2.9} keep={1 - d.enemyRes} keepCls="from-fuchsia-600 to-pink-400" keepText="text-fuchsia-300"
                  keepLabel={T('ดาเมจที่เหลือ', 'Damage left')} cutLabel={T('ต้านสกิลลดไป', 'Cut by Skill Res.')} />
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t-2 border-white/10" style={step(sk + 3.6)}>
                <span className="text-gray-300 font-bold tabular-nums">{fmtInt(d.atkBefore)} × {pct(d.skillMul)} × {pct(1 - d.enemyRes)}</span>
                <span className="text-[40px] font-black text-fuchsia-200 tabular-nums">= {fmtInt(d.dmgSkillBefore)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── รอบ 2: สกิล ยังไม่ใส่เกียร์ ── */}
        <Banner t={t} start={29.3} end={34.6} title={T('รอบที่ 2 · ยังไม่ใส่เกียร์', 'Round 2 · No gear')}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ATK ${fmtInt(d.atkBefore)}`} color="bg-gradient-to-r from-slate-700 to-fuchsia-900 border-2 border-white/15" />

        {/* ── รอบ 3: โจมตีปกติ ใส่เกียร์ ── */}
        <Banner t={t} start={38.7} end={42.3} title={T(`รอบที่ 3 · ใส่${gearName}`, `Round 3 · ${gearName}`)}
          sub={`${T('โจมตีปกติ', 'Normal attack')} · ATK ${fmtInt(d.atkAfter)}`} color="bg-gradient-to-r from-amber-600 to-orange-600 border-2 border-amber-200/40" />

        {/* ── รอบ 4: สกิล ใส่เกียร์ ── */}
        <Banner t={t} start={42.4} end={47.6} title={T(`รอบที่ 4 · ใส่${gearName}`, `Round 4 · ${gearName}`)}
          sub={`${T('สกิล', 'Skill')} ${skillName} · ATK ${fmtInt(d.atkAfter)}`} color="bg-gradient-to-r from-fuchsia-700 to-purple-700 border-2 border-fuchsia-200/40" />

        {/* วิญญาณเป้าหมาย: ออกจากกลางร่างที่ล้มอยู่ ลอยขึ้นแล้วจางหาย (ทุกรอบที่ตาย) */}
        {fallen && rounds.filter(r => r.dmg >= d.enemy.baseStats.hp).map(r => {
          const at = r.at + DEATH.soul
          const p = prog(t, at, at + DEATH.soulDur)
          if (t < at || p >= 1) return null
          const rise = easeOut(p) * 190 / zoom                         // ลอยขึ้น (พิกัดเวที)
          const sway = Math.sin(p * Math.PI * 3) * 12 * (0.3 + p) / zoom   // ส่ายเบาๆ แรงขึ้นเมื่อสูงขึ้น
          const sp = c.project({ x: fallen.x + sway, y: fallen.y - rise })
          const alpha = Math.min(easeOut(prog(t, at, at + 0.25)), 1 - easeInOut(prog(t, at + DEATH.soulDur * 0.5, at + DEATH.soulDur)))
          return (
            <SamSprite key={r.at} base="hd/unit/effect/eff_die/eff_die_enemy" clip="die" frame={Math.floor((t - at) * FPS)} loop anchorFrame={0}
              x={sp.x} y={sp.y} scale={fallen.scale * zoom} alpha={alpha} />
          )
        })}

        {/* ── สรุป ── */}
        {sum.on && (
          <div className="absolute inset-0 bg-black/70" style={{ opacity: sum.alpha }}>
            <div className={`absolute left-1/2 top-1/2 w-[900px] -ml-[450px] -mt-[335px] p-8 ${CARD}`} style={popStyle(sum, 40)}>
              <div className="text-[24px] font-black text-amber-300">{T('สรุป', 'Summary')}</div>
              <div className="text-[40px] font-black text-white leading-tight">{T('ดาเมจต่อครั้ง (เป้าหมายเดียวกัน)', 'Damage per hit (same target)')}</div>
              {sumRows.map(r => (
                <div key={r.label} className="mt-4" style={{ opacity: easeOut(prog(t, r.at - 0.2, r.at + 0.2)) }}>
                  <div className="flex justify-between text-[26px]">
                    <span className="text-gray-200 font-bold">{r.label}</span>
                    <span className="font-black text-white tabular-nums">{fmtInt(r.v * bar(r.at))}</span>
                  </div>
                  <div className="h-6 rounded-full bg-white/10 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.cls}`} style={{ width: `${Math.max(3, logW(r.v) * 100) * bar(r.at)}%` }} />
                  </div>
                </div>
              ))}
              <div className="mt-6 grid grid-cols-2 gap-4" style={popStyle(span(t, S + 2.9, TL.end, 0.5, 0.6))}>
                <div className="rounded-2xl bg-[#2a1f08] border-2 border-amber-400/50 p-3 text-center">
                  <div className="text-[22px] text-gray-300 font-bold">{T('โจมตีปกติ แรงขึ้น', 'Normal attack')}</div>
                  <div className="text-[52px] font-black text-amber-300 leading-none mt-1">×{(d.dmgAfter / d.dmgBefore).toFixed(2)}</div>
                </div>
                <div className="rounded-2xl bg-[#250a2a] border-2 border-fuchsia-400/50 p-3 text-center">
                  <div className="text-[22px] text-gray-300 font-bold">{T('สกิล แรงขึ้น', 'Skill')}</div>
                  <div className="text-[52px] font-black text-fuchsia-300 leading-none mt-1">×{(d.dmgSkill / d.dmgSkillBefore).toFixed(2)}</div>
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
