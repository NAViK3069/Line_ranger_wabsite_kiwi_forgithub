// ====================================================
// scene.ts — ค่าเริ่มต้น / ตัวสร้าง actor และคิว / ฟังก์ชันเล็กๆ ที่ใช้ทั่วไป
// ====================================================
import type {
  Actor, AnimCue, Approach, AssetDef, Background, CameraCue, Cue, Ease, MoveCue, Scene, ShowCue, SkillCue, SkillFx, SoundCue, Vec,
} from './types'
import { AUDIO_ID, CAMERA_ID } from './types'
import { L } from './i18n'

/** ภาพในไฟล์ .sam หันไปทางไหน (false = หันขวา — ไฟล์ของ Line Rangers หันขวาทั้งหมด) */
export const ART_FACES_LEFT = false

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const EASES: Record<Ease, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
}

export const STAGE_SIZES = [
  { label: '16:9 HD', w: 1280, h: 720 },
  { label: '16:9 Full HD', w: 1920, h: 1080 },
  { label: '9:16 Portrait', w: 720, h: 1280 },
  { label: '1:1 Square', w: 1080, h: 1080 },
  { label: '21:9 Cinema', w: 1680, h: 720 },
]

export function defaultBackground(): Background {
  return {
    kind: 'stage', color: '#0b1020', gradient: ['#1b2550', '#06070d'], stage: 'battle01', assetId: null,
    fit: 'height', scale: 1, offsetX: 0, offsetY: 0, scrollX: 0, dim: 0, blur: 0,
  }
}

export function emptyScene(name = 'ฉากใหม่'): Scene {
  return {
    version: 1, name, width: 1280, height: 720, duration: 8, fps: 30, groundY: 560,
    background: defaultBackground(), assets: [], actors: [], cues: [], depthSort: true, smooth: true,
  }
}

export function newActor(asset: AssetDef, at: Vec, extra: Partial<Actor> = {}): Actor {
  const isRanger = asset.type === 'ranger'
  return {
    id: uid('a'), name: asset.name, assetId: asset.id, tag: isRanger ? 'ally' : 'prop',
    x: Math.round(at.x), y: Math.round(at.y), scale: 1, flip: false, rotation: 0, opacity: 1,
    blend: 'source-over', visible: true, locked: false,
    idleClip: 'idle', hiddenParts: [], loop: true, muted: true, speed: 1,
    ...extra,
  }
}

export function newAnimCue(actorId: string, start: number, clip: string): AnimCue {
  return { id: uid('c'), type: 'anim', actorId, start, clip, speed: 1, loop: false, duration: 2 }
}

export function newMoveCue(actorId: string, start: number, to: Vec, clip: string | null = 'walk'): MoveCue {
  return { id: uid('c'), type: 'move', actorId, start, to: { ...to }, duration: 1, ease: 'linear', clip } // ค่าเริ่มต้น Linear (ความเร็วคงที่) — ปรับใน Inspector ได้
}

export function newShowCue(actorId: string, start: number, duration = 2): ShowCue {
  return { id: uid('c'), type: 'show', actorId, start, duration, fadeIn: 0.15, fadeOut: 0.25 }
}

export function newCameraCue(start: number, center: Vec, zoom = 1.4): CameraCue {
  return { id: uid('c'), type: 'camera', actorId: CAMERA_ID, start, center: { ...center }, zoom, duration: 0.6, ease: 'easeInOut' }
}

export function defaultFx(set: string, mode: SkillFx['mode'] = 'target'): SkillFx {
  return {
    set, mode, flight: 'normal', finish: 'finish',
    launch: { x: ART_FACES_LEFT ? -60 : 60, y: -60 }, impact: { x: 0, y: 0 }, point: { x: 900, y: 500 },
    releaseFrame: null, delay: 0, speed: 1800, arc: 0, fitFlight: false,
    rotate: false, rotOffset: 0, rotateFinish: false, finishSplit: false, finishOffset: { x: 0, y: 0 },
    scale: 1, blend: 'source-over', repeat: 1, interval: 0.12,
  }
}

export const defaultApproach = (): Approach => ({ enabled: false, stopOffset: { x: -140, y: 0 }, speed: 600, returnHome: true })

export function newSkillCue(actorId: string, start: number, p: Partial<SkillCue> = {}): SkillCue {
  return {
    id: uid('c'), type: 'skill', actorId, start, label: 'Skill', cast: [], release: 'attack', speed: 1,
    castSpeedCap: null, approach: defaultApproach(),
    fx: null, targetId: null, hitReact: true, hitClip: 'target', flash: true, banner: '', sound: null, gameSounds: [],
    ...p,
  }
}

export const cueColor: Record<Cue['type'], string> = {
  anim: '#4aa8ff', move: '#3fd68f', skill: '#ffb238', show: '#b47cff', camera: '#ff5fa8', sound: '#2fe0b8',
}

export function newSoundCue(start: number, assetId: string): SoundCue {
  return { id: uid('c'), type: 'sound', actorId: AUDIO_ID, start, assetId, volume: 1, offset: 0, duration: 0, fadeIn: 0, fadeOut: 0 }
}

export const cueLabel = (t: Cue['type']): string => ({
  anim: L('ท่าทาง', 'Animation'), move: L('เคลื่อนที่', 'Move'), skill: L('สกิล', 'Skill'),
  show: L('ปรากฏ', 'Visible'), camera: L('กล้อง', 'Camera'), sound: L('เสียง', 'Sound'),
} as Record<Cue['type'], string>)[t]

/** สำเนาลึกแบบง่าย (ข้อมูลฉากเป็น JSON ล้วน) */
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** เติมฟิลด์ที่ขาดเวลาโหลดฉากเก่า/ไฟล์ที่แก้ด้วยมือ */
export function normalizeScene(raw: Partial<Scene>): Scene {
  const base = emptyScene(raw.name)
  const s: Scene = { ...base, ...raw, background: { ...base.background, ...(raw.background ?? {}) } } as Scene
  s.assets = raw.assets ?? []
  s.actors = (raw.actors ?? []).map(a => {
    const k = { ...newActor({ id: a.assetId, type: 'image', name: a.name, url: '' }, a), ...a }
    // เงาที่แอพเคยวาดเพิ่ม — เลิกใช้ (ภาพเรนเจอร์มีเงาของตัวเองอยู่แล้ว)
    delete (k as Record<string, unknown>).shadow
    return k
  })
  s.cues = (raw.cues ?? []).map(c => {
    if (c.type !== 'skill') return c
    const k = { ...newSkillCue(c.actorId, c.start), ...c, approach: { ...defaultApproach(), ...(c.approach ?? {}) }, fx: c.fx ? { ...defaultFx(c.fx.set), ...c.fx } : null }
    // ฟีเจอร์ที่เลิกใช้แล้ว (ตัวเลขดาเมจ / สั่นจอ / แฟลชทั้งจอ)
    for (const old of ['damage', 'shake', 'screenFlash']) delete (k as Record<string, unknown>)[old]
    return k
  })
  return s
}
