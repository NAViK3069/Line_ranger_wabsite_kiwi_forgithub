// ====================================================
// ทีมเรนเจอร์ของหน้า /lobby — ส่วนที่คนทั่วไปใช้
//
// ทีม A = 5 ช่องฝั่งซ้าย, ทีม B = 5 ช่องฝั่งขวา (ฝั่งกระจก)
// เลือกเรนเจอร์ + ใส่เลเวล แล้วฐานยืน/เอฟเฟค/ดาว/ยศ/ธาตุ ถูกคิดให้เองตามกฎของเกม
//
// ที่นี่เก็บ "กฎ" ล้วนๆ ไม่มี React ไม่มี canvas — ทดสอบ/อ่านทวนได้เป็นตารางเดียว
// ส่วนการเอาไปทับค่าในฉาก อยู่ที่ applyTeams() ท้ายไฟล์
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import {
  BASE_OPTIONS, MAXFX_OPTIONS, STAR_OPTIONS, RANK_OPTIONS, ELEMENT_OPTIONS, TALENT_OPTIONS, optionValue,
} from './scene'
import type { DrawUnit, ScenePart } from './scene'

export const SLOT_COUNT = 5
export type TeamSide = 'A' | 'B'

export interface TeamSlot {
  rangerId: string | null
  /** เลเวลที่ผู้ใช้ตั้ง — เริ่มที่ 1 เสมอตอนเพิ่งเลือก แล้วกดปุ่ม Max หรือพิมพ์เองได้ */
  level: number
  /** ระดับพรสวรรค์ 0-4 (0 = ไม่โชว์) — เลือกได้เฉพาะเรนเจอร์ที่มีพรสวรรค์จริง */
  talent: number
}

export const EMPTY_SLOT: TeamSlot = { rangerId: null, level: 1, talent: 0 }

export const emptyTeam = (): TeamSlot[] => Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT }))

// ── ข้อมูลเรนเจอร์เท่าที่กฎฐานยืนต้องใช้ ──
export interface RangerFacts {
  id: string
  tier: 'base8' | 'ultra' | 'hyper' | 'base9'
  grade: number
  /** "6" | "7" | "7+" | "8" | "8+" | "8#" | "9" — ตรงกับชื่อไฟล์ดาว */
  tierIconKey: string
  /** เลเวลสูงสุดที่ผู้เล่นทำได้จริง (รวมปลดลิมิตเต็ม) เช่น hyper = 240 */
  playerMaxLevel: number
  element: string | null
  /** กฎข้อ 3: 7★ ที่ไม่มีร่างต่ำกว่า 7★ ในสาย และมีร่าง ultra (เช่น u394e-ran) → ใช้ Base_master */
  masterSeven: boolean
  /** เรนเจอร์ตัวนี้มีพรสวรรค์ในเกมไหม — ถ้าไม่มีก็ไม่ให้เลือกโชว์ */
  hasTalent: boolean
}

// ── หน้าตาของช่องหนึ่ง — เก็บเป็น "ชื่อตัวเลือก" ไม่ใช่ URL ให้อ่านทวนกับกฎได้ตรงๆ ──
export interface SlotLook {
  rangerId: string        // '' = ช่องว่าง
  base: string            // ชื่อใน BASE_OPTIONS
  maxfx: string           // '' = ไม่มีเอฟเฟค
  star: string            // '' = ไม่แสดงดาว
  rank: string            // '' = ไม่มีไอคอนยศ
  levelText: string       // '' = ไม่แสดงข้อความเลเวล
  element: string         // '' = ไม่แสดงธาตุ
  talent: string          // '' = ไม่แสดงพรสวรรค์ / 'tlt1'-'tlt3' / 'talent_max'
}

const EMPTY_LOOK: SlotLook = {
  rangerId: '', base: 'Base_none', maxfx: '', star: '', rank: '', levelText: '', element: '',
  talent: '',
}

// ชื่อธาตุจาก API เป็นตัวเล็กและมีชื่อพ้องอยู่บ้าง — map ให้ตรงกับชื่อไฟล์ไอคอนที่เว็บใช้
const ELEM_ALIAS: Record<string, string> = {
  fire: 'Fire', water: 'Water',
  wood: 'Wood', tree: 'Wood', nature: 'Wood', earth: 'Wood', plant: 'Wood',
  light: 'Light', holy: 'Light',
  dark: 'Dark', shadow: 'Dark',
}

/** กฎทั้งหมดของ "เรนเจอร์ตัวนี้ที่เลเวลนี้ หน้าตาช่องเป็นยังไง" อยู่ในฟังก์ชันเดียวนี้ */
export function slotLook(f: RangerFacts | null, level: number, talent = 0): SlotLook {
  if (!f) return EMPTY_LOOK

  const atMax = level >= f.playerMaxLevel

  let base: string
  let maxfx = ''
  let rank = ''

  if (f.tier === 'base9') {
    // 9★ — ฐานเป็นของตัวเอง ไม่ว่าเลเวลไหน
    base = atMax ? 'Base_9_max' : 'Base_9'
    if (atMax) { maxfx = 'myhome-eff03'; rank = 'T_9' }
  } else if (f.tier === 'hyper') {
    base = atMax ? 'Base_hyper_max' : 'Base_hyper'
    if (atMax) { maxfx = 'myhome-eff02'; rank = 'T_hyper' }
  } else if (f.tier === 'ultra') {
    base = atMax ? 'Base_ultra_max' : 'Base_ultra'
    if (atMax) { maxfx = 'ultra_master_deck_effect'; rank = 'T_ultra' }
  } else if (!atMax) {
    // ธรรมดา ยังไม่ max — ฐานเปล่าเหมือนกันหมดไม่ว่ากี่ดาว
    base = 'Base_none'
  } else if (f.grade >= 8 || f.masterSeven) {
    // 8★ max และ 7★ พันธุ์พิเศษ (ไม่มีร่างต่ำกว่า + มีร่างอัลตร้า) ได้ฐานระดับ master
    base = 'Base_master'
    rank = 'T_master'
  } else {
    // 1-7★ ทั่วไปที่ max
    base = 'Base_supper'
    rank = 'T_supper'
  }

  const elemKey = f.element ? ELEM_ALIAS[f.element.toLowerCase()] : undefined
  // ระดับ 0 หรือเรนเจอร์ที่ไม่มีพรสวรรค์ = ไม่โชว์
  const tlt = f.hasTalent && talent >= 1 && talent <= 4 ? talent : 0

  return {
    rangerId: f.id,
    base,
    maxfx,
    star: f.tierIconKey ? `${f.tierIconKey}star` : '',
    rank,
    levelText: String(level),      // เลขล้วน — ป้าย "Lv." เป็นรูปที่ paintLevel ต่อให้เอง
    element: elemKey ?? '',
    talent: tlt === 0 ? '' : tlt === 4 ? 'talent_max' : `tlt${tlt}`,
  }
}

// ── ไปเอาข้อมูลเรนเจอร์มาให้ครบตามที่กฎต้องใช้ ──
// /api/meta/ranger-stats ให้ tier / ดาว / เลเวลสูงสุด / ธาตุ  (แคช Redis 7 วัน)
// /api/ranger/evolve     ให้สายร่าง — ขอเฉพาะ 7★ ธรรมดาเท่านั้น เพราะกฎข้อ 3 ใช้ตัวเดียว
// /api/ranger/talents    บอกว่ามีพรสวรรค์ไหม (แคช 7 วันทั้ง Redis และ CDN)
const factsCache = new Map<string, RangerFacts | null>()

interface StatsShape {
  tier?: RangerFacts['tier']
  grade?: number | null
  tierIconKey?: string
  playerMaxLevel?: number
  element?: string | null
}

export async function fetchRangerFacts(id: string): Promise<RangerFacts | null> {
  const hit = factsCache.get(id)
  if (hit !== undefined) return hit
  try {
    const s = await apiFetch(`/api/meta/ranger-stats?id=${encodeURIComponent(id)}`).then(r => r.json()) as StatsShape
    if (!s.tier) throw new Error('no stats')
    const grade = typeof s.grade === 'number' ? s.grade : 8

    // กฎข้อ 3 — 7★ ธรรมดา ที่ในสายไม่มีร่างต่ำกว่า 7★ เลย และมีร่างอัลตร้าอยู่ (เช่น u394e-ran)
    let masterSeven = false
    if (grade === 7 && s.tier === 'base8') {
      const d = await apiFetch(`/api/ranger/evolve/${encodeURIComponent(id)}`).then(r => r.json())
        .catch(() => ({ chain: [] })) as { chain?: { grade: number | null; tierIconKey: string }[] }
      const chain = d.chain ?? []
      masterSeven = chain.length > 0
        && chain.every(c => (c.grade ?? 0) >= 7)
        && chain.some(c => c.tierIconKey.endsWith('+'))
    }

    const talent = await apiFetch(`/api/ranger/talents/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .catch(() => ({ hasTalent: false })) as { hasTalent?: boolean }

    const facts: RangerFacts = {
      id,
      tier: s.tier,
      grade,
      tierIconKey: s.tierIconKey ?? String(grade),
      playerMaxLevel: s.playerMaxLevel ?? 0,
      element: s.element ?? null,
      masterSeven,
      hasTalent: talent.hasTalent === true,
    }
    factsCache.set(id, facts)
    return facts
  } catch {
    factsCache.set(id, null)
    return null
  }
}

// ── เอาหน้าตาที่คิดได้ไปทับค่าในฉาก ──
// ฉาก (scene.ts) ยังเป็นเจ้าของ "ตำแหน่ง/ขนาด/ระยะเยื้อง" เหมือนเดิมทุกอย่าง
// ทีมทับแค่ "ชิ้นไหนแสดงรูปอะไร" ของ 6 ส่วนย่อยในกลุ่มฐานยืน
//
// ช่องในฉากที่คู่กับช่องทีม — ฝั่งซ้ายคือชิ้นตรงๆ ฝั่งขวาเป็นคีย์ของกลุ่มกระจก
const SLOT_OF_UNIT: Record<string, { side: TeamSide; index: number }> = {}
;['rangerbase', 'rangerbase2', 'rangerbase3', 'rangerbase4', 'rangerbase5'].forEach((id, i) => {
  SLOT_OF_UNIT[id] = { side: 'A', index: i }
  SLOT_OF_UNIT[`mirrorside:${id}`] = { side: 'B', index: i }
})

export const unitSlot = (key: string) => SLOT_OF_UNIT[key] ?? null

function overridePart(p: ScenePart, look: SlotLook): ScenePart {
  const set = (option: string): ScenePart => ({ ...p, option, visible: p.visible && option !== '' })
  switch (p.id) {
    case 'base':    return { ...p, option: optionValue(BASE_OPTIONS, look.base) }
    case 'maxfx':   return set(look.maxfx ? optionValue(MAXFX_OPTIONS, look.maxfx) : '')
    case 'star':    return set(look.star ? optionValue(STAR_OPTIONS, look.star) : '')
    case 'element': return set(look.element ? optionValue(ELEMENT_OPTIONS, look.element) : '')
    // ขนาดไม่ต้องชดเชยตรงนี้ — ตอนวาดจะวัดความสูงจริงของไฟล์แล้วปรับให้เท่ากันเองทุกระดับ
    case 'talent':  return set(look.talent ? optionValue(TALENT_OPTIONS, look.talent) : '')
    // ตัวละคร: ไม่มี dropdown ใช้ text เป็นโค้ดเรนเจอร์ตรงๆ
    case 'idle':    return { ...p, text: look.rangerId, visible: p.visible && look.rangerId !== '' }
    // เลเวล: ไอคอนยศปิดได้ (ค่าว่าง) แต่ข้อความยังต้องขึ้น จึงไม่ผูก visible กับ option
    case 'level':   return {
      ...p,
      option: look.rank ? optionValue(RANK_OPTIONS, look.rank) : '',
      text: look.levelText,
      visible: p.visible && look.levelText !== '',
    }
    default:        return p
  }
}

/** ทับค่าในรายการที่พร้อมวาดแล้ว — เรียกต่อจาก expandScene() */
export function applyTeams(units: DrawUnit[], teams: Record<TeamSide, TeamSlot[]>, facts: Map<string, RangerFacts>): DrawUnit[] {
  return units.map(u => {
    const slot = SLOT_OF_UNIT[u.key]
    if (!slot || !u.parts) return u
    const t = teams[slot.side][slot.index]
    const look = slotLook(t?.rangerId ? facts.get(t.rangerId) ?? null : null, t?.level ?? 1, t?.talent ?? 0)
    return { ...u, parts: u.parts.map(p => overridePart(p, look)) }
  })
}
