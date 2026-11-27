'use client'

// ====================================================
// ปุ่มเรียกเรนเจอร์ในสนามรบ แบบเดียวกับเกม (ถอดจาก libgame.so 0xc868cc — คลาสปุ่ม vtable 0x1d1c2f0)
//   หน่วยในไฟล์นี้ = พิกเซลไฟล์ hd (ปุ่ม 124×132 = 62×66 pt · 1 pt = 2 px) · พิกัด cocos (y ขึ้น) แปลงเป็น y ลงแล้ว
//
//   พื้น + กรอบ (battle_ui.plist) เลือกตามดาว: 9★ = bg_06 + frame06 · 6–8★ = bg_02 + frame02 · 4–5★ = bg_01 + frame01 · ≤3★ = bg_00 + frame
//     (ยกเว้นยูนิตพิเศษ 2 แบบที่เกมเช็กก่อน → bg_05/frame04 และ bg_03/frame03 — ไม่ใช้ในคลิป)
//   รูปหน้า = <code>-thum.png (0x1847990): จุดยึด = (faceCenterX, faceCenterY) ของยูนิต · สเกล 0.7 × sizeRatio · วางกลางปุ่ม
//     ตัดด้วย battle_btn_bottom_cha_frame_mask.png (100×104 กลางปุ่ม — มุมโค้ง)
//   ดาว (0x18c4568 → star_layer.plist): 9★ = com_level01_star09 สเกล 0.44 · 6–8★ = star06–08 สเกล 0.48 · กลางที่ (30, 55) pt — อยู่เหนือกรอบ (z 1)
//     สีดาว: ทอง level01 ปกติ · ฟ้า level02 / ชมพู level04 ตามระดับพิเศษของยูนิต (0xd5d3f8 / 0xd5d444) — เรนเจอร์ในคลิปเป็นแบบปกติ (ทอง)
//   ค่าแร่ = CCLabelTTF "%d" (ไม่มีจุลภาค) ขนาด 9 pt สีขาว · มุมซ้ายล่างที่ x = 29 − กว้าง/5, y = 11.5 pt
//     ไอคอนแร่ battle_img_rubi01 กลางที่ (x ของตัวเลข − 7, 17) pt
//   เวลารอ (0xc87ecc): แถบ battle_img_cooltime_bg (scale9 43×10 pt กลาง (31, 17)) + แถบเติม battle_img_cooltime
//     กว้าง = 10 + 33 × (เวลาที่ผ่านไป ÷ productionTime) pt เริ่มที่ x 7 · แสดงเฉพาะตอนยังไม่พร้อม (แถบทับตัวเลขค่าแร่)
//   มืด battle_btn_bottom_cha_dimmed (z 2) เมื่อยังไม่พร้อม หรือแร่ไม่พอ (0xc882bc)
//   ธาตุ com_icon_element_<ธาตุ>_small สเกล 0.84 ที่ (7, 10) pt · ไอคอนเกียร์ battle_gear_picto ที่ (53, 10) pt เมื่อเรนเจอร์ใส่เกียร์ (0xd5bb90)
// ====================================================

import { lericoProxy } from '@/lib/staticApi'
import { AtlasNineH, AtlasSprite } from './sam'

const UI = 'hd/battle/battle_ui'
const UI16 = 'hd/battle/battle_ui.16'
const W = 124, H = 132
/** pt (cocos, y ขึ้น) → px บนปุ่ม (y ลง) */
const px = (xPt: number) => xPt * 2
const py = (yPt: number) => H - yPt * 2

function bgFrame(grade: number): [string, string] {
  if (grade === 9) return ['battle_btn_bottom_cha_bg_06.png', 'battle_btn_bottom_cha_frame06.png']
  if (grade > 5) return ['battle_btn_bottom_cha_bg_02.png', 'battle_btn_bottom_cha_frame02.png']
  if (grade > 3) return ['battle_btn_bottom_cha_bg_01.png', 'battle_btn_bottom_cha_frame01.png']
  return ['battle_btn_bottom_cha_bg_00.png', 'battle_btn_bottom_cha_frame.png']
}

/** ธาตุของเว็บ → ชื่อในไฟล์เกม */
const elementKey = (e?: string | null) => {
  const k = (e ?? '').trim().toLowerCase()
  return k === 'wood' ? 'tree' : k
}

/** วัดความกว้างตัวเลข (px) ด้วยฟอนต์เดียวกับที่วาด */
let measureCtx: CanvasRenderingContext2D | null = null
const LABEL_FONT = '900 18px system-ui, sans-serif'
function textWidth(s: string): number {
  if (typeof document === 'undefined') return s.length * 10.5
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return s.length * 10.5
  measureCtx.font = LABEL_FONT
  return measureCtx.measureText(s).width
}

export interface SummonUnit {
  grade: number
  element?: string | null
  /** URL รูป -thum.png */
  imageUrl: string
  /** faceCenterX / faceCenterY ของยูนิต (y นับจากล่าง แบบ cocos) */
  face: [number, number] | null
  sizeRatio?: number
}

/**
 * ปุ่มเรียกเรนเจอร์ 1 ปุ่ม · วางกลางล่างของปุ่มที่ (x, y) บนชั้นซ้อน · scale = ขนาดเทียบไฟล์ hd
 * cool = เวลาที่ผ่านไป ÷ เวลาเกิดใหม่ (0–1) ขณะรอ · null = พร้อมเรียก
 */
export function SummonButton({ unit, cost, cool, noMineral = false, gear, x, y, scale = 1 }: {
  unit: SummonUnit; cost: number; cool: number | null; noMineral?: boolean; gear: boolean; x: number; y: number; scale?: number
}) {
  const [bg, frame] = bgFrame(unit.grade)
  const [fx, fy] = unit.face ?? [0.5, 0.5]
  const s = 0.7 * (unit.sizeRatio ?? 1)
  const label = String(Math.trunc(cost))
  const lw = textWidth(label)
  const labelLeft = px(29) - lw / 5            // x = 29 − กว้าง/5 (pt) → px
  const labelBottom = py(11.5)
  const dim = cool != null || noMineral
  const el = elementKey(unit.element)
  const starW = unit.grade >= 6 ? `com_level01_star0${Math.min(9, unit.grade)}.png` : null
  return (
    <div className="absolute pointer-events-none" style={{ left: x - (W * scale) / 2, top: y - H * scale, width: W * scale, height: H * scale }}>
      <div className="absolute left-0 top-0" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <AtlasSprite atlas={UI} name={bg} x={W / 2} y={H / 2} />
        {/* รูปหน้า: จุด faceCenter ไว้กลางปุ่ม · ตัดด้วยกรอบหน้ากาก 100×104 */}
        <div className="absolute overflow-hidden" style={{ left: 12, top: 14, width: 100, height: 104, borderRadius: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lericoProxy(unit.imageUrl)} alt="" crossOrigin="anonymous" className="absolute max-w-none"
            style={{ left: W / 2 - 12, top: H / 2 - 14, transformOrigin: `${fx * 100}% ${(1 - fy) * 100}%`,
              transform: `translate(${-fx * 100}%, ${-(1 - fy) * 100}%) scale(${s})` }} />
        </div>
        <AtlasSprite atlas={UI} name={frame} x={W / 2} y={H / 2} />
        {starW && <AtlasSprite atlas="hd/common/star_layer" name={starW} x={px(30)} y={py(55)} scale={unit.grade === 9 ? 0.44 : 0.48} />}
        {/* ค่าแร่ */}
        <div className="absolute whitespace-nowrap text-white leading-none tabular-nums"
          style={{ left: labelLeft, top: labelBottom - 18, font: LABEL_FONT, WebkitTextStroke: '4px #2b170a', paintOrder: 'stroke fill' }}>{label}</div>
        <AtlasSprite atlas={UI16} name="battle_img_rubi01.png" x={labelLeft - px(7)} y={py(17)} />
        {/* แถบเวลารอ — ทับตัวเลขค่าแร่ */}
        {cool != null && (
          <>
            <AtlasNineH atlas={UI} name="battle_img_cooltime_bg.png" left={px(31) - px(43) / 2} top={py(17) - 10} width={px(43)} capL={12} capR={10} />
            <AtlasNineH atlas={UI} name="battle_img_cooltime.png" left={px(7)} top={py(17) - 10} width={px(10 + 33 * Math.min(1, Math.max(0, cool)))} capL={10} capR={10} />
          </>
        )}
        {dim && <AtlasSprite atlas={UI16} name="battle_btn_bottom_cha_dimmed.png" x={W / 2} y={H / 2} />}
        {el && <AtlasSprite atlas="hd/common/common_ui" name={`com_icon_element_${el}_small.png`} x={px(7)} y={py(10)} scale={0.84} />}
        {gear && <AtlasSprite atlas={UI} name="battle_gear_picto.png" x={px(53)} y={py(10)} />}
      </div>
    </div>
  )
}
