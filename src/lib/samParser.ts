// ====================================================
// samParser.ts — Lightweight SAM animation frame counter
// ported จาก viewer_ranger.py (SAMParser class)
//
// ไม่มี render, ไม่มี sprite — นับแค่ frame count ต่อ animation segment
// ใช้หา cast time ของสกิล (s_attack_ready, s2_attack_ready)
// ====================================================

// ── Frame flags ──
const FF_REMOVES    = 0x01
const FF_ADDS       = 0x02
const FF_MOVES      = 0x04
const FF_FRAME_NAME = 0x08

// ── Move flags (upper 5 bits ของ foan) ──
const MF_ROTATE     = 0x4000
const MF_COLOR      = 0x2000
const MF_MATRIX     = 0x1000
const MF_LONGCOORDS = 0x0800

export interface SAMInfo {
  /** FPS ที่ฝังใน SAM file (เช่น 24 หรือ 30) */
  animRate: number
  /** จำนวน frame ต่อ animation segment (เช่น { s_attack_ready: 14, attack: 8, ... }) */
  frameCounts: Record<string, number>
}

/**
 * Parse binary SAM file → นับ frame count ต่อ animation segment
 * @param buffer — ArrayBuffer จาก fetch ไฟล์ .sam
 */
export function parseSAMFrameCounts(buffer: ArrayBuffer): SAMInfo {
  const view = new DataView(buffer)
  let pos = 0

  const u8  = () => { const v = view.getUint8(pos);          pos += 1; return v }
  const u16 = () => { const v = view.getUint16(pos, true);   pos += 2; return v }
  const i16 = () => { const v = view.getInt16(pos, true);    pos += 2; return v }
  const i32 = () => { const v = view.getInt32(pos, true);    pos += 4; return v }
  const str = () => {
    const L = u16()
    const bytes = new Uint8Array(buffer, pos, L)
    pos += L
    return new TextDecoder('ascii').decode(bytes)
  }

  // ── Header ──
  const magic = i32()
  if (magic !== 0x2E53414D) throw new Error(`Bad SAM magic: 0x${magic.toString(16)}`)
  const version = i32()
  if (version !== 1) throw new Error(`Unsupported SAM version: ${version}`)

  const animRate = u8()

  // Skip: x, y, canvas_w, canvas_h (4 × i32)
  i32(); i32(); i32(); i32()

  // ── Images list (เราไม่ต้องใช้ข้อมูลนี้ แค่ข้ามไป) ──
  const nImages = i16()
  for (let i = 0; i < nImages; i++) {
    str()                          // name
    i16(); i16()                   // w, h
    i32(); i32(); i32(); i32()     // matrix m00-m11 (Q16 * TWIPS)
    i16(); i16()                   // m02, m12
  }

  // ── Frames ──
  const nFrames = i16()
  const frameCounts: Record<string, number> = { _intro: 0 }
  let currentAnim = '_intro'

  for (let fi = 0; fi < nFrames; fi++) {
    const flags = u8()

    // FF_REMOVES: ข้ามรายการ obj_id
    if (flags & FF_REMOVES) {
      const n = u8()
      for (let j = 0; j < n; j++) i16()  // obj_id
    }

    // FF_ADDS: ข้ามรายการ obj_num + res_num
    if (flags & FF_ADDS) {
      const n = u8()
      for (let j = 0; j < n; j++) {
        i16()   // obj_num (i16 & 0x07FF)
        u8()    // res_num
      }
    }

    // FF_MOVES: ข้ามข้อมูล transform ตามแต่ละ move_flags
    if (flags & FF_MOVES) {
      const n = u8()
      for (let j = 0; j < n; j++) {
        const foan      = u16()
        const moveFlags = foan & 0xF800

        if (moveFlags & MF_MATRIX) {
          i32(); i32(); i32(); i32()   // m00, m01, m10, m11 (Q16)
        } else if (moveFlags & MF_ROTATE) {
          i16()                        // rotation (milliradians)
        }

        if (moveFlags & MF_LONGCOORDS) {
          i32(); i32()                 // m02, m12 (TWIPS × i32)
        } else {
          i16(); i16()                 // m02, m12 (TWIPS × i16)
        }

        if (moveFlags & MF_COLOR) {
          u8(); u8(); u8(); u8()       // r, g, b, a
        }
      }
    }

    // FF_FRAME_NAME: ชื่อ animation segment ใหม่
    if (flags & FF_FRAME_NAME) {
      const name = str()
      if (!(name in frameCounts)) frameCounts[name] = 0
      currentAnim = name
    }

    // นับ 1 frame ให้ segment ปัจจุบัน
    frameCounts[currentAnim]++
  }

  // ลบ _intro ถ้าว่างเปล่า (เหมือน viewer_ranger.py)
  if (frameCounts['_intro'] === 0) delete frameCounts['_intro']

  return { animRate, frameCounts }
}

// ── Cast time helpers ──────────────────────────────

export interface CastTimeInfo {
  /** จำนวน frame ของ animation segment นั้น */
  frames: number
  /** วินาที = frames / animRate (2 ทศนิยม) */
  seconds: number
}

export interface RangerCastTimes {
  /** FPS ที่ฝังใน SAM */
  animRate: number
  /** Cast time สกิล 1 (s_attack_ready) — ช่วงกำลังร่าย */
  skill1: CastTimeInfo | null
  /** Cast time สกิล 2 (s2_attack_ready) — ช่วงกำลังร่าย */
  skill2: CastTimeInfo | null
  /** Recovery สกิล 1 (s_attack) — ช่วงหลังสกิลออกแล้วก่อน reset */
  recovery1: CastTimeInfo | null
  /** Recovery สกิล 2 (s2_attack) — ช่วงหลังสกิลออกแล้วก่อน reset */
  recovery2: CastTimeInfo | null
}

/**
 * แปลง SAMInfo → RangerCastTimes
 *
 * รองรับ 2 รูปแบบสกิล:
 *   แบบปกติ : s_attack_ready (cast) + s_attack (recovery)
 *   แบบ action: s_action_attack_1 + s_action_attack_2 (cast) + s_action_attack_3 (recovery)
 */
export function extractCastTimes(samInfo: SAMInfo): RangerCastTimes {
  const { animRate, frameCounts } = samInfo

  const make = (primary: string, fallback?: string): CastTimeInfo | null => {
    const frames = frameCounts[primary] ?? (fallback ? frameCounts[fallback] : undefined)
    if (!frames) return null
    return { frames, seconds: parseFloat((frames / animRate).toFixed(2)) }
  }

  // action skill: รวม part1+part2 เป็น cast, part3 เป็น recovery
  const makeAction = (p1: string, p2: string, p3: string): { cast: CastTimeInfo | null; recovery: CastTimeInfo | null } => {
    const f1 = frameCounts[p1] ?? 0
    const f2 = frameCounts[p2] ?? 0
    const f3 = frameCounts[p3] ?? 0
    const castFrames = f1 + f2
    return {
      cast:     castFrames > 0 ? { frames: castFrames, seconds: parseFloat((castFrames / animRate).toFixed(2)) } : null,
      recovery: f3 > 0         ? { frames: f3,         seconds: parseFloat((f3 / animRate).toFixed(2))         } : null,
    }
  }

  // Skill 1: ลอง s_attack_ready ก่อน, fallback → action
  const action1 = makeAction('s_action_attack_1', 's_action_attack_2', 's_action_attack_3')
  const skill1    = make('s_attack_ready')    ?? action1.cast
  const recovery1 = make('s_attack')          ?? action1.recovery

  // Skill 2: ลอง s2_attack_ready ก่อน, fallback → action2 → action1
  const action2 = makeAction('s2_action_attack_1', 's2_action_attack_2', 's2_action_attack_3')
  const skill2    = make('s2_attack_ready', 's_attack_ready') ?? action2.cast    ?? action1.cast
  const recovery2 = make('s2_attack', 's_attack')             ?? action2.recovery ?? action1.recovery

  return { animRate, skill1, skill2, recovery1, recovery2 }
}
