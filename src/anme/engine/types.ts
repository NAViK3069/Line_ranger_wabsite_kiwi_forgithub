// ====================================================
// types.ts — รูปแบบข้อมูลของ "ฉาก" (บันทึกเป็น JSON ได้ทั้งก้อน)
//
// ฉาก = พื้นหลัง + ตัวแสดง (actors) + คิวบนไทม์ไลน์ (cues)
// ทุกอย่างคำนวณจากเวลา t แบบ deterministic → ลากไทม์ไลน์ย้อน/เดินหน้าได้อิสระ และ export วิดีโอได้ตรงเฟรม
// หน่วยพิกัด = พิกเซลของเวที (เช่น 1280×720) · แกน Y ชี้ลง
// ====================================================

export interface Vec { x: number; y: number }

export type Blend = 'source-over' | 'lighter' | 'screen' | 'multiply' | 'overlay' | 'color-dodge' | 'hard-light'
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'backOut'

export interface SamSetUrls { sam: string; plist: string; png: string }

/** แหล่งไฟล์ที่ฉากอ้างถึง (โหลดครั้งเดียว ใช้ได้หลาย actor) */
export type AssetDef =
  | { id: string; type: 'ranger'; name: string; source: 'lerico'; rangerId: string; form: string }
  | { id: string; type: 'ranger'; name: string; source: 'upload'; sets: Record<string, SamSetUrls>; body: string }
  | { id: string; type: 'image'; name: string; url: string; mime?: string }
  | { id: string; type: 'video'; name: string; url: string }
  | { id: string; type: 'sequence'; name: string; urls: string[]; fps: number }
  | { id: string; type: 'audio'; name: string; url: string }

export type AssetType = AssetDef['type']

export type ActorTag = 'ally' | 'enemy' | 'prop'

export interface Actor {
  id: string
  name: string
  assetId: string
  tag: ActorTag
  /** ranger: จุดยืน (เท้า) · media: จุดกึ่งกลางภาพ */
  x: number
  y: number
  scale: number
  flip: boolean
  /** องศา (ใช้กับ media) */
  rotation: number
  opacity: number
  blend: Blend
  visible: boolean
  locked: boolean
  // ── ranger ──
  idleClip: string
  /** ชิ้นส่วนที่ซ่อน (ชื่อสไปรต์ในไฟล์ .sam) — แบบแผงเลเยอร์ของ Kiwi · มีผลกับภาพส่งออกด้วย */
  hiddenParts: string[]
  // ── media ──
  loop: boolean
  muted: boolean
  speed: number
}

interface CueBase {
  id: string
  actorId: string
  /** วินาที */
  start: number
}

/** เล่นท่าเดียว (หรือวนตามเวลา) */
export interface AnimCue extends CueBase {
  type: 'anim'
  clip: string
  speed: number
  loop: boolean
  /** ใช้เมื่อ loop = true (วินาที) */
  duration: number
}

/** เดินไปยังจุด (ระหว่างเดินเล่นท่า clip ถ้ามี) */
export interface MoveCue extends CueBase {
  type: 'move'
  to: Vec
  duration: number
  ease: Ease
  clip: string | null
}

export type FxMode = 'projectile' | 'target' | 'caster' | 'point'

/** เอฟเฟกต์ของสกิล (ไฟล์กระสุน bul/bul2/bul3 หรือชุดอื่นของเรนเจอร์) — ตั้งค่าได้ละเอียดแบบ TurnBased */
export interface SkillFx {
  set: string
  /** projectile = บินจากจุดปล่อยไปหาเป้า · target = เกิดที่เป้า · caster = เกิดที่ตัวเอง · point = จุดกำหนด */
  mode: FxMode
  /** ช่วงบิน (ปกติ normal) · null = ไม่เล่น */
  flight: string | null
  /** ช่วงกระทบ (ปกติ finish) · null = ไม่เล่น */
  finish: string | null
  /** จุดปล่อย — ห่างจากเท้าผู้ร่าย (แกน X กลับตามทิศที่หัน) */
  launch: Vec
  /** จุดกระทบ — ห่างจาก "จุดรับดาเมจ" ของเป้าหมาย */
  impact: Vec
  /** ใช้เมื่อ mode = point (พิกัดเวที) */
  point: Vec
  /** เฟรมที่กระสุนออก นับจากต้นท่าร่าย (เฟรมของตัวละคร) · null = อัตโนมัติ (จบช่วงร่าย ตัดเฟรมว่างท้ายออก) */
  releaseFrame: number | null
  /** หน่วงเพิ่มหลังเฟรมปล่อย (วินาที) — ติดลบได้ */
  delay: number
  /** พิกเซล/วินาที (projectile) */
  speed: number
  /** ความสูงโค้ง · null = อัตโนมัติ min(255, ระยะ²/3800) · 0 = เส้นตรง */
  arc: number | null
  /** ยืดคลิปบินให้จบพอดีตอนถึงเป้า (ปิด = เล่นวนระหว่างบิน) */
  fitFlight: boolean
  /** เฉียงหัวกระสุนตามทิศบิน */
  rotate: boolean
  rotOffset: number
  /** ระเบิด (finish) เฉียงตามทิศตอนถึงเป้าด้วย */
  rotateFinish: boolean
  /** แยกตำแหน่งระเบิดออกจากปลายทางกระสุน */
  finishSplit: boolean
  /** จุดระเบิดเมื่อแยก — ห่างจากจุดรับดาเมจของเป้า */
  finishOffset: Vec
  scale: number
  blend: Blend
  /** ยิงซ้ำกี่ลูก (ห่างกัน interval วินาที) */
  repeat: number
  interval: number
}

/** เดินเข้าไปหาเป้าก่อนร่าย (ตัวตีประชิด) */
export interface Approach {
  enabled: boolean
  /** จุดหยุดเทียบเท้าเป้า · x ติดลบ = หยุดหน้าเป้า (ฝั่งผู้โจมตี) */
  stopOffset: Vec
  /** พิกเซล/วินาที */
  speed: number
  returnHome: boolean
}

export interface SkillCue extends CueBase {
  type: 'skill'
  label: string
  cast: string[]
  release: string
  speed: number
  /** เพดานเวลาช่วงร่าย (วินาที) — ยาวเกินจะเร่งช่วงร่ายให้พอดี · null = ไม่จำกัด */
  castSpeedCap: number | null
  approach: Approach
  fx: SkillFx | null
  targetId: string | null
  /** เป้าหมายเล่นท่าโดนตี */
  hitReact: boolean
  hitClip: string
  flash: boolean
  /** ป้ายชื่อสกิลกลางจอ */
  banner: string
  /** เสียงประกอบสกิลที่ผู้ใช้เลือกเอง/อัปโหลด (ไม่มี = null) */
  sound: SkillSound | null
  /**
   * เสียงจากข้อมูลเกม (projectile_data → sounds) ใส่ให้อัตโนมัติตอนเพิ่มสกิล — เปิด/ปิดทีละอันได้
   * ปกติ 2 อัน: เสียงร่าย (preparation → at 'cast') · เสียงโดน (underAttack → at 'impact')
   */
  gameSounds: SkillSound[]
}

export interface SkillSound {
  assetId: string
  /** เล่นตอนเริ่มร่าย / ตอนปล่อยท่า / ทุกครั้งที่กระทบ */
  at: 'cast' | 'release' | 'impact'
  volume: number
  /** false = ปิดไว้ (ไม่เล่น) · ไม่มีค่า = เปิด */
  enabled?: boolean
}

/** เสียงบนแทร็กเสียง */
export interface SoundCue extends CueBase {
  type: 'sound'
  assetId: string
  volume: number
  /** เริ่มเล่นจากวินาทีที่เท่าไหร่ของไฟล์ */
  offset: number
  /** ตัดความยาว (วินาที) · 0 = เล่นจนจบไฟล์ */
  duration: number
  fadeIn: number
  fadeOut: number
}

/** ช่วงที่ actor ปรากฏบนจอ (มีอย่างน้อย 1 อัน = ซ่อนนอกช่วง) */
export interface ShowCue extends CueBase {
  type: 'show'
  duration: number
  fadeIn: number
  fadeOut: number
}

/** กล้อง: ซูม/แพนไปยังจุด */
export interface CameraCue extends CueBase {
  type: 'camera'
  center: Vec
  zoom: number
  duration: number
  ease: Ease
}

export type Cue = AnimCue | MoveCue | SkillCue | ShowCue | CameraCue | SoundCue
export type CueType = Cue['type']

export const CAMERA_ID = '__camera'
/** แถวเสียงบนไทม์ไลน์ */
export const AUDIO_ID = '__audio'

export type BgFit = 'cover' | 'contain' | 'stretch' | 'height'

export interface Background {
  kind: 'color' | 'gradient' | 'stage' | 'asset'
  color: string
  gradient: [string, string]
  /** lerico battle stage เช่น battle01 */
  stage: string
  assetId: string | null
  fit: BgFit
  scale: number
  offsetX: number
  offsetY: number
  /** เลื่อนฉากอัตโนมัติ px/วินาที (ฉากยาว/ภาพต่อกัน) */
  scrollX: number
  /** มืดลง 0–1 */
  dim: number
  blur: number
}

export interface Scene {
  version: 1
  name: string
  width: number
  height: number
  /** วินาที */
  duration: number
  fps: number
  groundY: number
  background: Background
  assets: AssetDef[]
  actors: Actor[]
  cues: Cue[]
  /** วาดตัวที่อยู่ต่ำกว่าทับตัวที่อยู่สูงกว่า */
  depthSort: boolean
  smooth: boolean
}
