// ====================================================
// โปรไฟล์ผู้เล่นของหน้า /lobby — ส่วนที่คนทั่วไปใช้
//
// เลือกรูป + ระดับ + เลเวล + ความยาวหลอด แล้วชิ้นส่วนทั้ง 7 ในกลุ่มโปรไฟล์
// (เสาธง / ธง / ข้อความระดับ / ข้อความ level / หลอด bg / หลอด bar / ชุดตัวเลข)
// ถูกสลับให้ครบชุดตามระดับที่เลือก ไม่ต้องไล่เปลี่ยนทีละชิ้นเอง
//
// ที่นี่เก็บ "ตารางว่าระดับไหนใช้ไฟล์ไหน" ล้วนๆ ไม่มี React ไม่มี canvas
// ====================================================

import {
  NUM_SET_OPTIONS, PROFILE_POLE_OPTIONS, PROFILE_FLAG_OPTIONS, FLAG_TEXT_OPTIONS,
  LEVEL_TEXT_OPTIONS, GAUGE_BAR_OPTIONS, GAUGE_BG_OPTIONS, PROFILE_IMG_OPTIONS, optionValue,
} from './scene'
import type { DrawUnit, ScenePart } from './scene'

export type ProfileTier = 'normal' | 'master' | 'super' | 'ultra' | 'legend' | 'superlegend'

/** ชิ้นส่วนครบชุดของแต่ละระดับ — ค่าที่เขียนคือ "ชื่อตัวเลือก" ในตารางของ scene.ts
 *  '' = ระดับนั้นไม่มีชิ้นนั้น (เช่นระดับเริ่มต้นไม่มีเสาธงและไม่มีข้อความระดับ) */
export interface TierLook {
  key: ProfileTier
  label: string
  num: string        // ชุดรูปตัวเลขเลเวล
  pole: string       // เสาธง — มีเฉพาะระดับตำนานขึ้นไป
  flag: string       // ธง
  flagText: string   // ข้อความบนธง — ระดับเริ่มต้นไม่มี
  levelText: string  // ป้ายคำว่า Level
  bar: string        // หลอด
  bg: string         // พื้นหลังหลอด
  /** ยกป้าย Level กับชุดตัวเลขขึ้นเท่าไหร่ (ติดลบ = ขึ้น) — ใช้กับระดับที่ไม่มีข้อความบนธง
   *  ระดับเริ่มต้นไม่มีข้อความธง ถ้าไม่ยกขึ้นจะเหลือช่องว่างค้างอยู่ตรงที่ข้อความเคยอยู่ */
  textDy: number
}

export const PROFILE_TIERS: TierLook[] = [
  { key: 'normal',      label: 'Normal',       num: 'normal', pole: '',            flag: 'normal',      flagText: '',            levelText: 'normal', bar: 'normal', bg: 'normal', textDy: -20.5 },
  { key: 'master',      label: 'Master',       num: 'master', pole: '',            flag: 'master',      flagText: 'master',      levelText: 'master', bar: 'normal', bg: 'master', textDy: 0 },
  { key: 'super',       label: 'Super Master', num: 'super',  pole: '',            flag: 'super',       flagText: 'super',       levelText: 'super',  bar: 'normal', bg: 'super',  textDy: 0 },
  { key: 'ultra',       label: 'Ultra',        num: 'ultra',  pole: '',            flag: 'ultra',       flagText: 'ultra',       levelText: 'ultra',  bar: 'ultra',  bg: 'ultra',  textDy: 0 },
  // ตำนานกับซุปเปอร์ตำนานใช้ชุดตัวเลข / ป้าย Level / หลอด ชุดเดียวกัน ต่างกันที่เสาธง ธง และข้อความบนธง
  { key: 'legend',      label: 'Legend',       num: 'legend', pole: 'legend',      flag: 'legend',      flagText: 'legend',      levelText: 'legend', bar: 'legend', bg: 'legend', textDy: 0 },
  { key: 'superlegend', label: 'Super Legend', num: 'legend', pole: 'superlegend', flag: 'superlegend', flagText: 'superlegend', levelText: 'legend', bar: 'legend', bg: 'legend', textDy: 0 },
]

export const tierLook = (key: ProfileTier): TierLook =>
  PROFILE_TIERS.find(t => t.key === key) ?? PROFILE_TIERS[0]

export interface ProfileState {
  /** ค่าตัวเลือกของรูปโปรไฟล์ (ไม่ใช่ชื่อ label) */
  img: string
  tier: ProfileTier
  level: string
  /** ความยาวหลอดเป็น % ของความกว้างเต็ม */
  gauge: number
  // จำนวนทรัพยากร — เก็บเป็นตัวเลขล้วน (ไม่มีจุลภาค) แล้วค่อยใส่จุลภาคตอนเขียนลงฉาก
  ruby: string
  coin: string
  feather: string
}

// เพดานของแต่ละทรัพยากร — ขนนกยังมีขั้นต่ำเป็นค่า "/N" ของระดับนั้นด้วย (ดู featherCap)
export const RUBY_MAX = 9999
export const COIN_MAX = 999999999
export const FEATHER_MAX = 999999

// ค่าตั้งต้น — ระบุรูปไว้ตรงๆ ไม่ปล่อยว่าง ไม่งั้นรูปในแผงกับรูปในภาพจะคนละใบ
// (แผงจะถอยไปใช้ตัวเลือกแรกของลิสต์ ส่วนภาพยังใช้ค่าที่ตั้งไว้ในฉาก)
export const PROFILE_DEFAULT: ProfileState = {
  img: optionValue(PROFILE_IMG_OPTIONS, 'profile_img_001'),
  tier: 'ultra', level: '36', gauge: 50,
  feather: '3151', ruby: '643', coin: '230015461',
}

const PROFILE_UNIT_KEY = 'profile'

// ── จำนวนทรัพยากร ──
// แต่ละแถบในฉากใช้ช่องข้อความคนละช่องกัน (ขนนกมีสามช่อง: ค่าปัจจุบัน / เพดาน / ป้าย max)
const RESOURCE_SLOT: Record<string, { part: string; key: 'ruby' | 'coin' | 'feather' }> = {
  stage1: { part: 'txt1', key: 'ruby' },
  stage2: { part: 'txt1', key: 'coin' },
  stage3: { part: 'txt3', key: 'feather' },
}

/** ใส่จุลภาคคั่นหลักพัน — 1199 → "1,199" */
export const groupDigits = (v: string): string => {
  const d = v.replace(/\D/g, '')
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
}

// ── เพดานขนนก ("/N") ──
// ถอดจากตัวอย่างบัญชีจริง 20 จุด — เข้าทุกจุดพอดี
//
//   cap = ฐานของระดับนั้น + ceil(level / ทุกกี่เลเวลได้ 1)
//
// รูปแบบที่เห็น:
//   • Normal ถึง Ultra ใช้ 5 เลเวลต่อ 1 เท่ากันหมด และ "ฐาน" ขยับทีละ +25 ต่อระดับ
//     (4 → 29 → 54 → 79) ซึ่งมากกว่าที่ 99 เลเวลในระดับหนึ่งจะไต่ได้ (+20)
//     → ข้ามระดับทีนึงได้แถมอีก 6 เช่น Normal 99 = /24 แต่ Master 1 = /30
//   • Legend เปลี่ยนเป็น 3 เลเวลต่อ 1 และตรงนี้ต่อกันสนิทไม่มีแถม
//     Ultra 99 = /99 → Legend 1 = /100 / Legend 99 = /132 → Super Legend 1 = /133
const FEATHER_RULE: Record<ProfileTier, { base: number; per: number }> = {
  normal:      { base: 4,   per: 5 },
  master:      { base: 29,  per: 5 },
  super:       { base: 54,  per: 5 },
  ultra:       { base: 79,  per: 5 },
  legend:      { base: 99,  per: 3 },
  superlegend: { base: 132, per: 3 },
}

/** เพดานขนนกของระดับ + เลเวลนั้น */
export function featherCap(tier: ProfileTier, level: string | number): number {
  const lv = Math.max(1, typeof level === 'number' ? level : parseInt(level || '1', 10) || 1)
  const r = FEATHER_RULE[tier]
  return r.base + Math.ceil(lv / r.per)
}

function overridePart(p: ScenePart, st: ProfileState, t: TierLook): ScenePart {
  // ชิ้นที่ระดับนั้นไม่มี → ปิดไปเลย (ไม่ใช่แค่ค่าว่าง เพราะจะได้ไม่กินที่)
  const pick = (opts: Parameters<typeof optionValue>[0], label: string): ScenePart =>
    label
      ? { ...p, option: optionValue(opts, label) }
      : { ...p, option: '', visible: false }

  switch (p.id) {
    case 'pic':       return st.img ? { ...p, option: st.img } : p
    case 'pole':      return pick(PROFILE_POLE_OPTIONS, t.pole)
    case 'flag':      return pick(PROFILE_FLAG_OPTIONS, t.flag)
    case 'flagtext':  return pick(FLAG_TEXT_OPTIONS, t.flagText)
    case 'leveltext': return { ...pick(LEVEL_TEXT_OPTIONS, t.levelText), dy: p.dy + t.textDy }
    case 'gaugebg':   return pick(GAUGE_BG_OPTIONS, t.bg)
    case 'gaugebar':  return { ...pick(GAUGE_BAR_OPTIONS, t.bar), pct: st.gauge }
    case 'lvnum':     return { ...p, option: optionValue(NUM_SET_OPTIONS, t.num), text: st.level, dy: p.dy + t.textDy }
    // 'frame' กับชิ้นอื่นที่ไม่ได้ระบุ — ปล่อยตามที่ตั้งไว้ในฉาก
    default:          return p
  }
}

/** ทับค่าในรายการที่พร้อมวาดแล้ว — เรียกต่อจาก expandScene() / applyTeams() */
export function applyProfile(units: DrawUnit[], st: ProfileState): DrawUnit[] {
  const t = tierLook(st.tier)
  return units.map(u => {
    if (!u.parts) return u
    if (u.key === PROFILE_UNIT_KEY) {
      return { ...u, parts: u.parts.map(p => overridePart(p, st, t)) }
    }
    const slot = RESOURCE_SLOT[u.key]
    if (!slot) return u
    // ขนนกมีช่องเพดาน "/N" ของตัวเอง และค่าที่แสดงต้องไม่ต่ำกว่าเพดานนั้น
    if (slot.key === 'feather') {
      const cap = featherCap(st.tier, st.level)
      const have = Math.max(cap, parseInt(st.feather || '0', 10) || 0)
      return {
        ...u,
        parts: u.parts.map(p =>
          p.id === 'txt3' ? { ...p, text: groupDigits(String(have)) }
            : p.id === 'txt2' ? { ...p, text: `/${groupDigits(String(cap))}` }
            : p),
      }
    }
    return {
      ...u,
      parts: u.parts.map(p => (p.id === slot.part ? { ...p, text: groupDigits(st[slot.key]) } : p)),
    }
  })
}
