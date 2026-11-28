// ====================================================
// skillEffectIcon — ไอคอนผลสกิลเหนือหัวยูนิต (แบบเดียวกับเกม)
//
// ข้อมูล: skill.attackedEffect = ชื่อเฟรมในชีต res/skill_effect_icon/skill_effect_icon.plist
//         skill.skillEffectIconType = ท่าของไอคอน
// libgame (v12.4.2):
//   enum (0xd387a0): FLASH 1 · TINT 2 · MOVE 3 · SCALE 4 · ROTATE 5 · SHAKE 6 · อื่นๆ 0
//   SkillEffectIcon (0xcc053c): สไปรต์ "%s.png" กลางโหนด 2×2 pt → ท่าวนตลอด
//     RepeatForever(EaseElastic(seq, 0.3)) — CCEaseElastic ตัวฐานของ cocos2d-x 2 ไม่แปลงเวลา (เชิงเส้น)
//     MOVE / SHAKE : MoveBy(0.231, (0, −10pt)) → MoveBy(0.231, (0, +10pt))
//     SCALE        : ScaleTo(0.231, 1.15) → ScaleTo(0.231, 1.0)
//     ROTATE       : RotateBy(1.0, 360°)
//     TINT         : TintBy(0.363, −100,−100,−100) → TintBy(0.363, +100,+100,+100)
//     FLASH / อื่นๆ : นิ่ง
//   วางบนยูนิต (UnitNode ทุกจุดที่สร้าง เช่น 0xcd20ec): ลบไอคอนเดิม (tag 0x1be9fe) ก่อน → ยูนิตละ 1 ไอคอน
//     จุดยึด (0.5, 0) ที่ (0, ความสูงยูนิต + 5pt) จากตำแหน่งยูนิต (= กลางกรอบไฟล์ .sam = จุดยืน)
//   ระยะแสดง: ฟังก์ชันแสดงไอคอนให้ยูนิต (0xbc62ec) ใช้ DelayTime(2.0) → RemoveSelf เป็นค่าตั้งต้น
// ====================================================

import { proxyFile, corsImage } from '@/lib/staticApi'

export const SKILL_ICON_SECONDS = 2.0
/** ขนาดโหนด 2×2 pt — กลางสไปรต์อยู่สูงกว่าจุดยึด 1pt */
const NODE_HALF_PT = 1
const LIFT_PT = 5

export interface SkillIconSpec { name: string; type: string }
/** ไอคอนของสกิล 1 ช่อง: ฝั่งศัตรูที่โดน + ฝั่งตัวเอง (ผลที่ targetType = SELF) */
export interface SkillIconSet { enemy: SkillIconSpec | null; self: SkillIconSpec | null }

export interface IconSheet {
  img: HTMLImageElement
  frames: Map<string, { x: number; y: number; w: number; h: number; rotated: boolean }>
}

const BASE = 'https://rangers.lerico.net/res/skill_effect_icon/skill_effect_icon'
let sheetPromise: Promise<IconSheet | null> | null = null

/** โหลดชีตครั้งเดียวต่อการเปิดเว็บ (plist + png ผ่าน Worker → วาดลง canvas ได้โดยไม่ taint) */
export function loadSkillIconSheet(): Promise<IconSheet | null> {
  if (sheetPromise) return sheetPromise
  sheetPromise = (async () => {
    try {
      const res = await fetch(proxyFile(`${BASE}.plist`))
      if (!res.ok) return null
      const xml = await res.text()
      const frames: IconSheet['frames'] = new Map()
      const re = /<key>([^<]+)\.png<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(xml))) {
        const rect = /<key>textureRect<\/key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}<\/string>/.exec(m[2])
        if (!rect) continue
        const rotated = /<key>textureRotated<\/key>\s*<true\s*\/>/.test(m[2])
        frames.set(m[1], { x: +rect[1], y: +rect[2], w: +rect[3], h: +rect[4], rotated })
      }
      const img = new Image()
      const src = proxyFile(`${BASE}.png`)
      corsImage(img, src)
      img.src = src
      await img.decode()
      return { img, frames }
    } catch {
      sheetPromise = null   // พลาด (เน็ต/Worker) → ลองใหม่ได้ครั้งหน้า
      return null
    }
  })()
  return sheetPromise
}

/** สถานะท่าของไอคอน ณ เวลา t วินาทีหลังขึ้น — dy เป็น pt (บวก = ลง), rot เป็นองศา */
export function iconPose(type: string, t: number): { dyPt: number; scale: number; rot: number; bright: number } {
  const tri = (period: number) => {
    const half = period / 2
    const p = t % period
    return p < half ? p / half : 1 - (p - half) / half   // 0 → 1 → 0
  }
  switch (type) {
    case 'MOVE':
    case 'SHAKE':
      return { dyPt: 10 * tri(0.462), scale: 1, rot: 0, bright: 1 }
    case 'SCALE':
      return { dyPt: 0, scale: 1 + 0.15 * tri(0.462), rot: 0, bright: 1 }
    case 'ROTATE':
      return { dyPt: 0, scale: 1, rot: (t % 1) * 360, bright: 1 }
    case 'TINT':
      return { dyPt: 0, scale: 1, rot: 0, bright: 1 - (100 / 255) * tri(0.726) }
    default:
      return { dyPt: 0, scale: 1, rot: 0, bright: 1 }
  }
}

/**
 * วาดไอคอนเหนือยูนิต
 *   nodeX/nodeY = ตำแหน่งยูนิตบนจอ (กลางกรอบไฟล์ = จุดยืน) · heightPx = ความสูงกรอบไฟล์ (world px) · z = ซูม
 *   world px = pt × 2 (ไฟล์ hd) → ไอคอน 43 px ในชีต = 43 world px
 */
export function drawSkillIcon(
  ctx: CanvasRenderingContext2D, sheet: IconSheet, spec: SkillIconSpec,
  nodeX: number, nodeY: number, heightPx: number, z: number, t: number,
): void {
  const f = sheet.frames.get(spec.name)
  if (!f) return
  const pose = iconPose(spec.type, t)
  const PX = 2   // world px ต่อ pt
  const cx = nodeX
  const cy = nodeY - (heightPx + (LIFT_PT + NODE_HALF_PT) * PX) * z + pose.dyPt * PX * z
  const w = (f.rotated ? f.h : f.w) * z * pose.scale
  const h = (f.rotated ? f.w : f.h) * z * pose.scale
  ctx.save()
  ctx.translate(cx, cy)
  if (pose.rot) ctx.rotate((pose.rot * Math.PI) / 180)
  if (pose.bright < 1) ctx.filter = `brightness(${pose.bright})`
  if (f.rotated) {
    // TexturePacker หมุนเฟรมตามเข็ม 90° ในชีต → หมุนกลับตอนวาด
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(sheet.img, f.x, f.y, f.h, f.w, -h / 2, -w / 2, h, w)
  } else {
    ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h)
  }
  ctx.restore()
}

/** ไอคอนของสกิลจากต้นไม้ผล (หลัก + ย่อย) — ผลที่มาทีหลังทับของก่อน (เกมมีไอคอนได้ทีละ 1 ต่อยูนิต) */
export function skillIconSetOf(nodes: { attackedEffect?: string; effectIconType?: string; targetType: string }[]): SkillIconSet {
  const out: SkillIconSet = { enemy: null, self: null }
  for (const n of nodes) {
    if (!n.attackedEffect) continue
    const spec = { name: n.attackedEffect, type: n.effectIconType ?? '' }
    if (n.targetType === 'SELF') out.self = spec
    else out.enemy = spec
  }
  return out
}
