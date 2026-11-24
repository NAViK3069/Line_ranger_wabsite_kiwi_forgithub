// ====================================================
// gameRules.ts — กฎการโจมตีของเกมที่ถอดจาก libgame.so (ชุดเดียวใช้ทุกที่)
//   ตัวเล่นอนิเมชั่นเรนเจอร์ (src/components/RangerAnimationPopup.tsx) · Video Studio (src/anme/engine)
//   แก้กฎที่นี่ที่เดียว ทุกที่ที่เล่นท่าโจมตีได้ผลตรงกัน
// ====================================================

export type AttackKind = 'normal' | 'skill1' | 'skill2'
export type GameMotion = 'CURVE' | 'LINEAR'

/** contentScaleFactor ของเกม: 1 pt = 2 พิกเซลของไฟล์ .sam (SuperAnimNode::init ตั้ง contentSize = กรอบไฟล์ ÷ 2) */
export const GAME_PX_PER_PT = 2
/** moveSpeed เป็น pt ต่อเฟรมที่ 60 เฟรม/วินาที (ค่าคงที่ 60.0 ในเกม) → เวลาบิน = ระยะ(pt) ÷ (moveSpeed × 60) */
export const GAME_FPS = 60
/** จุดคุมโค้ง CCBezierBy: กึ่งกลาง + 0.4 × ระยะ (ไปข้างหน้าตามทิศที่หัน และขึ้น) */
export const GAME_CURVE_K = 0.4

/**
 * attackType ที่เกมสร้างกระสุน (บิต 0x3D98 ของ enum — ใช้ทั้งตีปกติและสกิล)
 *   enum: PUNCH 1 · KICK 2 · ENERGY 3 · ENERGYC 4 · SWING 5 · STAB 6 · WEAPON 7 · WEAPONC 8 · LASER 9
 *         DOUBLE 10 · DOUBLEC 11 · RETURN 12 · BEAM 13 · ACTION 14 · (NONE = 0)
 *   นอกกลุ่มนี้ไม่มีกระสุน — โดนทันทีตอนช่วง *_ready จบ
 */
export const GAME_BULLET_TYPES = ['ENERGY', 'ENERGYC', 'WEAPON', 'WEAPONC', 'DOUBLE', 'DOUBLEC', 'RETURN', 'BEAM'] as const
export const isGameBulletType = (attackType: string | null | undefined): boolean =>
  !!attackType && (GAME_BULLET_TYPES as readonly string[]).includes(attackType)

/** ทรงวิถีจาก attackType: WEAPON / ENERGY / DOUBLE = CCMoveBy เส้นตรง (ไม่ตั้งมุม) · ที่เหลือ = CCBezierBy + CCRotateTo */
export const gameMotionOf = (attackType: string | null | undefined): GameMotion =>
  attackType === 'WEAPON' || attackType === 'ENERGY' || attackType === 'DOUBLE' ? 'LINEAR' : 'CURVE'

/**
 * ยกจุดเป้าขึ้นจากตำแหน่งเป้า (หน่วยเดียวกับ h = ความสูงกรอบไฟล์ของเป้า)
 *   hitPointRate ≤ 10 = rate × สูงกรอบ (0 = เท้า, 0.5 = ครึ่งตัว) · > 10 (ปกติ 100) = เส้นตรงยก 0.25 × สูง / โค้งไม่ยก
 */
export const gameHitLift = (hitRate: number, motion: GameMotion, h: number): number =>
  hitRate <= 10 ? hitRate * h : motion === 'LINEAR' ? 0.25 * h : 0

/**
 * ไฟล์กระสุนที่เกมโหลดตามชนิดท่า (ไม่ได้อ่าน animationPart ของ lerico)
 *   ตีปกติ = bul · สกิล 1 = bul2 → ไม่มีถอยไป bul · สกิล 2 = bul3 เท่านั้น
 *   สกิล 2 ไม่มี bul3 = เกมโหลดไฟล์ที่ไม่มีอยู่ → กระสุนมองไม่เห็น แต่ยังบินและโดนตามเวลาบินเหมือนเดิม
 */
export const BULLET_FILE_CHAIN: Record<AttackKind, readonly string[]> = {
  normal: ['bul'],
  skill1: ['bul2', 'bul'],
  skill2: ['bul3'],
}
/** ชุดไฟล์กระสุนที่เกมใช้จริง (has = ชุดนี้มีไฟล์ไหม) · visible = false → กระสุนล่องหน (ไม่มีไฟล์สักตัวในลำดับ) */
export function gameBulletSet(kind: AttackKind, has: (set: string) => boolean): { set: string; visible: boolean } {
  const chain = BULLET_FILE_CHAIN[kind]
  const found = chain.find(has)
  return found ? { set: found, visible: true } : { set: chain[0], visible: false }
}

/** ท่าปล่อย (ชื่อคลิป) → ชนิดท่า · ไม่ใช่ท่าโจมตี = null */
export function attackKindOfClip(release: string): AttackKind | null {
  if (release === 'attack') return 'normal'
  if (/^s_(attack|action_attack_\d)$/.test(release)) return 'skill1'
  if (/^s2_(attack|action_attack_\d)$/.test(release)) return 'skill2'
  return null
}

/**
 * ความสูงที่ยูนิตลอยเหนือเลนพื้น (pt) = unitPosition ในฐานข้อมูลเกม (ค่าที่ไม่ใช่ 0 ทั้งหมด)
 *   libgame: ตอนวางยูนิตลงสนาม y = เลน + unitPosition (โหนดทั้งตัวลอย ไม่ใช่แค่รูป)
 *   ตำแหน่งยูนิต = กลางกรอบไฟล์ body → จุดปล่อย/เป้ากระสุนลอยตามไปด้วย
 *   ตัวบิน (ab201_flight) ไม่ได้สูงเท่ากันทุกตัว: 100–130 pt
 */
export const UNIT_POSITION_PT: Readonly<Record<string, number>> = {
  'g004-poppins': 30, 'g004-poppins2': 30, 'g004-poppins3': 30, 'g007-hb': 60, 'g007-hb2': 60, 'g007-hb3': 60,
  'g008-thunder': 50, 'g008-thunder2': 50, 'g008-thunder3': 50, 'g009-phoenix': 65, 'g009-phoenix2': 65,
  'g009-phoenix3': 65, 'g011-vlad': 30, 'g011-vlad2': 30, 'g011-vlad3': 30, 'g016-insun': 50, 'g016-insun2': 50,
  'g016-insun3': 50, 'g016-insun4': 50, 'g016-insun5': 50, 'g016-insun6': 50, 'g016-insun7': 50,
  'g016-insun8': 50, 'u1102e-sally': 100, 'u1102h-sally': 100, 'u1108e-bella': 120, 'u1108h-bella': 120,
  'u1127e-edward': 100, 'u1127h-edward': 100, 'u1127u-edward': 100, 'u1137e-cony': 120, 'u1137h-cony': 120,
  'u1160e-merry': 120, 'u1160h-merry': 120, 'u1170e-sally': 130, 'u1170h-sally': 130, 'u1170u-sally': 130,
  'u1196e-leonard': 110, 'u1196h-leonard': 110, 'u1196u-leonard': 110, 'u1212e-brown': 100, 'u1212h-brown': 100,
  'u1231e-cony': 120, 'u1231h-cony': 120, 'u1231u-cony': 120, 'u1285e-sally': 130, 'u1285h-sally': 130,
  'u1286e-sally': 130, 'u1337e-leonard': 130, 'u1337h-leonard': 130, 'u1337u-leonard': 130, 'u1363e-cony': 110,
  'u1363h-cony': 110, 'u1364e-cony': 110, 'u1459e-elle': 130, 'u1459h-elle': 130, 'u1460e-elle': 130,
  'u1562e-pew': 110, 'u1562h-pew': 110, 'u1563e-pew': 110, 'u3913-tuto-cony': 120, 'u40016-sally': 130,
  'u85010sk-mettaur': -5, 'u91026-eric': 100, 'u92026-eric': 100,
}
/** unitPosition (pt) ของยูนิต · ไม่อยู่ในตาราง = 0 (ยืนบนเลน) */
export const unitPositionPt = (unitId: string | null | undefined): number =>
  (unitId ? UNIT_POSITION_PT[unitId.trim().toLowerCase()] : undefined) ?? 0
/** ยูนิตนี้มีค่า unitPosition ในฐานข้อมูลไหม (ใช้แยกจากค่าเดาของตัวบินที่ไม่มีข้อมูล) */
export const hasUnitPosition = (unitId: string | null | undefined): boolean =>
  !!unitId && UNIT_POSITION_PT[unitId.trim().toLowerCase()] != null

/**
 * สกิล MOVE_ATTACK (attackType ACTION · targetType SELF — "*Advance" ในคำอธิบาย) — ระยะพุ่งไปข้างหน้า (pt)
 *   libgame 0xcda4cc (ตอน s_action_attack_1 จบ): ระยะ = factor ของสกิล (FIXED = ค่าตรงๆ · GRADE ADD = เกรด + factor)
 *   หยุดก่อนถึงได้เฉพาะสิ่งกีดขวาง/ปราสาทของด่าน — เรนเจอร์ศัตรูไม่บัง กระโดดข้ามได้
 *   เวลา = ระยะ ÷ (skillProjectileMoveSpeed × 60) · ตัวละครอยู่ตรงนั้นต่อ (ไม่ถอยกลับ)
 *   ช่วง s_action_attack_2 จบ = setTarget(this) เก็บตำแหน่งปัจจุบัน → ดาเมจใส่ยูนิตที่ตำแหน่งอยู่ใน [จุดนั้น ± area]
 */
export const MOVE_ATTACK_DASH_PT: Readonly<Record<string, number>> = {
  sk1216_towa: 150,    // GRADE ADD 142 · เกรด 8
  sk1269_brown: 130,
  sk1278_er: 300,
  sk1307_ab: 250,
  sk1422_mk: 300,
  sk1519_de: 275,
  sk40014_brown: 130,
}
/** ระยะพุ่ง (pt) ของท่านี้ · ไม่ใช่ MOVE_ATTACK = 0 */
export const moveAttackDashPt = (attackType: string | null | undefined, skillCode: string | null | undefined): number =>
  attackType === 'ACTION' && skillCode ? MOVE_ATTACK_DASH_PT[skillCode] ?? 0 : 0
