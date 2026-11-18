// ====================================================
// การ์ดเรนเจอร์แบบผลสุ่มตู้กาชา (.result-ranger ของหน้า /gacha/[id]) — วาดลง Canvas
// ชั้นเดียวกับในตู้: แสงหมุน → ฐาน → รูปเรนเจอร์ → ดาว → ไอคอนธาตุ
// ขนาด/ตำแหน่งทุกค่าคัดมาจาก CSS ของการ์ดฝั่ง desktop (globals.css) หน่วยเป็น px ที่ scale = 1
// จุดอ้างอิงของการ์ด = กึ่งกลางขอบล่างของกล่อง (ตรงที่ฐานวางอยู่)
// ====================================================

/** กล่องการ์ด 120x146 */
export const CARD_W = 120
/** แสงหมุน 190x190 วางเลยขอบล่างลงไป 10px โปร่ง 0.6 (ไฟล์เฟรมวาดบนผืน 200x200) */
export const LIGHT_SIZE = 190
export const LIGHT_DROP = 10
export const LIGHT_ALPHA = 0.6
export const LIGHT_SRC_SIZE = 200
/** รูปเรนเจอร์ย่อ 0.56 ยึดขอบล่างกึ่งกลาง ยกขึ้นจากขอบล่าง 32% ของความกว้างกล่อง */
export const RANGER_SCALE = 0.56
export const RANGER_LIFT = CARD_W * 0.32
/** ดาวกว้าง 70% ของกล่อง ยกขึ้น 38% ของความสูงตัวเอง */
export const STAR_W = CARD_W * 0.7
export const STAR_LIFT = 0.38
/** ไอคอนธาตุ 27x27 ชิดซ้ายของกล่อง สูงจากขอบล่าง 49px */
export const ELEM_SIZE = 27
export const ELEM_BOTTOM = 49

/** เงาวงรีใต้ฐาน (ในเกมมี แต่ตู้กาชาบนเว็บไม่มี) — กว้างกว่าฐานนิดหน่อย จุดกลางอยู่ใกล้ขอบล่างของฐาน
 *  สีดำทึบทั้งวงแบบโปร่งแสงนิดหน่อย ขอบคม (ไม่ฟุ้ง) */
export const SHADOW_W = CARD_W * 1.1
export const SHADOW_H = 26
export const SHADOW_DY = -3
export const SHADOW_ALPHA = 0.32

export const BACKLIGHT_IMG = '/gacha/animation/backlight/fx02-backlight-01.png'
export const BACKLIGHT_FRAMES = '/gacha/animation/backlight/backlight-frames.json'

const ELEMENT_ICON: Record<string, string> = {
  fire: '/gacha/images/Fire.png',
  water: '/gacha/images/Water.png',
  wood: '/gacha/images/Tree.png',
  light: '/gacha/images/Light.png',
  dark: '/gacha/images/Dark.png',
}

export const thumbUrl = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`
export const THUMB_RE = /-thum\.png$/

/** รูปดาว — ชื่อไฟล์ตรงกับ tierIconKey เช่น "8+" → 8+star.png */
export const starUrl = (gradeKey: string) => `/gacha/images/${gradeKey.replace('#', '%23')}.png`

/** ฐานยืน — กฎเดียวกับ getBase() ของตู้กาชา */
export function baseUrl(gradeKey: string): string {
  if (gradeKey === '9star') return '/gacha/images/tan9.png'
  if (gradeKey === '8+star' || gradeKey === '7+star') return '/gacha/images/tan8+.png'
  if (gradeKey === '8#star') return '/gacha/images/tan8%23.png'
  return '/gacha/images/tan8.png'
}

/** ไอคอนธาตุ — ตู้กาชาโชว์เฉพาะตัวที่เปิดช่องธาตุแล้ว (elementOpen "2") */
export function elementUrl(element: string | null | undefined, elementOpen: string | null | undefined): string | null {
  if (elementOpen !== '2' || !element) return null
  return ELEMENT_ICON[element.toLowerCase()] ?? null
}

/** ข้อมูลที่การ์ดหนึ่งใบต้องใช้ */
export interface CardInfo {
  rangerId: string
  /** "8+star" ฯลฯ — ยังไม่รู้ = null (วาดฐาน 8 ดาวรอไปก่อน ไม่วาดดาว) */
  gradeKey: string | null
  element: string | null
  /** จุดกึ่งกลางเงาตามแนวนอน เป็นสัดส่วน 0..1 ของกรอบตัวละคร (render.shadowCenter.x จาก API)
   *  รูป -thum.png ถูกครอปชิดตัวละคร (เว้นขอบใสราว 2px) สัดส่วนนี้จึงชี้ตรงกลางเงาในรูปได้เลย
   *  null = ยังไม่รู้ → วางกึ่งกลางรูปแบบตู้กาชา */
  shadowX: number | null
}

/** URL ของทุกชั้นในการ์ด (ไม่รวมแสงหมุนที่โหลดแยก) */
export function cardUrls(c: CardInfo): { base: string; ranger: string; star: string | null; element: string | null } {
  return {
    base: baseUrl(c.gradeKey ?? '8star'),
    ranger: thumbUrl(c.rangerId),
    star: c.gradeKey ? starUrl(c.gradeKey) : null,
    element: c.element,
  }
}
