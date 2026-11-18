// ====================================================
// ฐานยืนแบบผู้เล่นใหม่ — Normal เลเวล 1-20
//
// ช่วงนี้เกมโชว์ฐานแค่ 5 ฐาน (ทีม A) เรียงเป็นแนวนอน ขนาดเท่ากันหมด
// ส่วนฐาน 6-10 (ฝั่งกระจก) ยังไม่เปิดให้ใช้ จึงไม่แสดง
// และเวทีกลางเล่นท่า basic_ready แทน ready (ไฟล์เดียวกัน คนละ anim)
//
// ====================================================

import type { DrawUnit } from './scene'
import type { ProfileTier } from './profile'

/** ช่องฐานฝั่งซ้ายเรียงตามลำดับช่องทีม A (ซ้ายไปขวาในแถว) */
const ROW_KEYS = ['rangerbase', 'rangerbase2', 'rangerbase3', 'rangerbase4', 'rangerbase5']

/** เลเวลสูงสุดของช่วงผู้เล่นใหม่ */
export const ROOKIE_MAX_LEVEL = 20

export interface RookieRow {
  x: number       // จุดกลางของฐานตัวซ้ายสุด
  y: number
  gap: number     // ระยะห่างระหว่างฐาน
  scale: number   // ขนาดของทั้งกลุ่มฐาน (ทุกช่องเท่ากัน)
  ranger: number  // ตัวคูณขนาดตัวละครอีกชั้น — แยกจากขนาดฐาน
}

// ค่าที่จูนจบแล้ว (แผงจูนถูกถอดออกไปแล้ว)
export const ROOKIE_ROW: RookieRow = { x: 138, y: 429, gap: 184, scale: 0.98, ranger: 1.25 }

/** อยู่ในช่วงผู้เล่นใหม่ไหม — Normal เลเวล 1-20 เท่านั้น */
export function isRookie(tier: ProfileTier, level: string): boolean {
  if (tier !== 'normal') return false
  const lv = parseInt(level || '0', 10)
  return Number.isFinite(lv) && lv >= 1 && lv <= ROOKIE_MAX_LEVEL
}

/** ท่าของเวทีกลางในช่วงผู้เล่นใหม่ — ไฟล์เดิม เปลี่ยนแค่ชื่อ anim */
const ROOKIE_STAGE_ANIM = 'basic_ready'

/** จัดฐาน 5 ช่องเป็นแถวแนวนอนขนาดเท่ากัน แล้วตัดฝั่งกระจกกับหอกลางทิ้ง */
export function applyRookieRow(units: DrawUnit[], cfg: RookieRow): DrawUnit[] {
  const out: DrawUnit[] = []
  for (const u of units) {
    // ฐาน 6-10 = ฝั่งกระจก — ช่วงนี้ยังไม่เปิด
    if (u.key.startsWith('mirrorside:')) continue
    // หอกลางเวทีก็ยังไม่มีในช่วงนี้
    if (u.key === 'tower') continue

    // เวทีกลางใช้ท่าของช่วงผู้เล่นใหม่
    if (u.key === 'mainstage' && u.src?.kind === 'anim') {
      out.push({ ...u, src: { ...u.src, anim: ROOKIE_STAGE_ANIM } })
      continue
    }

    const i = ROW_KEYS.indexOf(u.key)
    if (i < 0) { out.push(u); continue }

    out.push({
      ...u,
      x: cfg.x + i * cfg.gap,
      y: cfg.y,
      // ขนาดเท่ากันทุกฐาน — ตั้ง masterScale ให้เท่ากันด้วย ไม่งั้นชิ้นที่ยกเว้นการย่อ
      // (ตัวละคร / เลเวล / ธาตุ) จะยังอ้างขนาดของกลุ่มแม่เดิมแล้วไม่โตตาม
      scale: cfg.scale,
      masterScale: cfg.scale,
      // ตัวละครคูณขนาดเพิ่มอีกชั้นจากที่ฐานโตไปแล้ว
      parts: u.parts?.map(p => (p.id === 'idle' ? { ...p, scale: p.scale * cfg.ranger } : p)),
      // ทุกฐานอยู่ระดับเดียวกันแล้ว ไม่ต้องยืมแกน Y ของไอคอนธาตุจากช่องอื่น
      elemYRef: null,
    })
  }
  return out
}
