// ====================================================
// fortress.ts — ป้อมปราการกลางเวทีของหน้า /lobby (ส่วนที่คนทั่วไปเลือกเองได้)
//
// ป้อมทุกตัวอยู่ที่ lerico: twr01 … twr78 — มี <id>-body.sam + <id>-thum.png ครบทุกตัว
// และใช้ชื่อท่าเหมือนกันหมด จึงสลับได้แค่เปลี่ยนโฟลเดอร์ (ท่าบังคับเป็น normal_idle)
// ตำแหน่งยึดจาก "เงา" ในไฟล์ (byShadow) เหมือนเดิม → ตัวไหนก็ยืนบนฐานพอดี
// ====================================================

import { refToValue, type DrawUnit } from './scene'

const LERICO = 'https://rangers.lerico.net/res'

/** twr01 … twr78 */
export const FORTRESS_COUNT = 78
export const FORTRESS_IDS: string[] = Array.from({ length: FORTRESS_COUNT }, (_, i) => `twr${String(i + 1).padStart(2, '0')}`)

/** ท่าของป้อม — บังคับท่ายืนปกติเสมอ */
const FORTRESS_ANIM = 'normal_idle'
/** ค่าเริ่มต้น = ป้อมที่ฉากใช้มาตลอด */
export const FORTRESS_DEFAULT = 'twr45'

export const fortressThumb = (id: string) => `${LERICO}/${id}/${id}-thum.png`
/**
 * รูป thum ของ twr10 ขึ้นไปเป็นผืน 432×228 ที่ตัวป้อมอยู่กลาง กว้างแค่ ~55–65% → ในช่องสี่เหลี่ยมดูเล็ก
 * จึงขยาย 1.6 เท่า (ตัดขอบใสสองข้างทิ้ง) · twr01–twr09 รูปพอดีตัวอยู่แล้ว ไม่ต้องขยาย
 */
export const fortressThumbScale = (id: string) => (Number(id.slice(3)) >= 10 ? 1.6 : 1)

const FORTRESS_UNIT_KEY = 'tower'
const FORTRESS_PART_ID = 'twr'

/** ทับตัวหอในกลุ่ม "tower" ด้วยป้อมที่เลือก — เรียกต่อจาก expandScene() / applyTeams() เหมือน applyProfile */
export function applyFortress(units: DrawUnit[], id: string): DrawUnit[] {
  if (!FORTRESS_IDS.includes(id)) return units
  const option = refToValue({ kind: 'anim', dir: `${LERICO}/${id}`, name: `${id}-body`, anim: FORTRESS_ANIM, byShadow: true })
  return units.map(u =>
    u.key === FORTRESS_UNIT_KEY && u.parts
      ? { ...u, parts: u.parts.map(p => (p.id === FORTRESS_PART_ID ? { ...p, option } : p)) }
      : u)
}
