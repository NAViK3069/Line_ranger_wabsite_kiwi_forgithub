// ====================================================
// แผนที่ตู้รถไฟอวกาศ (res/space_train_battle — 2 เลนบน/ล่างแบบในเกม) ใช้ร่วมกันหลายวิดีโอ (atk-speed / move-speed)
//   ภาพเดียว (sprite sheet) ตัดตาม space_train_battle.plist:
//     ตู้ = spacetrain_battle_bg 692×640 · อวกาศนอกหน้าต่าง = spacetrain_battle_space_bg 1040×480
//     ป้ายพื้น START / FINISH = spacetrain_start_point / spacetrain_finish_point 274×100 (สูงพอดี 1 เลน)
//   ตู้ย่อให้สูงเต็มจอ 720 (×720/640) · เลนบน = แถว 270–368 · เส้นฟ้า 370–378 · เลนล่าง = 380–480 ของภาพตู้
//   ตำแหน่งเท้าในฉาก (scripts/gear-options/build-*-scene.cjs) = LANE_FEET × MAP_SCALE — ต้องตรงกัน
// ====================================================
import type { CanvasLayers } from '@/components/ScenePlayer'
import { appUrl } from '@/anme/engine/storage'

const TRAIN_SHEET = '/api/res/space_train_battle/space_train_battle.png'
const TRAIN_RECT = [5, 5, 692, 640] as const
const SPACE_RECT = [703, 5, 1040, 480] as const
const START_RECT = [1241, 703, 274, 100] as const
const FINISH_RECT = [961, 703, 274, 100] as const
export const MAP_SCALE = 720 / 640
/** แถวเท้าในภาพตู้ (เลนบนค่อนขึ้น · เลนล่างค่อนลง) */
export const LANE_FEET = [322, 454] as const
/** ขอบบน/ล่างของพื้นแต่ละเลนในภาพตู้ */
const LANE_ROWS = [[270, 368], [380, 480]] as const
/** กลางหน้าต่างตู้ในภาพ (x) */
const WINDOW_X = 350
/** อวกาศนอกหน้าต่างเลื่อนไปทางซ้าย (พิกเซล/วินาที) = รถไฟกำลังวิ่ง */
const SPACE_SPEED = 45

let sheet: HTMLImageElement | null = null
let loading = false
function trainSheet(): HTMLImageElement | null {
  if (!loading) {
    loading = true
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => { sheet = im }
    im.onerror = () => { loading = false }   // ลองใหม่ตอนวาดรอบหน้า
    im.src = appUrl(TRAIN_SHEET)
  }
  return sheet
}

export interface SpaceTrainOpts {
  /** x บนเวที (พิกเซล) ที่ให้กลางหน้าต่างตู้มาอยู่ */
  centerX: number
  /** วางป้ายพื้น START / FINISH ทั้ง 2 เลนที่ x นี้ (กลางป้าย) */
  start?: number
  finish?: number
}

/** วาดแผนที่ใต้ตัวแสดง (พิกัดโลก — กล้องคิดให้แล้ว) */
export function spaceTrainLayers(o: SpaceTrainOpts): CanvasLayers {
  const x0 = o.centerX - WINDOW_X * MAP_SCALE
  return {
    under: (ctx, c) => {
      const im = trainSheet()
      if (!im) return
      const W = c.scene.width, s = MAP_SCALE
      // อวกาศ (หลังหน้าต่างโปร่งแสง) ต่อกันเป็นแถบ
      const [sx, sy, sw, sh] = SPACE_RECT
      const spW = sw * s, spH = sh * s
      const off = (c.t * SPACE_SPEED) % spW
      for (let x = -off; x < W; x += spW) ctx.drawImage(im, sx, sy, sw, sh, Math.floor(x), 0, Math.ceil(spW) + 1, spH)
      // ตู้รถไฟต่อกันเต็มความกว้าง (+1px กันรอยต่อ)
      const [tx, ty, tw, th] = TRAIN_RECT
      const w = tw * s
      let x = x0
      while (x > 0) x -= w
      for (; x < W; x += w) ctx.drawImage(im, tx, ty, tw, th, Math.floor(x), 0, Math.ceil(w) + 1, th * s)
      // ป้ายพื้น START / FINISH — สูงเท่าพื้นเลน
      const mark = (r: readonly [number, number, number, number], cx: number) => {
        for (const [top, bot] of LANE_ROWS) {
          const h = (bot - top) * s, dw = r[2] * (h / r[3])
          ctx.drawImage(im, r[0], r[1], r[2], r[3], cx - dw / 2, top * s, dw, h)
        }
      }
      if (o.start != null) mark(START_RECT, o.start)
      if (o.finish != null) mark(FINISH_RECT, o.finish)
    },
  }
}
