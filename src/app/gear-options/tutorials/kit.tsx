'use client'

// ====================================================
// ชุดชิ้นส่วนร่วมของวิดีโอสอนออพชั่นเกียร์ (atk.tsx, hp.tsx, …)
//
// ทุกวิดีโอใช้โครงเรื่อง + เวลาเดียวกัน (TL) — ฉากสร้างจาก scripts/gear-options/scene-lib.cjs (const T ตรงกับ TL):
//   0–7.6      ชื่อหัวข้อ → การ์ดเกียร์ ไฮไลท์ค่าที่ทดสอบ (Basic ช่องแรก)
//   8.2–11.9   การ์ดเรนเจอร์เรา       12.5–15.9  การ์ดอีกฝั่ง
//   16.4–20.6  สูตรโจมตีปกติ (DEF)    20.8–24.2  รอบ 1 โจมตีปกติ ไม่ใส่เกียร์
//   24.4–29.3  สูตรสกิล (ต้านสกิล)     29.3–34.8  รอบ 2 สกิล ไม่ใส่เกียร์
//   34.8–38.7  ใส่เกียร์               38.7–42.3  รอบ 3 โจมตีปกติ ใส่เกียร์
//   42.4–47.8  รอบ 4 สกิล ใส่เกียร์    48–55      สรุป
// คิวในฉาก: atk_before / skill_before / atk_after / skill_after (CUE_IDS)
//
// หน่วยทุกอย่าง = พิกเซลเวที 1280×720 (ชั้นซ้อนถูกย่อ/ขยายตามกล่องวิดีโอ) — ตัวหนังสือใหญ่ไว้ ดูบนมือถือก็ยังอ่านได้
// ====================================================

import { useEffect, useState } from 'react'
import type { OverlayCtx } from '@/components/ScenePlayer'
import { apiFetch, DATA_BASE, gearEffectsFile, lericoProxy } from '@/lib/staticApi'
import { aggregateGearBonuses, type StatBonus, type StatBonusMap } from '@/lib/gearEffectParser'
import { recalcGearEffects } from '@/lib/gearLevelCalc'
import type { GearEffect, GearEffects } from '@/lib/pvpScraper'
import { assets, type RangerRuntime } from '@/anme/engine/assets'
import { clamp01, countUp, easeInOut, easeOut, easeOutBack, fmtInt, popStyle, prog, pulse, span } from './anim'
import { AtlasSprite, frameBBox, SamSprite } from './sam'

// ── ค่าคงที่ / เวลา ──────────────────────────────────

export const K = 18000                   // ค่าคงที่สูตรลดดาเมจจาก DEF
export const FPS = 30
export const GEAR_LEVEL = 5              // ระดับเกียร์ที่ใช้ทดสอบ (+5 = Basic เต็ม)
export const GEAR_MAX = 10               // ระดับสูงสุด (หลอดบนการ์ด)

/** เวลาในวิดีโอ — ต้องตรงกับ const T ใน scripts/gear-options/scene-lib.cjs */
export const TL = {
  /** รีเลือดก่อนตีแต่ละรอบ (รอบ 1–4) */
  refill: [20.9, 29.45, 38.85, 42.65],
  /** จังหวะโดนของแต่ละรอบ ถ้ายังหาจากไทม์ไลน์ไม่ได้ */
  hitFallback: [22.32, 31.333, 40.42, 44.433],
  skillCard: [24.4, 29.3] as const,
  equip: 35.95,
  summary: 48.0,
  end: 55,
}
export const CUE_IDS = ['atk_before', 'skill_before', 'atk_after', 'skill_after'] as const
/** ตายแล้ว (นับจากจังหวะโดน): knockback → ค้างท่าสุดท้าย → ร่างจางหาย (อยู่ในฉาก) · วิญญาณออกจากร่าง + เสียงตายตอน soul (ตรงกับ DEATH ใน scene-lib.cjs) */
export const DEATH = { soul: 1.4, soulDur: 1.9 }

// ── ข้อมูล ────────────────────────────────────────────

export interface Skill { slot: string; code: string; name: string; description?: string; iconUrl?: string }
export interface RangerStats {
  id: string
  imageUrl: string
  playerMaxLevel: number | null
  baseStats: { phyAtk: number; magAtk: number; phyDef: number; magDef: number; hp: number }
  rates: { skillResistance: number }
  skills: Skill[]
}

/** ค่าพลังเลเวลเต็ม (ไฟล์เดียวกับ Ranger Book) */
export const loadStats = (id: string) =>
  apiFetch(`/api/meta/ranger-stats?id=${encodeURIComponent(id)}`).then(r => r.json() as Promise<RangerStats>)

/** ค่าเกียร์ที่ +5 (recalcGearEffects = ตัวเดียวกับสไลเดอร์ระดับในหน้าต่างเกียร์) + โบนัสรวมแบบ Ranger Book (เฉพาะ Basic) */
export async function loadGear(code: string): Promise<{ gear: GearEffects; bonus: StatBonusMap }> {
  const fx = await fetch(`${DATA_BASE}/${gearEffectsFile(code)}`).then(r => r.json() as Promise<Record<string, GearEffects>>)
  const gear = recalcGearEffects(fx['5'], GEAR_LEVEL) as GearEffects
  return { gear, bonus: aggregateGearBonuses([gear], [null]) }
}

export const totalAtk = (r: RangerStats) => r.baseStats.phyAtk + r.baseStats.magAtk

/**
 * ค่าพลังหลังใส่เกียร์แบบในเกม: ฐาน + ตัดเศษ(ฐาน × %รวม + ค่าบวกตรงรวม)
 *   % จากหลายแหล่งบวกกันก่อนแล้วค่อยคูณฐาน · เกมคิด float32 แล้วตัดเศษทิ้ง (ยืนยันจากโค้ดเกม)
 */
export function gearStat(base: number, b: StatBonus | undefined): number {
  if (!b) return base
  const f = Math.fround
  return base + Math.trunc(f(f(f(base) * f(b.pct)) + b.flat))
}

/** ชนิดช่องเกียร์ (ลำดับเดียวกับแถวช่องในเกม: อาวุธ · เกราะ · เครื่องประดับ) */
export type GearKind = 'weapon' | 'armor' | 'acc'
export const GEAR_KIND: Record<GearKind, { icon: string; th: string; en: string; slot: number }> = {
  weapon: { icon: '/gacha/images/gear_weapon.png', th: 'อาวุธ', en: 'Weapon', slot: 0 },
  armor: { icon: '/gacha/images/gear_armor.png', th: 'เกราะ', en: 'Armor', slot: 1 },
  acc: { icon: '/gacha/images/gear_accessory.png', th: 'เครื่องประดับ', en: 'Accessory', slot: 2 },
}

/** ดาเมจโจมตีปกติ 1 ส่วน (กายภาพ หรือ เวท) */
export interface HitPart { kind: 'phy' | 'mag'; atk: number; def: number; factor: number; dmg: number }
export interface NormalHit { parts: HitPart[]; total: number }
/**
 * โจมตีปกติแบบในเกม (ยืนยันจากโค้ดเกม):
 *   ATK กายภาพ × K/(K + DEF กายภาพ)  +  ATK เวท × K/(K + DEF เวท)
 *   แต่ละส่วนลดด้วย DEF ของตัวเองแยกกันแล้วค่อยรวม · เกมคิดเป็น float32 แล้วตัดเศษทิ้ง
 *   ส่วนที่ ATK = 0 ไม่ต้องแสดง
 */
export function normalHit(phyAtk: number, magAtk: number, d: { phyDef: number; magDef: number }): NormalHit {
  const f = Math.fround
  const part = (kind: HitPart['kind'], atk: number, def: number): HitPart => {
    const factor = f(1 - f(def / f(K + def)))
    return { kind, atk, def, factor, dmg: Math.trunc(f(factor * atk)) }
  }
  const all = [part('phy', phyAtk, d.phyDef), part('mag', magAtk, d.magDef)]
  const parts = all.filter(p => p.atk > 0)
  return { parts, total: all.reduce((a, p) => a + p.dmg, 0) }
}
export const firstSkill = (r: RangerStats) => r.skills.find(k => k.slot === 'skill1') ?? r.skills[0]
/** ความแรงสกิลจากคำอธิบาย "ATK x 3000%" → 30 */
export function skillMultiplier(s: Skill): number {
  const m = (s.description ?? '').match(/ATK x ([\d.]+)%/)
  return m ? parseFloat(m[1]) / 100 : 1
}
export const switchableOf = (g: GearEffects, nameKey: string) => g.switchable?.allEffects.find(e => e.effect.nameKey === nameKey)?.effect ?? null
export const gearIconUrl = (code: string) => lericoProxy(`https://rangers.lerico.net/res/gear_icon/${code}_icon.png`)
export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

/** โหลดข้อมูลของวิดีโอครั้งเดียว */
export function useTutorialData<T>(load: () => Promise<T>) {
  const [d, setD] = useState<T | null>(null)
  const [err, setErr] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().then(setD).catch(e => setErr(String(e))) }, [])
  return { d, err }
}
export const LoadBox = ({ err, T }: { err: string; T: (th: string, en: string) => string }) => err
  ? <div className="aspect-video grid place-items-center text-red-300 text-sm">{T('โหลดข้อมูลไม่ได้', 'Failed to load data')}: {err}</div>
  : <div className="w-full aspect-video bg-black rounded-xl grid place-items-center text-gray-400 text-sm">Loading...</div>

// ── หน้าตาพื้นฐาน ─────────────────────────────────────

/** ผสมสีทีละนิดตามเวลา (k 0→1) — ไม่ให้สีตัวหนังสือเปลี่ยนแบบกระพริบทีเดียว */
type RGB = readonly [number, number, number]
export const mix = (a: RGB, b: RGB, k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(k))).join(',')})`
export const C = { white: [255, 255, 255], amber100: [254, 243, 199], amber200: [253, 230, 138], blue100: [219, 234, 254] } as const

export const CARD = 'rounded-[22px] border-2 border-white/15 bg-[#0b1122] shadow-[0_24px_70px_-10px_rgba(0,0,0,0.9)]'
export const ICON = { atk: '/gacha/images/atk.png', hp: '/gacha/images/hp.png', def: '/gacha/images/def.png' }

/** แถวค่อยๆ เลื่อนเข้าจากซ้าย ตอนเวลา a */
export const step = (t: number, a: number) => ({ opacity: easeOut(prog(t, a, a + 0.4)), transform: `translateX(${(1 - easeOut(prog(t, a, a + 0.4))) * -24}px)` })

/** ขนาดเส้นกรอบ SVG — ตั้งผ่าน CSS (calc ในแอตทริบิวต์ width/height ของ SVG ใช้ไม่ได้ทุกเบราว์เซอร์) */
const RECT: React.CSSProperties = { width: 'calc(100% - 3px)', height: 'calc(100% - 3px)' }

/**
 * ไฮไลท์แบบ "โหลด": เส้นแสงวิ่งรอบกรอบ 0 → 100% (มีหัวแสงสว่างนำ) แล้วค่อยเป็นกรอบทองเต้นจังหวะปกติ
 * ใช้ครอบแถวที่ต้องการเน้น · at = วินาทีที่เริ่มวิ่ง
 */
export function Highlight({ t, at, dur = 0.9, radius = 16, children, className = '' }: {
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

export function StatRow({ icon, label, value, parts, hlAt, dim, t, note }: {
  icon?: string; label: string; value?: string; hlAt?: number; dim?: boolean; t: number; note?: string
  /** แสดงหลายค่าซ้อนกันแทน value เช่น DEF กายภาพ / เวท */
  parts?: { label: string; value: string }[]
}) {
  const k = hlAt != null ? easeInOut(prog(t, hlAt, hlAt + 0.5)) : 0
  return (
    <Highlight t={t} at={hlAt ?? null} className="px-4 py-2.5">
      <div style={{ opacity: dim ? 0.55 : 1 }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {icon && <img src={icon} alt="" className="w-10 h-10 object-contain" />}
          <span className="text-[26px] text-gray-200 font-bold">{label}</span>
          {parts
            ? <span className="ml-auto flex flex-col items-end gap-1">
                {parts.map(p => (
                  <span key={p.label} className="flex items-baseline gap-2 leading-none">
                    <span className="text-[19px] text-gray-400 font-bold">{p.label}</span>
                    <span className="text-[30px] font-black tabular-nums" style={{ color: mix(C.white, C.amber200, k) }}>{p.value}</span>
                  </span>
                ))}
              </span>
            : <span className="ml-auto text-[38px] font-black tabular-nums leading-none" style={{ color: mix(C.white, C.amber200, k) }}>{value}</span>}
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
export function DamageBar({ t, at, keep, keepCls, keepText, keepLabel, cutLabel }: {
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

// ── ช่องเกียร์ (res/gear_main) ─────────────────────────

const SLOT_KINDS = ['weapon', 'armor', 'acc'] as const
export const SLOT_W = 150    // ระยะห่างต่อช่องในแถว
export const SLOT_Y = 76     // กึ่งกลางกรอบช่องในแถว
/** กรอบช่องเรืองแสงสีส้มใน atlas ของ fx70-gear-slot (11 เฟรม) — เล่นครั้งเดียวตอนใส่เกียร์ */
const SLOT_GLOW = ['', '_2', '_3', '_4', '_5', '_6', '_7', '_8', '_9', '_10', '_11'].map(s => `fx70-gear-slot_106x112${s}.png`)
const GLOW_FPS = 16

/**
 * แถวช่องเกียร์ 3 ช่อง (หน้าตาแบบในเกม) · equip = ใส่ของลงช่องอาวุธตอนเวลา at → กรอบเรืองแสงส้มวูบเดียว (เฟรมจาก fx70-gear-slot) + แสงวาบ
 *   กรอบช่อง = gear_main_slot_bg · ป้ายทองแดงทับขอบบน = gear_main_slot_plate_bg + ไอคอนชนิดช่อง (ไม่มีข้อความ)
 *   ช่องว่าง = ไอคอนมืดแบบสลัก · ช่องที่ใส่ของแล้ว = ไอคอน _on เรืองแสง
 */
export function GearSlots({ t, equip }: { t: number; equip?: { at: number; icon: string; kind?: GearKind } }) {
  return (
    <div className="relative mx-auto" style={{ width: SLOT_W * 3, height: 140 }}>
      {SLOT_KINDS.map((key, i) => {
        const cx = SLOT_W * i + SLOT_W / 2
        const eq = equip && i === GEAR_KIND[equip.kind ?? 'weapon'].slot && t >= equip.at ? equip : null
        // แสงช่องเล่นครั้งเดียว (ไม่วน) แล้วจางลงเหลือกรอบช่องปกติ
        const gi = eq ? Math.floor((t - eq.at) * GLOW_FPS) : -1
        const glowFrame = eq && gi < SLOT_GLOW.length ? SLOT_GLOW[gi] : null
        const glowAlpha = 1 - prog(gi, SLOT_GLOW.length - 4, SLOT_GLOW.length)
        const burst = eq ? 1 - prog(t, eq.at, eq.at + 0.5) : 0
        const pop = eq ? easeOutBack(prog(t, eq.at + 0.15, eq.at + 0.55)) : 0
        return (
          <div key={key}>
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
            <AtlasSprite atlas="gear_main/gear_common" name={`gear_main_slot_icon_${key}_on.png`} x={cx} y={SLOT_Y - 53} scale={0.42}
              style={eq ? { filter: 'drop-shadow(0 0 6px rgba(253,224,71,0.9))' } : { filter: 'brightness(0.18) contrast(1.4)', opacity: 0.85 }} />
          </div>
        )
      })}
    </div>
  )
}

/** การ์ดค่าพลัง + ช่องเกียร์ของเรนเจอร์ */
export function RangerCard({ r, name, rows, s, x, y, tag, tagColor, slots }: {
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

/** ป้ายหัวรอบ (บนกลางจอ) */
export function Banner({ t, start, end, title, sub, color }: { t: number; start: number; end: number; title: string; sub: string; color: string }) {
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
export const BANNER_COLOR = {
  normalNoGear: 'bg-gradient-to-r from-slate-700 to-slate-600 border-2 border-white/15',
  skillNoGear: 'bg-gradient-to-r from-slate-700 to-fuchsia-900 border-2 border-white/15',
  normalGear: 'bg-gradient-to-r from-amber-600 to-orange-600 border-2 border-amber-200/40',
  skillGear: 'bg-gradient-to-r from-fuchsia-700 to-purple-700 border-2 border-fuchsia-200/40',
}

// ── ฉากเปิด: พื้นมืด + ชื่อหัวข้อ + การ์ดเกียร์ ───────────

export function Opening({ t, lang, T, title }: { t: number; lang: string; T: (th: string, en: string) => string; title: string }) {
  const dim = span(t, 0, 7.6, 0.01, 0.5)
  const s = span(t, 0.2, 2.4, 0.5, 0.4)
  return (
    <>
      {/* พื้นหลังมืดช่วงเปิด ให้การ์ดเด่น */}
      {dim.on && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,8,20,0.6),rgba(0,0,0,0.88))]" style={{ opacity: dim.alpha }} />}
      {s.on && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={popStyle(s, 40)}>
          <div className={`text-[30px] font-black text-amber-300/90 ${lang === 'th' ? 'tracking-normal' : 'tracking-[0.3em]'}`}>{T('ออพชั่นของอุปกรณ์', 'GEAR OPTION')}</div>
          <div className="text-[120px] font-black text-white leading-none mt-3 drop-shadow-[0_8px_30px_rgba(251,191,36,0.5)]">{title}</div>
          <div className="mt-5 h-[4px] bg-gradient-to-r from-transparent via-amber-300 to-transparent" style={{ width: 620 * easeOut(s.enter) }} />
        </div>
      )}
    </>
  )
}

/**
 * การ์ดเกียร์ (หน้าตาเดียวกับหน้าต่างเกียร์บนเว็บ) — ไฮไลท์ Basic ช่องแรก (ค่าที่ทดสอบ) ตอน 3.8 วิ
 *   แถวอื่นค่อยๆ มืด · แถวที่ทดสอบค่อยๆ ขยาย + เปลี่ยนสี (ไม่เด้งทีเดียว) · ลูกศร "ทดสอบค่านี้" ผูกกับแถวนั้น
 */
export function GearCard({ t, T, gear, icon, name, effName, switchable, kind = 'weapon', grade = 7, tested = [0] }: {
  t: number; T: (th: string, en: string) => string; gear: GearEffects; icon: string; name: string
  effName: (e: GearEffect) => string; switchable: GearEffect | null
  kind?: GearKind; grade?: number
  /** ลำดับค่า Basic ที่วิดีโอนี้ทดสอบ (ไฮไลท์ทุกตัว · ลูกศรชี้กึ่งกลางกลุ่ม) */
  tested?: number[]
}) {
  const s = span(t, 2.1, 7.4, 0.55, 0.4)
  if (!s.on) return null
  const hl = t >= 3.8
  const hlK = easeInOut(prog(t, 3.8, 4.4))
  return (
    <div className={`absolute left-[120px] top-[34px] w-[720px] p-6 ${CARD}`} style={popStyle(s, 40)}>
      <div className="flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" crossOrigin="anonymous" className="w-[110px] h-[110px] object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GEAR_KIND[kind].icon} alt="" className="h-9" />
            <span className="text-[24px] text-gray-300 font-bold">{T(GEAR_KIND[kind].th, GEAR_KIND[kind].en)}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/gacha/images/${grade}star.png`} alt="" className="h-8" />
          </div>
          <div className="text-[46px] font-black text-white leading-tight">{name}</div>
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
        {gear.basic.map((e, i) => {
          const isTested = tested.includes(i)
          // ลูกศรอยู่ที่แถวแรกของกลุ่ม · ทดสอบหลายแถว → เลื่อนลงไปกึ่งกลางกลุ่ม (แถวละ ~44px)
          const arrowRow = i === tested[0]
          const arrowShift = (tested.length - 1) * 22
          return (
            <Highlight key={e.nameKey ?? e.name} t={t} at={isTested ? 3.8 : null} radius={12}>
              <div className="relative flex items-center justify-between px-3 py-1.5" style={isTested ? undefined : { opacity: 1 - 0.5 * hlK }}>
                <span className="text-[28px] font-bold" style={{ color: isTested ? mix(C.blue100, C.amber100, hlK) : mix(C.blue100, C.blue100, 1) }}>{effName(e)}</span>
                <span className="font-black tabular-nums"
                  style={isTested ? { color: mix(C.white, C.amber200, hlK), fontSize: 28 + 8 * hlK } : { color: 'white', fontSize: 28 }}>{e.value}</span>
                {arrowRow && hl && (
                  <div className="absolute left-full top-1/2 ml-6 flex items-center gap-2 whitespace-nowrap"
                    style={{ opacity: easeOut(prog(t, 4.6, 5.1)), transform: `translateY(calc(-50% + ${arrowShift}px)) translateX(${(1 - easeOut(prog(t, 4.6, 5.1))) * 40 + Math.sin(t * 5) * 6}px)` }}>
                    <span className="material-icons-round text-amber-300 text-[56px]">west</span>
                    <span className="px-4 py-2 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">{tested.length > 1 ? T(`ทดสอบ ${tested.length} ค่านี้`, `Testing these ${tested.length}`) : T('ทดสอบค่านี้', 'Testing this')}</span>
                  </div>
                )}
              </div>
            </Highlight>
          )
        })}
      </div>
      {switchable && (
        <div className="mt-3 rounded-2xl border-2 border-orange-400/30 bg-[#2a1a10] p-3.5" style={{ opacity: 1 - 0.5 * hlK }}>
          <div className="text-[20px] font-black text-orange-200 tracking-wider mb-1 px-2">SWITCHABLE EFFECT</div>
          <div className="flex items-center justify-between px-3">
            <span className="text-[26px] font-bold text-orange-100">{effName(switchable)}</span>
            <span className="text-[28px] font-black text-white tabular-nums">{switchable.value}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── การ์ดสูตร ─────────────────────────────────────────

/** ป้าย DEF กายภาพ / เวท บนการ์ดเรนเจอร์ */
export const defParts = (r: RangerStats, T: (th: string, en: string) => string) => [
  { label: T('กายภาพ', 'PHY'), value: fmtInt(r.baseStats.phyDef) },
  { label: T('เวท', 'MAG'), value: fmtInt(r.baseStats.magDef) },
]

const PART_STYLE = {
  phy: { chip: 'bg-amber-500/20 text-amber-200 border-amber-400/50', bar: 'from-amber-500 to-yellow-300', text: 'text-amber-300' },
  mag: { chip: 'bg-sky-500/20 text-sky-200 border-sky-400/50', bar: 'from-indigo-500 to-sky-300', text: 'text-sky-300' },
} as const

/**
 * สูตรโจมตีปกติ 16.4–20.6 — แยกคิด กายภาพ / เวท คนละ DEF แล้วรวมกัน (แบบในเกม)
 *   แต่ละส่วน: ATK × K/(K + DEF) · หลอดแต่ละส่วนบอกว่าเหลือดาเมจกี่ % และ DEF ลดไปกี่ %
 */
export function NormalFormulaCard({ t, T, heading, defOwner, hit }: {
  t: number; T: (th: string, en: string) => string; heading: string
  /** "ของเป้าหมาย" / "ของเรา" — ต่อท้ายคำว่า DEF */
  defOwner: string
  hit: NormalHit
}) {
  const s = span(t, 16.4, 20.6, 0.5, 0.4)
  if (!s.on) return null
  const kindName = (k: HitPart['kind']) => (k === 'phy' ? T('กายภาพ', 'Physical') : T('เวท', 'Magical'))
  return (
    <div className={`absolute left-1/2 top-[30px] w-[860px] -ml-[430px] px-7 py-6 ${CARD}`} style={popStyle(s, 36)}>
      <div className="text-[24px] font-black text-sky-300">{heading}</div>
      <div className="mt-2 flex items-center justify-center gap-4 text-white" style={step(t, 16.7)}>
        <span className="text-[34px] font-black">{T('ดาเมจ', 'Damage')} = ATK ×</span>
        <span className="inline-flex flex-col items-center text-[32px] font-black leading-tight">
          <span className="px-3">K</span>
          <span className="w-full h-[3px] bg-white" />
          <span className="px-3">K + DEF</span>
        </span>
        <span className="text-[22px] font-bold text-gray-400">K = {fmtInt(K)}</span>
      </div>
      <div className="mt-2 text-center text-[21px] font-bold text-gray-300" style={step(t, 17.0)}>
        {T('คิดแยก กายภาพ กับ เวท — แต่ละส่วนโดน DEF ชนิดเดียวกันลด แล้วค่อยรวมกัน', 'Physical and magical are reduced separately by their own DEF, then added')}
      </div>
      <div className="mt-3 space-y-3">
        {hit.parts.map((p, i) => {
          const st = PART_STYLE[p.kind]
          const a = 17.3 + i * 0.35
          return (
            <div key={p.kind} className="rounded-2xl bg-white/[0.04] px-4 py-2.5" style={step(t, a)}>
              <div className="flex items-center gap-3 text-[24px]">
                <span className={`px-3 py-0.5 rounded-lg border-2 font-black ${st.chip}`}>{kindName(p.kind)}</span>
                <span className="text-gray-300 font-bold">ATK</span><span className="font-black text-white tabular-nums">{fmtInt(p.atk)}</span>
                <span className="text-gray-500">·</span>
                <span className="text-gray-300 font-bold">DEF {defOwner}</span><span className="font-black text-rose-300 tabular-nums">{fmtInt(p.def)}</span>
                <span className="ml-auto text-[30px] font-black text-white tabular-nums" style={step(t, 18.7 + i * 0.2)}>= {fmtInt(p.dmg)}</span>
              </div>
              <div className="mt-1.5">
                <DamageBar t={t} at={17.8 + i * 0.2} keep={p.factor} keepCls={st.bar} keepText={st.text}
                  keepLabel={T('ดาเมจที่เหลือ', 'Damage left')} cutLabel={T('DEF ลดไป', 'Cut by DEF')} />
              </div>
            </div>
          )
        })}
        <div className="flex justify-between items-baseline pt-2 border-t-2 border-white/10" style={step(t, 19.2)}>
          <span className="text-[26px] text-gray-300 font-bold tabular-nums">
            {hit.parts.length > 1 ? hit.parts.map(p => fmtInt(p.dmg)).join(' + ') : `${fmtInt(hit.parts[0]?.atk ?? 0)} × ${pct(hit.parts[0]?.factor ?? 0, 2)}`}
          </span>
          <span className="text-[40px] font-black text-white tabular-nums">= {fmtInt(hit.total)}</span>
        </div>
      </div>
    </div>
  )
}

/** สูตรสกิล (TL.skillCard): ดาเมจ = ATK × ความแรงสกิล × (1 − ต้านสกิล) — สกิลไม่โดนลดด้วย DEF */
export function SkillFormulaCard({ t, T, skill, skillName, mul, atkLabel, atk, resLabel, res, dmg }: {
  t: number; T: (th: string, en: string) => string; skill: Skill; skillName: string; mul: number
  atkLabel: string; atk: number; resLabel: string; res: number; dmg: number
}) {
  const s = span(t, TL.skillCard[0], TL.skillCard[1], 0.5, 0.4)
  if (!s.on) return null
  const sk = TL.skillCard[0]
  return (
    <div className={`absolute left-1/2 top-[34px] w-[860px] -ml-[430px] p-7 ${CARD}`} style={popStyle(s, 36)}>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {skill.iconUrl && <img src={lericoProxy(skill.iconUrl)} alt="" crossOrigin="anonymous" className="w-[76px] h-[76px] rounded-2xl" />}
        <div>
          <div className="text-[22px] font-black text-fuchsia-300">{T('สกิลโจมตี', 'Attack skill')}</div>
          <div className="text-[40px] font-black text-white leading-tight">{skillName}</div>
        </div>
        <span className="ml-auto px-4 py-1.5 rounded-xl bg-fuchsia-950 border-2 border-fuchsia-400/60 text-[30px] font-black text-fuchsia-100">ATK × {pct(mul)}</span>
      </div>
      <div className="mt-4 rounded-2xl bg-[#2a0f1a] border-2 border-rose-400/40 px-4 py-2.5 text-[24px] font-bold text-rose-100" style={step(t, sk + 0.6)}>
        {T('สกิลไม่โดนลดด้วยพลังป้องกัน (DEF) — ใช้ "ต้านสกิล" ของฝั่งที่โดนลดแทน', "Skills ignore DEF — the defender's Skill Resistance reduces them instead")}
      </div>
      <div className="mt-4 flex items-center justify-center text-white text-[36px] font-black" style={step(t, sk + 1.2)}>
        {T('ดาเมจ', 'Damage')} = ATK × {pct(mul)} × (1 − {T('ต้านสกิล', 'Skill Res.')})
      </div>
      <div className="mt-4 space-y-2 text-[28px]">
        <div className="flex justify-between" style={step(t, sk + 1.8)}>
          <span className="text-gray-300 font-bold">{atkLabel}</span><span className="font-black text-white tabular-nums">{fmtInt(atk)}</span>
        </div>
        <div className="flex justify-between" style={step(t, sk + 2.3)}>
          <span className="text-gray-300 font-bold">{resLabel}</span><span className="font-black text-rose-300 tabular-nums">{pct(res)}</span>
        </div>
        <div style={step(t, sk + 2.7)}>
          <DamageBar t={t} at={sk + 2.9} keep={1 - res} keepCls="from-fuchsia-600 to-pink-400" keepText="text-fuchsia-300"
            keepLabel={T('ดาเมจที่เหลือ', 'Damage left')} cutLabel={T('ต้านสกิลลดไป', 'Cut by Skill Res.')} />
        </div>
        <div className="flex justify-between items-baseline pt-3 border-t-2 border-white/10" style={step(t, sk + 3.6)}>
          <span className="text-gray-300 font-bold tabular-nums">{fmtInt(atk)} × {pct(mul)} × {pct(1 - res)}</span>
          <span className="text-[40px] font-black text-fuchsia-200 tabular-nums">= {fmtInt(dmg)}</span>
        </div>
      </div>
    </div>
  )
}

// ── ใส่เกียร์: การ์ดค่าก่อน→หลัง + ไอคอนบินลงช่องอาวุธ ─────────

const EQ_CARD = { x: 690, y: 70 }
/** ค่าพลัง 1 แถวบนการ์ดใส่เกียร์ (ก่อน → หลัง) */
export interface EquipStat { icon: string; label: string; before: number; after: number }
/** ความสูงคงที่ของแต่ละแถวค่าพลัง — ไอคอนที่บินมาต้องลงช่องพอดี (slotTarget คิดจากค่านี้) */
const EQ_ROW_H = 84
const EQ_ROW_GAP = 10

export function EquipCard({ t, T, gearIcon, gearName, bonusPct, kind = 'weapon', stats }: {
  t: number; T: (th: string, en: string) => string; gearIcon: string; gearName: string; bonusPct: number
  kind?: GearKind
  /** 1 แถว = ตัวเลขใหญ่ · หลายแถว (เช่น DEF กายภาพ / เวท) = เล็กลงนิดหน่อย */
  stats: EquipStat[]
}) {
  const at = TL.equip
  const s = span(t, at - 0.9, at + 2.7, 0.4, 0.35)
  if (!s.on) return null
  const extra = (stats.length - 1) * (EQ_ROW_H + EQ_ROW_GAP)
  const slotTarget = {
    x: EQ_CARD.x + 24 + (560 - 48 - SLOT_W * 3) / 2 + SLOT_W * GEAR_KIND[kind].slot + SLOT_W / 2,
    y: EQ_CARD.y + 236 + extra + SLOT_Y,
  }
  const fly = prog(t, at - 0.65, at)
  const big = stats.length === 1
  return (
    <>
      <div className={`absolute w-[560px] p-6 ${CARD}`} style={{ left: EQ_CARD.x, top: EQ_CARD.y, ...popStyle(s) }}>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gearIcon} alt="" crossOrigin="anonymous" className="w-16 h-16 object-contain" />
          {/* ชื่อบรรทัดเดียวเสมอ — ความสูงการ์ดต้องคงที่ ไอคอนที่บินมาถึงจะลงช่องพอดี (slotTarget) */}
          <div className="min-w-0 flex-1">
            <div className="text-[20px] text-gray-400 font-bold">{t >= at ? T('ใส่เกียร์แล้ว', 'Equipped') : T('กำลังใส่เกียร์', 'Equipping')}</div>
            <div className="font-black text-white leading-tight whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: gearName.length > 16 ? 25 : 30 }}>{gearName} +{GEAR_LEVEL}</div>
          </div>
          <span className="shrink-0 px-3.5 py-1.5 rounded-xl bg-amber-400 text-[26px] font-black text-[#1a1200]">+{(bonusPct * 100).toFixed(0)}%</span>
        </div>
        {stats.map((st, i) => (
          <div key={st.label} className="flex flex-col justify-center" style={{ height: EQ_ROW_H, marginTop: i === 0 ? 16 : EQ_ROW_GAP }}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={st.icon} alt="" className="w-11 h-11" />
              <span className="text-[26px] text-gray-200 font-bold">{st.label}</span>
              <span className="ml-auto font-black text-amber-200 tabular-nums leading-none"
                style={{ fontSize: big ? 50 : 42, textShadow: `0 0 ${14 + 14 * pulse(t, 3) * (t > at + 0.55 && t < at + 1.85 ? 1 : 0)}px rgba(251,191,36,0.75)` }}>
                {fmtInt(countUp(t, at + 0.55 + i * 0.15, at + 1.85 + i * 0.15, st.before, st.after))}
              </span>
            </div>
            <div className="mt-1 text-right text-[22px] text-gray-400 tabular-nums" style={{ opacity: easeOut(prog(t, at + 1.75, at + 2.15)) }}>
              {fmtInt(st.before)} × {(1 + bonusPct).toFixed(2)}
            </div>
          </div>
        ))}
        <div className="mt-3 pt-3 border-t-2 border-white/10">
          <GearSlots t={t} equip={{ at, icon: gearIcon, kind }} />
        </div>
      </div>
      {t >= at - 0.65 && fly < 1 && (() => {
        const k = easeInOut(fly)
        const x = 640 + (slotTarget.x - 640) * k
        const y = 30 + (slotTarget.y - 30) * k - Math.sin(k * Math.PI) * 90
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={gearIcon} alt="" crossOrigin="anonymous" className="absolute w-[120px] h-[120px] object-contain"
            style={{ left: x, top: y, transform: `translate(-50%,-50%) rotate(${k * 540}deg) scale(${1.4 - 0.7 * k})`, filter: 'drop-shadow(0 0 22px rgba(253,224,71,0.95))' }} />
        )
      })()}
    </>
  )
}

// ── หลอดเลือด / ฮิล / ตาย ───────────────────────────────

/** 1 รอบการตี: รีเลือดตอน refill · โดนตอน at · ดาเมจ dmg · เลือดเต็ม max (เปลี่ยนได้ เช่น ใส่เกียร์พลังชีวิตแล้ว) */
export type Round = { refill: number; at: number; dmg: number; max: number }
/** สร้าง 4 รอบจากคิวในฉาก (CUE_IDS) */
export const makeRounds = (c: OverlayCtx, dmg: number[], max: number[]): Round[] =>
  CUE_IDS.map((id, i) => ({ refill: TL.refill[i], at: c.hitsOf(id)[0] ?? TL.hitFallback[i], dmg: dmg[i], max: max[i] }))
const dies = (r: Round) => r.dmg >= r.max

/**
 * หลอดเลือดเหนือหัวของ actor
 *   ฮิล (TL.refill)   เฉพาะรอบที่แล้วโดนตีแต่ไม่ตาย: หลอดแดงวิ่งเต็ม + แสงเขียววาบ (+ <Heals> ที่ตัว)
 *                     รอบแรก / เพิ่งเกิดใหม่ = เลือดเต็มอยู่แล้ว หลอดเต็มโผล่มาเลย ไม่ฮิล
 *   โดนตี             หลอดขาวค้างที่ค่าเดิม · หลอดแดงไหลลง · ค้างสักพักหลอดขาวค่อยหดตาม · หลอดสั่น + แสงวาบ
 *   ตัวเลขดาเมจ       ป้ายแดงเด้งขึ้นบนหลอด ค้างไว้จนรีเลือดรอบถัดไป
 *   ตาย (ดาเมจ ≥ HP)  หลอดจางหายให้วิญญาณลอยผ่าน จนกว่าจะรีเลือดรอบถัดไป
 *   ซ่อนเมื่อ actor หลุดเฟรม หรือการ์ดสูตรสกิลบังอยู่
 */
export function HpBar({ c, t, actor, rounds }: { c: OverlayCtx; t: number; actor: string; rounds: Round[] }) {
  const s = span(t, rounds[0].refill - 0.1, TL.summary, 0.35, 0.4)
  if (!s.on) return null
  const pos = c.actorAt(actor)
  if (!pos) return null
  const sp = c.project({ x: pos.x, y: pos.y - 205 })
  // รอบปัจจุบัน = รีเลือดล่าสุดที่ผ่านมา · ตีที่อยู่หลังรีเลือดนั้น
  const round = rounds.reduce((r, x, i) => (t >= x.refill ? i : r), 0)
  const cur = rounds[round]
  const prev = rounds[round - 1]
  const max = cur.max
  const prevDead = !!prev && dies(prev)
  const dead = dies(cur) ? prog(t, cur.at + 0.85, cur.at + 1.15) : 0
  const back = prevDead ? prog(t, cur.refill - 0.05, cur.refill + 0.3) : 1
  const vis = s.alpha * clamp01((1330 - sp.x) / 120) * clamp01((sp.x + 50) / 120)
    * (1 - span(t, TL.skillCard[0] - 0.1, TL.skillCard[1] + 0.1, 0.3, 0.3).alpha) * (1 - dead) * back
  if (vis <= 0) return null

  // ฮิลเฉพาะรอบที่เลือดไม่เต็ม · เลือดที่เหลือคิดตามหลอดเต็มของรอบนี้ (ใส่เกียร์ HP แล้วหลอดยาวขึ้น)
  const heals = !!prev && !prevDead
  const prevLeft = heals ? Math.max(0, Math.min(max, prev.max - prev.dmg)) : max
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
  const refillGlow = heals && t >= cur.refill ? 1 - prog(t, cur.refill + 0.35, cur.refill + 0.9) : 0
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
 * เอฟเฟกต์ฮิลเลือดที่ตัว actor (~1.4 วิ)
 *   วงแสงรอบเท้า + เสาแสงเขียวที่ขอบล่างโค้งรับรอบตัว (ทรงกระบอก) · แสงเขียวอาบตัว · เครื่องหมาย + ลอยขึ้นรอบตัว
 *   (ตำแหน่ง/จังหวะสุ่มแบบคงที่ เลื่อนเวลากลับมาดูก็เหมือนเดิม)
 */
const HEAL_DUR = 1.4
const rand = (i: number) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v) }
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  x: (rand(i) - 0.5) * 130, delay: rand(i + 50) * 0.55, rise: 70 + rand(i + 100) * 60, size: 20 + rand(i + 150) * 16, y0: rand(i + 200) * 40,
}))
function HealFx({ c, t, at, actor }: { c: OverlayCtx; t: number; at: number; actor: string }) {
  const u = t - at
  if (u < 0 || u > HEAL_DUR) return null
  const p = c.actorAt(actor)
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
      <div className="absolute rounded-full pointer-events-none" style={{
        left: feet.x, top: feet.y - 85 * z, width: 230 * z, height: 260 * z, transform: 'translate(-50%,-50%)', opacity: glow,
        background: 'radial-gradient(ellipse, rgba(134,239,172,0.45), rgba(74,222,128,0.18) 45%, rgba(74,222,128,0) 70%)',
      }} />
      <div className="absolute rounded-[50%] pointer-events-none" style={{
        left: feet.x, top: feet.y, width: ringW, height: ringH, transform: 'translate(-50%,-50%)', opacity: glow,
        border: `${line}px solid rgba(187,247,208,0.8)`, boxShadow: '0 0 16px rgba(74,222,128,0.8)',
        background: 'radial-gradient(ellipse, rgba(74,222,128,0.4), rgba(74,222,128,0) 70%)',
      }} />
      <div className="absolute pointer-events-none" style={{
        left: feet.x - ringW / 2, top: feet.y + ringH / 2 - colH, width: ringW, height: colH, opacity: glow * 0.6,
        borderRadius: arc, background: 'linear-gradient(to top, rgba(187,247,208,0.7), rgba(134,239,172,0.3) 50%, rgba(134,239,172,0))',
      }} />
      <div className="absolute pointer-events-none" style={{
        left: feet.x - ringW / 2, top: feet.y + ringH / 2 - colH, width: ringW, height: colH, opacity: glow,
        borderRadius: arc, borderBottom: `${line * 1.3}px solid rgba(220,252,231,0.95)`,
        filter: 'drop-shadow(0 0 6px #4ade80) drop-shadow(0 0 12px #22c55e)',
      }} />
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
/** ฮิลเฉพาะรอบที่เลือดไม่เต็ม (รอบที่แล้วโดนตีแต่ไม่ตาย) — รอบแรกและหลังเกิดใหม่เลือดเต็มอยู่แล้ว */
export const Heals = ({ c, t, actor, rounds }: { c: OverlayCtx; t: number; actor: string; rounds: Round[] }) => (
  <>{rounds.map((r, i) => (i > 0 && !dies(rounds[i - 1]) ? <HealFx key={r.refill} c={c} t={t} at={r.refill} actor={actor} /> : null))}</>
)

/**
 * จุดที่วิญญาณออกจากร่าง = กลางร่างในเฟรมสุดท้ายของท่า knockback (ร่างล้มนอนอยู่ ไม่ใช่ท่ายืน)
 * คำนวณจากไฟล์ .sam จริง แปลงเป็นพิกัดเวทีแบบเดียวกับที่ฉากวาดตัวละคร (จุดยืน · สเกล · กลับด้าน)
 */
const fallenCache = new WeakMap<RangerRuntime, { x: number; y: number } | null>()
function fallenCenter(c: OverlayCtx, actor: string): { x: number; y: number; scale: number } | null {
  const a = c.scene.actors.find(x => x.id === actor)
  const rt = a && assets.get(a.assetId)
  const p = c.actorAt(actor)
  if (!a || !p || rt?.kind !== 'ranger') return null
  if (!fallenCache.has(rt)) {
    const n = rt.sam.animations['knockback']?.length ?? 0
    const box = n ? frameBBox(rt.sam, rt.sprites, 'knockback', n - 1) : null
    fallenCache.set(rt, box ? { x: (box.x0 + box.x1) / 2 - rt.stand.x, y: (box.y0 + box.y1) / 2 - rt.stand.y } : null)
  }
  const off = fallenCache.get(rt) ?? { x: 0, y: -60 }
  return { x: p.x + (a.flip ? -off.x : off.x) * a.scale, y: p.y + off.y * a.scale, scale: a.scale }
}

/** วิญญาณ eff_die_enemy: ออกจากกลางร่างที่ล้มอยู่ ลอยขึ้นส่ายเบาๆ แล้วจางหาย (ทุกรอบที่ตาย) */
export function Souls({ c, t, actor, rounds }: { c: OverlayCtx; t: number; actor: string; rounds: Round[] }) {
  const fallen = fallenCenter(c, actor)
  if (!fallen) return null
  const zoom = (c.project({ x: 100, y: 0 }).x - c.project({ x: 0, y: 0 }).x) / 100
  return (
    <>
      {rounds.filter(dies).map(r => {
        const at = r.at + DEATH.soul
        const p = prog(t, at, at + DEATH.soulDur)
        if (t < at || p >= 1) return null
        const rise = easeOut(p) * 190 / zoom
        const sway = Math.sin(p * Math.PI * 3) * 12 * (0.3 + p) / zoom
        const sp = c.project({ x: fallen.x + sway, y: fallen.y - rise })
        const alpha = Math.min(easeOut(prog(t, at, at + 0.25)), 1 - easeInOut(prog(t, at + DEATH.soulDur * 0.5, at + DEATH.soulDur)))
        return (
          <SamSprite key={r.at} base="hd/unit/effect/eff_die/eff_die_enemy" clip="die" frame={Math.floor((t - at) * FPS)} loop anchorFrame={0}
            x={sp.x} y={sp.y} scale={fallen.scale * zoom} alpha={alpha} />
        )
      })}
    </>
  )
}

/** กล่องสรุปท้ายคลิป (พื้นมืด + การ์ดกลางจอ) */
export function SummaryShell({ t, T, title, children, top = -335 }: { t: number; T: (th: string, en: string) => string; title: string; children: React.ReactNode; top?: number }) {
  const s = span(t, TL.summary, TL.end, 0.55, 0.6)
  if (!s.on) return null
  return (
    <div className="absolute inset-0 bg-black/70" style={{ opacity: s.alpha }}>
      <div className={`absolute left-1/2 top-1/2 w-[900px] -ml-[450px] p-8 ${CARD}`} style={{ marginTop: top, ...popStyle(s, 40) }}>
        <div className="text-[24px] font-black text-amber-300">{T('สรุป', 'Summary')}</div>
        <div className="text-[40px] font-black text-white leading-tight">{title}</div>
        {children}
      </div>
    </div>
  )
}
