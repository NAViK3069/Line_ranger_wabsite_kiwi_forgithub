// ====================================================
// ช่องเรนเจอร์ของหน้า /custom-gacha-ranger — 7 ช่อง (แถวบน 4 / แถวล่าง 3)
//
// แต่ละช่องวาดเป็น "การ์ดผลสุ่มตู้กาชา" (ฐาน + รูปเรนเจอร์ + ดาว + ธาตุ + แสงหมุน) — ดู ./card.ts
// ไม่ใช่ตัวละครอนิเมชั่นแบบ /lobby
// ====================================================

import { refToValue, STAGE_BAR, STAGE_EVENT, STAGE_ICON_OPTIONS, STAGE_PLUS, optionValue } from '../lobby/scene'
import type { DrawUnit, PartOption, SceneItem, ScenePart } from '../lobby/scene'
import { groupDigits, RUBY_MAX } from '../lobby/profile'

export const TOP_ROW = 4
export const BOTTOM_ROW = 3
export const SLOT_COUNT = TOP_ROW + BOTTOM_ROW

export interface GachaSlot {
  rangerId: string | null
}

export const emptySlots = (): GachaSlot[] => Array.from({ length: SLOT_COUNT }, () => ({ rangerId: null }))

// ── ของประกอบฉาก ──
// วางไฟล์ไว้ที่ public/gacha/custom-gacha-ranger/ แล้วเพิ่มเป็น Object ได้จากแผงตั้งค่า
//   .sam + .plist + .png ชื่อเดียวกัน = อนิเมชั่น (เลือกท่าได้) / .png เดี่ยว = รูปนิ่ง
export const PROP_DIR = '/gacha/custom-gacha-ranger'
export const PROP_SECTION = 'ฉากประกอบ'

// ── หมวดของตารางคุม ──
export const STAGE_SECTION = 'แถบทรัพยากร'
export const BUTTON_SECTION = 'ปุ่มด้านล่าง'
export const GACHA_SECTIONS = ['ช่องเรนเจอร์', STAGE_SECTION, BUTTON_SECTION, PROP_SECTION] as const

// ── โค้ดที่ได้จากการปรับแต่ง — ส่งกลับมาแล้วจะเอาไปตั้งเป็นค่าตั้งต้นให้ ──
// ต่างจาก sceneToCode ของ /lobby ตรงที่พิมพ์ src ออกมาด้วย (ของที่เพิ่มเองต้องรู้ว่าเป็นไฟล์ไหน ท่าไหน)
export function gachaSceneToCode(scene: SceneItem[]): string {
  const slim = scene.map(it => ({
    ...it,
    ...(it.parts ? { parts: it.parts.map(p => ({ ...p, options: [] })) } : {}),
  }))
  return `// /custom-gacha-ranger scene — ${scene.length} items\n` + JSON.stringify(slim, null, 2)
}

// ── ขนาดผืนผ้า 16:9 ──
// 1152x648 — สูงใกล้ของเดิม (652) แกน Y ของทุกชิ้นจึงใช้ค่าเดิมได้
// ส่วนแกน X เลื่อนไป +58 ทั้งฉาก ให้ภาพยังอยู่กลางเฟรมที่กว้างขึ้น
export const GACHA_W = 1152
export const GACHA_H = 648

/** ชั้นของการ์ดในกลุ่มช่องเรนเจอร์ — แต่ละชั้นขยับ/ย่อ/ซ่อนแยกกันได้ในตาราง (dx/dy/Size/ลำดับ/Show)
 *  ค่า 0/0/1 = ตำแหน่งเดียวกับการ์ดในตู้กาชาเป๊ะ */
export const CARD_LAYERS = ['light', 'shadow', 'base', 'ranger', 'star', 'element'] as const
export type CardLayer = typeof CARD_LAYERS[number]

const SLOT_IDS = Array.from({ length: SLOT_COUNT }, (_, i) => (i === 0 ? 'slot' : `slot${i + 1}`))

// ตำแหน่งช่องเรนเจอร์ — จูนจากแผงตั้งค่าแล้ว (แถวบน 4 / แถวล่าง 3)
const SLOT_POS: { x: number; y: number; scale: number }[] = [
  { x: 265, y: 313, scale: 1.36 }, { x: 472, y: 313, scale: 1.36 }, { x: 680, y: 313, scale: 1.36 }, { x: 887, y: 313, scale: 1.36 },
  { x: 356, y: 512, scale: 1.35 }, { x: 577, y: 512, scale: 1.36 }, { x: 797, y: 512, scale: 1.35 },
]

const prop = (id: string, name: string, anim: string, x: number, y: number, scale: number, visible = true): SceneItem => ({
  id, label: name, section: PROP_SECTION, x, y, scale, layer: 5, visible,
  src: { kind: 'anim', dir: PROP_DIR, name, anim },
})

// ── แถบทรัพยากรมุมขวาบน: รูบี้ (เหมือน /lobby ทุกอย่าง) → ตั๋วกาชา → M point → ปุ่มเมนูย่อ ──
// ตำแหน่ง/ขนาดของสามชิ้นหลังวัดจากภาพในเกม โดยใช้แถบรูบี้เป็นไม้บรรทัด (ไอคอนรูบี้ถึงปุ่มบวก = 104.5 หน่วย)
// ใช้พื้นแถบ/ปุ่มบวก/ป้ายอีเวนต์ชุดเดียวกับ /lobby — ตั๋วกับ M point ไม่มีปุ่มบวก
// ข้อความชิดขวา: dx คือ "ขอบขวา" ของตัวเลข ยาวขึ้นแล้วงอกไปทางซ้าย
const img = (url: string) => refToValue({ kind: 'image', url })
const GACHA_TICKET = img('/gacha/images/gacha.png')
const M_POINT = img('/gacha/images/Mpoint.png')
const STAGE_ICONS: PartOption[] = [
  ...STAGE_ICON_OPTIONS,
  { label: 'gacha', value: GACHA_TICKET },
  { label: 'Mpoint', value: M_POINT },
]

interface StageDef {
  id: string; label: string; x: number
  bar: { w: number; dx: number }
  plus: { dx: number } | null
  icon: { pick: string; dx: number; dy: number; scale: number }
  text: { text: string; dx: number; scale?: number }
  event: { dx: number; dy: number } | null
}

const stage = ({ id, label, x, bar, plus, icon, text, event }: StageDef): SceneItem => ({
  id, label: `Stage (${label})`, section: STAGE_SECTION,
  x, y: 34, scale: 0.97, layer: 30, visible: true,
  parts: [
    { id: 'bar', label: '1. พื้นแถบ', kind: 'stretch', options: [{ label: 'stage_icon_bg00', value: STAGE_BAR }], option: STAGE_BAR, w: bar.w, cap: 14, dx: bar.dx, dy: 0, scale: 1, order: 0, visible: true },
    { id: 'plus', label: '2. ปุ่มบวก', kind: 'image', options: [{ label: 'stage_plus_icon', value: STAGE_PLUS }], option: plus ? STAGE_PLUS : '', dx: plus?.dx ?? 0, dy: -2, scale: 1.1, order: 1, visible: !!plus },
    { id: 'sicon', label: '3. ไอคอน', kind: 'image', options: STAGE_ICONS, option: optionValue(STAGE_ICONS, icon.pick), dx: icon.dx, dy: icon.dy, scale: icon.scale, order: 2, visible: true },
    { id: 'txt1', label: '4. จำนวน', kind: 'text', options: [], option: '', text: text.text, color: '#ffffff', dx: text.dx, dy: -1, scale: text.scale ?? 0.6, order: 3, visible: true },
    { id: 'sevent', label: '5. ป้ายอีเวนต์', kind: 'image', options: [{ label: 'sub_event', value: STAGE_EVENT }], option: event ? STAGE_EVENT : '', dx: event?.dx ?? 0, dy: event?.dy ?? 0, scale: 1, order: 4, visible: !!event },
  ] satisfies ScenePart[],
})

const STAGES: SceneItem[] = [
  // รูบี้ — ค่าชุดเดียวกับ stage1 ของ /lobby (แถบ/ปุ่มบวก/ไอคอน/ข้อความ/ป้ายอีเวนต์)
  stage({
    id: 'stage1', label: 'ruby', x: 747,
    bar: { w: 122, dx: -14 }, plus: { dx: 28 },
    icon: { pick: 'ruby', dx: -82, dy: -9, scale: 1 },
    text: { text: '3,208', dx: 3 },
    event: { dx: -78, dy: 19 },
  }),
  stage({
    id: 'stage2', label: 'gacha ticket', x: 887,
    bar: { w: 122, dx: -16 }, plus: null,
    icon: { pick: 'gacha', dx: -59, dy: -2, scale: 0.74 },
    text: { text: '1', dx: 34 },
    event: null,
  }),
  stage({
    id: 'stage3', label: 'M point', x: 1015,
    bar: { w: 127, dx: 1 }, plus: null,
    icon: { pick: 'Mpoint', dx: -55, dy: -3, scale: 1.05 },
    // ตัวเลขของ M point เล็กกว่าแถบอื่นนิดนึงตามในเกม
    text: { text: '362,860', dx: 55, scale: 0.5 },
    event: null,
  }),
  {
    id: 'minimenu', label: 'Mini menu', section: STAGE_SECTION,
    x: 1113, y: 34, scale: 1, layer: 30, visible: true,
    src: { kind: 'image', url: '/gacha/images/minimenu.png' },
  },
]

// ── ปุ่มด้านล่าง 3 ปุ่ม: OK (เขียว) / ONCE MORE (ฟ้า) / Go to Team (น้ำตาล) ──
// ทั้งสามปุ่มยืดแบบ 9 ช่อง (ทั้งแกน X และ Y) ที่เส้นยืดของแต่ละไฟล์:
//   เขียว/ฟ้า 56x64: คอลัมน์ 31-35 กับแถว 32-33 เป็นสีเรียบเหมือนกันทุกพิกเซล → ยืดที่ (33, 32)
//     จุดนี้อยู่ขวาล่างของกลางรูป แสงเงามุมซ้ายบนกับแถบเข้มด้านล่างจึงไม่ถูกดึง
//   น้ำตาล 212x67: คอลัมน์ 17-194 กับแถว 17-49 เรียบทั้งหมด → ยืดที่ (105, 33)
//     ปุ่มน้ำตาลแคบกว่าปุ่มเขียว/ฟ้าเสมอ (ในเกมเป็นปุ่มรอง)
// ตำแหน่ง/ขนาดวัดจากภาพในเกม (1342x755) ย่อลงมาเป็นผืน 1152x648
const BT_GREEN = img('/gacha/images/bt_green.png')
const BT_BLUE = img('/gacha/images/bt_blue.png')
const BG_BROWN = img('/gacha/images/bg_brown.png')
const TXT_OK = img('/gacha/images/ok.png')
const TXT_ONCE_MORE = img('/gacha/images/oncemore.png')

const pillButton = (id: string, label: string, x: number, w: number, bg: string, bgLabel: string, text: string, textLabel: string, textScale: number): SceneItem => ({
  id, label, section: BUTTON_SECTION, x, y: 580, scale: 1, layer: 30, visible: true,
  parts: [
    { id: 'bg', label: '1. พื้นปุ่ม', kind: 'stretch', options: [{ label: bgLabel, value: bg }], option: bg, w, h: 71, sliceX: 33, sliceY: 32, cap: 0, dx: 0, dy: 0, scale: 0.95, order: 0, visible: true },
    { id: 'label', label: '2. ข้อความ', kind: 'image', options: [{ label: textLabel, value: text }], option: text, dx: 0, dy: -3, scale: textScale, order: 1, visible: true },
  ],
})

const BUTTONS: SceneItem[] = [
  pillButton('btnOk', 'Button OK', 378, 204, BT_GREEN, 'bt_green', TXT_OK, 'ok', 0.9),
  pillButton('btnOnceMore', 'Button ONCE MORE', 580, 204, BT_BLUE, 'bt_blue', TXT_ONCE_MORE, 'oncemore', 1),
  {
    id: 'btnTeam', label: 'Button Go to Team', section: BUTTON_SECTION, x: 774, y: 580, scale: 1, layer: 30, visible: true,
    parts: [
      { id: 'bg', label: '1. พื้นปุ่ม', kind: 'stretch', options: [{ label: 'bg_brown', value: BG_BROWN }], option: BG_BROWN, w: 208, h: 67, sliceX: 105, sliceY: 33, cap: 0, dx: 0, dy: 0, scale: 0.85, order: 0, visible: true },
      // ข้อความพิมพ์เอง จัดกึ่งกลางปุ่ม (anchor center)
      { id: 'label', label: '2. ข้อความ', kind: 'text', options: [], option: '', text: 'Go to Team', color: '#ffffff', anchor: 'center', dx: 2, dy: 0, scale: 0.8, order: 1, visible: true },
    ],
  },
]

// ฉากตั้งต้น — กลุ่มแม่ 1 ช่อง + สำเนา 6 ช่อง ใช้ไส้ชุดเดียวกัน (แก้ไส้ที่กลุ่มแม่ที่เดียว)
// แถวบนเลเยอร์ต่ำกว่าแถวล่าง ตัวที่ยืนข้างหน้าจะได้ทับตัวข้างหลัง
export const GACHA_SCENE_DEFAULT: SceneItem[] = [
  ...SLOT_IDS.map((id, i): SceneItem => {
    // scale = ขนาดการ์ดของช่องนั้น (1 = เท่าการ์ดในตู้กาชา)
    const { x, y, scale } = SLOT_POS[i]
    const layer = i < TOP_ROW ? 10 : 20
    if (i === 0) {
      return {
        id, label: 'Ranger slot 1 (group)', section: 'ช่องเรนเจอร์', layer, visible: true,
        x, y, scale,
        // ⚠️ รูปของแต่ละชั้นมาจากเรนเจอร์ที่เลือกใน "แผงช่องเรนเจอร์" (ดู paintCard ใน GachaStudio)
        // ส่วนย่อยพวกนี้มีไว้คุมระยะเยื้อง/ขนาด/ลำดับ/การซ่อนในตารางเท่านั้น (Pick ไม่มีผล)
        // แก้ที่กลุ่มแม่ที่เดียว ทั้ง 7 ช่องเปลี่ยนตามพร้อมกัน
        parts: [
          { id: 'light',   label: '1. แสงหมุน',     kind: 'image', options: [], option: '', dx: 0, dy: 0, scale: 1, order: 0, visible: true },
          // เงาวงรีใต้ฐาน (วาดเอง ไม่ใช่ไฟล์รูป) — อยู่เหนือแสงหมุน ใต้ฐาน
          { id: 'shadow',  label: '2. เงาใต้ฐาน',    kind: 'image', options: [], option: '', dx: 0, dy: -7, scale: 0.92, order: 1, visible: true },
          { id: 'base',    label: '3. ฐาน',         kind: 'image', options: [], option: '', dx: 0, dy: 0, scale: 1, order: 2, visible: true },
          { id: 'ranger',  label: '4. รูปเรนเจอร์',  kind: 'image', options: [], option: '', dx: 0, dy: 0, scale: 1.05, order: 3, visible: true },
          { id: 'star',    label: '5. ดาว',         kind: 'image', options: [], option: '', dx: 0, dy: -1, scale: 0.95, order: 4, visible: true },
          { id: 'element', label: '6. ธาตุ',        kind: 'image', options: [], option: '', dx: 7, dy: 0, scale: 1, order: 5, visible: true },
        ],
      }
    }
    return {
      id, label: `Ranger slot ${i + 1} (copy)`, section: 'ช่องเรนเจอร์', copyOf: 'slot',
      x, y, scale, layer, visible: true,
    }
  }),
  // ── ของประกอบฉาก ──
  prop('obj1', 'gacha-season2-result-bg', 'loop', 576, 229, 1.02),
  prop('obj2', 'gacha-season2-result-well', 'loop', 576, 212, 1.02),
  prop('obj3', 'gacha-season2-main-plant', 'ball', 576, 534, 0.9),
  ...STAGES,
  ...BUTTONS,
]

/** คีย์ของช่องในรายการที่พร้อมวาด → ลำดับช่อง (0-6) */
export const SLOT_INDEX: Record<string, number> = Object.fromEntries(SLOT_IDS.map((id, i) => [id, i]))

// ── จำนวนทรัพยากรบนแถบมุมขวาบน — แก้ได้จากแผง "ทรัพยากร" (เหมือนแผงโปรไฟล์ของ /lobby) ──
export interface GachaResources {
  ruby: string
  ticket: string
  mpoint: string
}

export const RESOURCES_DEFAULT: GachaResources = { ruby: '3069', ticket: '216', mpoint: '6520' }
export const RUBY_LIMIT = RUBY_MAX
export const TICKET_LIMIT = 9999
export const MPOINT_LIMIT = 9999990
// M point ในเกมขึ้นทีละ 10 เสมอ (หลักหน่วยเป็น 0) และไม่ต่ำกว่า 40
export const MPOINT_MIN = 40

/** ปัด M point ลงให้หลักหน่วยเป็น 0 แล้วบีบให้อยู่ในช่วง 40 ถึงเพดาน */
export const normalizeMPoint = (n: number): number =>
  Math.min(MPOINT_LIMIT, Math.max(MPOINT_MIN, Math.floor(n / 10) * 10))

const RESOURCE_OF_STAGE: Record<string, keyof GachaResources> = { stage1: 'ruby', stage2: 'ticket', stage3: 'mpoint' }

/** ทับตัวเลขบนแถบทรัพยากรด้วยค่าที่ผู้ใช้กรอก — เรียกต่อจาก expandScene() */
export function applyResources(units: DrawUnit[], res: GachaResources): DrawUnit[] {
  return units.map(u => {
    const key = RESOURCE_OF_STAGE[u.key]
    if (!key || !u.parts) return u
    return { ...u, parts: u.parts.map(p => (p.id === 'txt1' ? { ...p, text: groupDigits(res[key]) } : p)) }
  })
}
