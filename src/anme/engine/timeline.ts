// ====================================================
// timeline.ts — คำนวณ "สถานะ ณ เวลา t" ของทุกอย่างในฉาก (ไม่มี state ซ่อน)
//   • ตำแหน่ง actor (คิวเดิน + เดินเข้าหาเป้าก่อนร่ายสกิล)
//   • ท่าที่กำลังเล่น + เฟรม
//   • จังหวะสกิล: (เดินเข้า) → ร่าย → เฟรมปล่อย → กระสุนบิน → กระทบ → (เดินกลับ)
//   • เสียง / กล้อง
// กฎการยิงยกมาจาก LineRanger_TurnBased (shotRules.ts / rangerConfig.ts)
// ====================================================
import type { SamFrame } from '@/anme/lib/animation/samParser'
import { assets, readyLength, type BulletRuntime, type RangerRuntime, type SamSet } from './assets'
import { ART_FACES_LEFT, EASES, clamp, lerp } from './scene'
import type { Actor, CameraCue, Cue, Ease, GameProjectile, MoveCue, Scene, ShowCue, SkillCue, SkillFx, Vec } from './types'
import { CAMERA_ID } from './types'

export const HIT_FLASH = 0.18
export const BANNER_TIME = 1.4
/** โค้งอัตโนมัติ (ตรงกับ TurnBased): min(ARC_MAX_HEIGHT, ระยะ² / ARC_FLATTEN) */
export const ARC_MAX_HEIGHT = 255
export const ARC_FLATTEN = 3800
/**
 * moveSpeed ของข้อมูลเกม → พิกเซล/วินาที — ค่าจริงจากโค้ดเกม (libgame.so):
 *   เวลาบิน = ระยะ(pt) ÷ (moveSpeed × 60.0) · 1 pt = 2 พิกเซลของไฟล์ .sam (contentScaleFactor)
 *   (เดิมจูนด้วยตา 2.1 × 0.95 × 30 ≈ 59.9 — ช้ากว่าเกมจริงเกือบครึ่ง)
 */
export const GAME_SPEED_TO_PXS = 2 * 60

export function rangerOfActor(_scene: Scene, a: Actor | undefined): RangerRuntime | null {
  if (!a) return null
  const rt = assets.get(a.assetId)
  return rt?.kind === 'ranger' ? rt : null
}

export const clipFrames = (set: SamSet | null | undefined, clip: string | null | undefined) =>
  (set && clip ? set.sam.animations[clip]?.length ?? 0 : 0)

/** ทิศ "ข้างหน้า" บนจอ (+1 = ขวา) */
export const facing = (a: Actor) => ((a.flip ? -1 : 1) * (ART_FACES_LEFT ? -1 : 1))

// ── การเคลื่อนที่ ──
interface Goto { start: number; dur: number; to: Vec; ease: Ease }

/** ตำแหน่งจากคิวเดินอย่างเดียว (ไม่นับการเดินเข้าหาเป้า) */
function basePos(scene: Scene, a: Actor, t: number): Vec {
  let x = a.x, y = a.y
  const moves = scene.cues.filter((c): c is MoveCue => c.type === 'move' && c.actorId === a.id).sort((p, q) => p.start - q.start)
  for (const m of moves) {
    if (t < m.start) break
    const e = EASES[m.ease](m.duration > 0 ? clamp((t - m.start) / m.duration, 0, 1) : 1)
    x = lerp(x, m.to.x, e); y = lerp(y, m.to.y, e)
  }
  return { x, y }
}

export interface ApproachPlan { from: Vec; stop: Vec; walk: number }

/** แผนเดินเข้าหาเป้าของสกิล (null = ไม่เดิน) */
export function approachPlan(scene: Scene, c: SkillCue): ApproachPlan | null {
  if (!c.approach?.enabled) return null
  const caster = scene.actors.find(a => a.id === c.actorId)
  const target = scene.actors.find(a => a.id === c.targetId)
  if (!caster || !target) return null
  const from = basePos(scene, caster, c.start)
  const tp = basePos(scene, target, c.start)
  const stop = { x: tp.x + c.approach.stopOffset.x * facing(caster), y: tp.y + c.approach.stopOffset.y }
  const walk = Math.hypot(stop.x - from.x, stop.y - from.y) / Math.max(20, c.approach.speed)
  return { from, stop, walk }
}

const motionCache = new WeakMap<Scene, Map<string, Goto[]>>()
function motionsOf(scene: Scene, actorId: string): Goto[] {
  let m = motionCache.get(scene)
  if (!m) { m = new Map(); motionCache.set(scene, m) }
  let list = m.get(actorId)
  if (!list) {
    list = []
    for (const c of scene.cues) {
      if (c.actorId !== actorId) continue
      if (c.type === 'move') list.push({ start: c.start, dur: c.duration, to: c.to, ease: c.ease })
      if (c.type === 'skill') {
        const ap = approachPlan(scene, c)
        if (!ap) continue
        list.push({ start: c.start, dur: ap.walk, to: ap.stop, ease: 'linear' })
        if (c.approach.returnHome) list.push({ start: skillCore(scene, c).bodyEnd, dur: ap.walk, to: ap.from, ease: 'linear' })
      }
    }
    list.sort((p, q) => p.start - q.start)
    m.set(actorId, list)
  }
  return list
}

export function actorPos(scene: Scene, a: Actor, t: number): Vec {
  let x = a.x, y = a.y
  for (const g of motionsOf(scene, a.id)) {
    if (t < g.start) break
    const e = EASES[g.ease](g.dur > 0 ? clamp((t - g.start) / g.dur, 0, 1) : 1)
    x = lerp(x, g.to.x, e); y = lerp(y, g.to.y, e)
  }
  return { x, y }
}

/** จุดเริ่มของคิวเดิน (ตำแหน่งก่อนเดิน) — ใช้วาดเส้นทางบนเวที */
export function moveFrom(scene: Scene, cue: MoveCue): Vec {
  const a = scene.actors.find(x => x.id === cue.actorId)
  return a ? actorPos(scene, a, cue.start) : cue.to
}

/** จุดรับดาเมจของ actor ณ เวลา t (พิกัดเวที) */
export function actorHitPoint(scene: Scene, a: Actor, t: number): Vec {
  const p = actorPos(scene, a, t)
  const rt = rangerOfActor(scene, a)
  if (!rt) return p
  const dir = a.flip ? -1 : 1
  return { x: p.x + rt.hit.x * a.scale * dir, y: p.y + rt.hit.y * a.scale }
}

/** กลางลำตัว (ระดับอก) ของ actor ณ เวลา t — จุดที่กระสุนบินพุ่งชนตามค่าเริ่มต้น */
export function actorCenterPoint(scene: Scene, a: Actor, t: number): Vec {
  const p = actorPos(scene, a, t)
  const rt = rangerOfActor(scene, a)
  if (!rt) return p
  return { x: p.x, y: p.y + rt.center.y * a.scale }
}

/** จุดบนตัวเป้าตาม fx.aim (ไม่มีค่า = จุดรับดาเมจ เหมือนฉากเก่า) */
function aimPoint(scene: Scene, target: Actor, aim: SkillFx['aim'], t: number): Vec {
  if (aim === 'ground') return actorPos(scene, target, t)
  if (aim === 'center') return actorCenterPoint(scene, target, t)
  return actorHitPoint(scene, target, t)
}

// ── สกิล ──
export interface ShotTiming { index: number; launchAt: number; impactAt: number; endAt: number; flightDur: number; finishDur: number }
export interface SkillTiming {
  start: number
  /** เวลาเดินเข้าหาเป้า (0 = ไม่เดิน) */
  walk: number
  castStart: number
  castDur: number
  castFrames: number
  releaseAt: number
  /** จบท่าของผู้ร่าย */
  bodyEnd: number
  /** จบการเดินกลับ (= bodyEnd ถ้าไม่เดินกลับ) */
  homeEnd: number
  /** เวลาที่กระสุนลูกแรกออก */
  launchAt: number
  /** เฟรมปล่อยอัตโนมัติ (จบช่วงร่าย ตัดเฟรมว่าง) */
  autoReleaseFrame: number
  shots: ShotTiming[]
  end: number
  bullet: BulletRuntime | null
  /** ความเร็วเล่นของช่วงปล่อย (เฟรม/วินาที) */
  fps: number
}

const DEFAULT_CAST = 0.5, DEFAULT_RELEASE = 0.7

/** ส่วนท่าทางของผู้ร่าย (ไม่แตะตำแหน่ง → ใช้ได้ตอนคำนวณการเดิน โดยไม่วนเรียกตัวเอง) */
function skillCore(scene: Scene, cue: SkillCue) {
  const caster = scene.actors.find(a => a.id === cue.actorId)
  const rt = rangerOfActor(scene, caster)
  const sp = Math.max(0.05, cue.speed)
  const fps = (rt?.fps ?? 30) * sp
  const castF = rt ? cue.cast.reduce((n, c) => n + clipFrames(rt, c), 0) : 0
  const relF = rt ? clipFrames(rt, cue.release) : 0
  let castDur = rt ? castF / fps : DEFAULT_CAST
  if (cue.castSpeedCap != null && cue.castSpeedCap > 0 && castDur > cue.castSpeedCap) castDur = cue.castSpeedCap
  const relDur = rt ? relF / fps : DEFAULT_RELEASE
  const ap = approachPlan(scene, cue)
  const walk = ap?.walk ?? 0
  const castStart = cue.start + walk
  const releaseAt = castStart + castDur
  const bodyEnd = releaseAt + relDur
  const homeEnd = bodyEnd + (ap && cue.approach.returnHome ? walk : 0)
  return { caster, rt, sp, fps, castF, castDur, walk, castStart, releaseAt, bodyEnd, homeEnd }
}

export function skillTiming(scene: Scene, cue: SkillCue): SkillTiming {
  const { caster, rt, sp, fps, castF, castDur, walk, castStart, releaseAt, bodyEnd, homeEnd } = skillCore(scene, cue)
  /** เฟรม (นับจากต้นช่วงร่าย) → เวลา (ช่วงร่ายอาจถูกเร่งด้วยเพดาน) */
  const frameTime = (f: number) => (f <= castF && castF > 0 ? castStart + (f / castF) * castDur : releaseAt + (f - castF) / fps)
  const autoReleaseFrame = rt ? readyLength(rt, cue.cast) : 0
  const fx = cue.fx
  const launchAt = frameTime(fx?.releaseFrame ?? autoReleaseFrame) + (fx?.delay ?? 0)
  const shots: ShotTiming[] = []
  const bullet = fx && rt ? rt.bullets[fx.set] ?? null : null
  if (fx) {
    const bfps = (bullet?.fps ?? 30) * sp
    const flightF = clipFrames(bullet, fx.flight)
    const finishDur = clipFrames(bullet, fx.finish) / bfps
    const n = Math.max(1, Math.round(fx.repeat))
    for (let i = 0; i < n; i++) {
      const la = launchAt + i * fx.interval
      let flightDur: number
      if (fx.game && caster && fx.game.moveSpeed > 0) {
        // เกม: เวลาบิน = ระยะ(pt) ÷ (moveSpeed × 60) · 1 pt = 2 พิกเซล SAM (× scale ของผู้ยิง)
        const from = fxLaunchPoint(scene, cue, caster, la)
        const to = fxImpactPoint(scene, cue, la)
        const pt = Math.hypot(to.x - from.x, to.y - from.y) / (GAME_PX_PER_PT * caster.scale)
        flightDur = Math.max(1 / 60, pt / (fx.game.moveSpeed * GAME_FPS))
      } else if (fx.mode === 'projectile' && caster) {
        const from = fxLaunchPoint(scene, cue, caster, la)
        const to = fxImpactPoint(scene, cue, la)
        flightDur = Math.max(1 / 30, Math.hypot(to.x - from.x, to.y - from.y) / Math.max(50, fx.speed))
      } else {
        flightDur = flightF / bfps
      }
      const impactAt = la + flightDur
      shots.push({ index: i, launchAt: la, impactAt, flightDur, finishDur, endAt: impactAt + finishDur })
    }
  }
  const end = Math.max(homeEnd, ...shots.map(s => s.endAt))
  return { start: cue.start, walk, castStart, castDur, castFrames: castF, releaseAt, bodyEnd, homeEnd, launchAt, autoReleaseFrame, shots, end, bullet, fps }
}

export function fxLaunchPoint(scene: Scene, cue: SkillCue, caster: Actor, t: number): Vec {
  const p = actorPos(scene, caster, t)
  const fx = cue.fx!
  const dir = caster.flip ? -1 : 1
  if (fx.game) {
    // เกม: CCNode::getPosition (= shadowCenter ของกรอบไฟล์) + (start.x × ทิศ, start.y ขึ้น) × scale
    const g = gameAnchorOffset(rangerOfActor(scene, caster))
    return { x: p.x + (g.x + fx.game.start.x) * caster.scale * dir, y: p.y + (g.y - fx.game.start.y) * caster.scale }
  }
  return { x: p.x + fx.launch.x * caster.scale * dir, y: p.y + fx.launch.y * caster.scale }
}

// ── วิถีกระสุนแบบในเกม (ถอดจาก libgame.so — ดู SkillFx.game) ──
/** contentScaleFactor ของเกม: 1 pt = 2 พิกเซลของไฟล์ .sam */
export const GAME_PX_PER_PT = 2
/** moveSpeed เป็น pt ต่อเฟรมที่ 60 เฟรม/วินาที (ค่าคงที่ 60.0 ในเกม) */
export const GAME_FPS = 60
/** จุดคุมโค้ง CCBezierBy: กึ่งกลาง + 0.4 × ระยะ (ไปข้างหน้า และขึ้น) */
export const GAME_CURVE_K = 0.4

/**
 * จุด getPosition ของยูนิตในเกม เทียบกับจุดยืนที่ตัวเล่นใช้วาด (rt.stand = กลางเงาใต้เท้า)
 *   โหนด .sam ในเกม (SuperAnimNode) ตั้ง anchor (0.5, 0.5) = กึ่งกลางกรอบเวทีของไฟล์ — ศิลป์ของเรนเจอร์วาดเงาไว้ตรงกลางกรอบพอดี
 *   (เช็คแล้ว: u1242e-brown กรอบ 126×202 เงา (63, 101) · u1316h-brown กรอบ 152×156 เงา (77, 78))
 *   ปกติห่างกัน 0–1 พิกเซล — บวกเข้าไปเพื่อให้จุดปล่อย/จุดเป้าตรงกับเกมเทียบกับภาพตัวละครจริง
 *   (เคยใช้ shadowCenter × กรอบ = ผิด จุดเป้าต่ำกว่าเท้า ~87 px — setAnchorPoint(shadowCenter) ในเกมเป็นของหน้า UI ไม่ใช่ยูนิตในสนาม)
 */
export function gameAnchorOffset(rt: RangerRuntime | null): Vec {
  const c = rt?.sam.canvas
  if (!rt || !c || !c.w || !c.h) return { x: 0, y: 0 }
  return { x: c.x + c.w / 2 - rt.stand.x, y: c.y + c.h / 2 - rt.stand.y }
}

/** เป้าของกระสุนแบบเกม: getPosition ของเป้า (+ ยกตาม hitRate) */
function gameTargetPoint(scene: Scene, target: Actor, g: GameProjectile, t: number): Vec {
  const p = actorPos(scene, target, t)
  const rt = rangerOfActor(scene, target)
  const off = gameAnchorOffset(rt)
  const dir = target.flip ? -1 : 1
  const h = rt?.sam.canvas.h ?? 0
  // hitRate ≤ 10 = สัดส่วนความสูงกรอบ · > 10 = ค่าตั้งต้น (LINEAR ยก 0.25 × สูง · CURVE ไม่ยก)
  const lift = g.hitRate <= 10 ? g.hitRate * h : g.motion === 'LINEAR' ? 0.25 * h : 0
  return { x: p.x + off.x * target.scale * dir, y: p.y + (off.y - lift) * target.scale }
}

/** ตำแหน่งกระสุนแบบเกม ณ สัดส่วนเวลา k (0–1) — CCBezierBy (เชิงเส้นตามเวลา) หรือ CCMoveBy */
export function gamePathPos(g: GameProjectile, from: Vec, to: Vec, k: number, forward: number): Vec {
  if (g.motion !== 'CURVE') return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
  const dx = to.x - from.x, dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  // พิกัดสัมพัทธ์จากจุดปล่อย: P0 = P1 = 0 · P2 = กึ่งกลาง + (0.4d ไปข้างหน้า, 0.4d ขึ้น) · P3 = (dx, dy)
  const c2x = dx / 2 + forward * GAME_CURVE_K * d, c2y = dy / 2 - GAME_CURVE_K * d
  const u = 1 - k
  // cocos bezierat(a, b, c, d, t) = u³a + 3tu²b + 3t²u c + t³d (a = b = 0)
  const b2 = 3 * k * k * u, b3 = k * k * k
  return { x: from.x + b2 * c2x + b3 * dx, y: from.y + b2 * c2y + b3 * dy }
}

/** มุมหมุนกระสุนแบบเกม (เรเดียน, บวก = ตามเข็ม) — setRotation(start) แล้ว CCRotateTo(เวลาบิน, end) */
export const gameRotation = (g: GameProjectile, k: number) =>
  g.motion === 'CURVE' ? ((g.angle.start + (g.angle.end - g.angle.start) * k) * Math.PI) / 180 : 0   // CCMoveBy ไม่ตั้งมุม

/**
 * ทรงวิถีจาก attackType (ตัวที่เกมใช้ตัดสินจริง — ไม่ใช่ motion.type ของ lerico)
 *   enum ในเกม: PUNCH 1 · KICK 2 · ENERGY 3 · ENERGYC 4 · SWING 5 · STAB 6 · WEAPON 7 · WEAPONC 8 · LASER 9
 *               DOUBLE 10 · DOUBLEC 11 · RETURN 12 · BEAM 13 · ACTION 14
 *   WEAPON / ENERGY / DOUBLE → CCMoveBy เส้นตรง · RETURN / BEAM มีทางของตัวเอง · ที่เหลือ → CCBezierBy + หมุน
 */
export const gameMotionOf = (attackType: string | null | undefined): 'CURVE' | 'LINEAR' =>
  attackType === 'WEAPON' || attackType === 'ENERGY' || attackType === 'DOUBLE' ? 'LINEAR' : 'CURVE'

// ── การตรวจจับ / ล็อคเป้าแบบเกม (UnitNode::searchTarget — ถอดจาก libgame.so) ──
//   hitbox ของยูนิต   = CCRect(x − contentWidth/2, 0, contentWidth, 320) → แกน X = กว้างเท่ากรอบไฟล์ .sam คร่อมตำแหน่ง
//   ช่องตรวจจับ        = CCRect(ตัวเอง → ข้างหน้า attackRange × (1 + บัฟระยะ), 0 … 320) — แกน Y คลุมทั้งเลน
//   ในระยะ            = ช่องตรวจจับ intersectsRect hitbox ของศัตรู
//   ล็อคเป้า           = เรียงตาม |x เป้า − x ตัวเอง| (แกน X อย่างเดียว) ใกล้สุดก่อน
//   กระสุนทุกลูก (ตีปกติ / สกิล) ยิงใส่เป้าที่ล็อคไว้ตัวเดียวกัน · ปลายทางคำนวณตอนปล่อย (CCBezierBy/MoveBy แบบสัมพัทธ์ — ไม่ตามเป้าที่ขยับหลังปล่อย)
/** ช่วงแกน X ของ hitbox ยูนิต (พิกเซลเวที) */
export function gameHitbox(scene: Scene, a: Actor, t: number): { x0: number; x1: number } {
  const p = actorPos(scene, a, t)
  const rt = rangerOfActor(scene, a)
  const cx = p.x + gameAnchorOffset(rt).x * a.scale * (a.flip ? -1 : 1)
  const half = ((rt?.sam.canvas.w ?? 0) / 2) * a.scale
  return { x0: cx - half, x1: cx + half }
}
/** ช่วงแกน X ของช่องตรวจจับ (ไม่มีระยะโจมตีในข้อมูลเกม = null) */
export function gameDetectRange(scene: Scene, a: Actor, t: number): { x0: number; x1: number } | null {
  const rt = rangerOfActor(scene, a)
  const range = rt?.gamedata?.range
  if (!rt || !range) return null
  const x = actorPos(scene, a, t).x + gameAnchorOffset(rt).x * a.scale * (a.flip ? -1 : 1)
  const len = range * GAME_PX_PER_PT * a.scale
  return facing(a) > 0 ? { x0: x, x1: x + len } : { x0: x - len, x1: x }
}
/** เป้าที่เกมล็อค ณ เวลา t: ศัตรูที่มองเห็นและ hitbox ทับช่องตรวจจับ ใกล้สุดตามแกน X · ไม่มี = null */
export function gameLockTarget(scene: Scene, caster: Actor, t: number): Actor | null {
  const det = gameDetectRange(scene, caster, t)
  if (!det || caster.tag === 'prop') return null
  const me = actorPos(scene, caster, t).x
  let best: Actor | null = null, bestD = Infinity
  for (const a of scene.actors) {
    if (a.id === caster.id || a.tag === 'prop' || a.tag === caster.tag || !a.visible) continue
    if (!rangerOfActor(scene, a)) continue
    const vis = visibility(scene, a, t)
    if (!vis || vis.alpha <= 0) continue
    const hb = gameHitbox(scene, a, t)
    if (hb.x1 < det.x0 || hb.x0 > det.x1) continue
    const d = Math.abs(actorPos(scene, a, t).x - me)
    if (d < bestD) { best = a; bestD = d }
  }
  return best
}
/**
 * เป้าของคิวสกิล: กระสุนแบบเกม (fx.game) → ล็อคเป้าตามเกม ณ ต้นคิว (ไม่เจอในระยะ → ใช้ targetId ที่ตั้งไว้)
 * อื่นๆ → targetId ตามที่ตั้ง
 */
export function cueTarget(scene: Scene, cue: SkillCue): Actor | null {
  const set = scene.actors.find(a => a.id === cue.targetId) ?? null
  if (!cue.fx?.game) return set
  const caster = scene.actors.find(a => a.id === cue.actorId)
  return (caster && gameLockTarget(scene, caster, cue.start)) ?? set
}

export function fxImpactPoint(scene: Scene, cue: SkillCue, t: number): Vec {
  const fx = cue.fx!
  if (fx.mode === 'point') return { ...fx.point }
  const target = cueTarget(scene, cue)
  const caster = scene.actors.find(a => a.id === cue.actorId)
  if (fx.mode === 'caster' && caster) return fxLaunchPoint(scene, cue, caster, t)
  if (!target) {
    // ไม่มีเป้า → ยิงไปข้างหน้า 450px
    if (!caster) return { ...fx.point }
    const p = actorPos(scene, caster, t)
    return { x: p.x + facing(caster) * 450 * caster.scale, y: p.y - 60 * caster.scale }
  }
  if (fx.game) return gameTargetPoint(scene, target, fx.game, t)
  const h = aimPoint(scene, target, fx.aim, t)
  return { x: h.x + fx.impact.x, y: h.y + fx.impact.y }
}

/** จุดเล่น finish (ระเบิด) — แยกจากปลายทางกระสุนได้ */
export function fxFinishPoint(scene: Scene, cue: SkillCue, t: number): Vec {
  const fx = cue.fx!
  const target = cueTarget(scene, cue)
  if (fx.finishSplit && target && fx.mode !== 'point' && fx.mode !== 'caster') {
    const h = actorHitPoint(scene, target, t)
    return { x: h.x + fx.finishOffset.x, y: h.y + fx.finishOffset.y }
  }
  return fxImpactPoint(scene, cue, t)
}

/** ความสูงโค้งที่ใช้จริง */
export function arcHeight(cue: SkillCue, bullet: BulletRuntime | null, from: Vec, to: Vec): number {
  const fx = cue.fx!
  if (fx.arc != null) return fx.arc
  if (bullet?.selfArc) return 0
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  return Math.min(ARC_MAX_HEIGHT, (d * d) / ARC_FLATTEN)
}

/** ตำแหน่งบนเส้นทางโค้ง (k = 0–1) */
export const arcPos = (a: Vec, b: Vec, k: number, h: number): Vec =>
  ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - 4 * h * k * (1 - k) })

/** เหตุการณ์ "โดน" ทุกครั้งในฉาก (ท่าโดนตี / แฟลชของเป้า) */
export interface HitEvent { at: number; targetId: string | null; cue: SkillCue; shot: number; point: Vec }

/** เสียงหนึ่งครั้งบนไทม์ไลน์ (จากแทร็กเสียง หรือเสียงประกอบสกิล) */
export interface SoundEvent { at: number; assetId: string; offset: number; dur: number | null; volume: number; fadeIn: number; fadeOut: number }

export interface Timeline {
  skill: Map<string, SkillTiming>
  hits: HitEvent[]
  sounds: SoundEvent[]
  /** ความยาวจริงของแต่ละคิว (วินาที) — ใช้วาดบล็อกบนไทม์ไลน์ */
  dur: Map<string, number>
}

export function cueBodyDuration(scene: Scene, c: Cue, skill?: SkillTiming): number {
  switch (c.type) {
    case 'anim': {
      if (c.loop) return c.duration
      const rt = rangerOfActor(scene, scene.actors.find(a => a.id === c.actorId))
      const f = clipFrames(rt, c.clip)
      const len = rt && f ? f / (rt.fps * Math.max(0.05, c.speed)) : 1
      return c.hold ? Math.max(len, c.duration) : len
    }
    case 'skill': return (skill ?? skillTiming(scene, c)).end - c.start
    case 'sound': {
      if (c.duration > 0) return c.duration
      const rt = assets.get(c.assetId)
      return rt?.kind === 'audio' ? Math.max(0.05, rt.duration - c.offset) : 1
    }
    case 'camera': return Math.max(c.duration, c.zoomDuration ?? c.duration)
    default: return c.duration
  }
}

export function buildTimeline(scene: Scene): Timeline {
  const skill = new Map<string, SkillTiming>()
  const hits: HitEvent[] = []
  const sounds: SoundEvent[] = []
  const dur = new Map<string, number>()
  for (const c of scene.cues) {
    if (c.type === 'sound') {
      sounds.push({ at: c.start, assetId: c.assetId, offset: c.offset, dur: c.duration > 0 ? c.duration : null, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut })
    }
    if (c.type !== 'skill') { dur.set(c.id, cueBodyDuration(scene, c)); continue }
    const st = skillTiming(scene, c)
    skill.set(c.id, st)
    dur.set(c.id, st.end - c.start)
    if (c.fx && st.shots.length) {
      const tid = cueTarget(scene, c)?.id ?? c.targetId
      for (const s of st.shots) hits.push({ at: s.impactAt, targetId: tid, cue: c, shot: s.index, point: fxImpactPoint(scene, c, s.impactAt) })
    } else if (c.targetId) {
      // ไม่มีเอฟเฟกต์ (ตีประชิด) → โดนที่เฟรมปล่อย
      const tgt = scene.actors.find(a => a.id === c.targetId)
      hits.push({ at: st.launchAt, targetId: c.targetId, cue: c, shot: 0, point: tgt ? actorHitPoint(scene, tgt, st.launchAt) : { x: 0, y: 0 } })
    }
    // เสียงจากเกม (ร่าย/โดน — ปิดทีละอันได้) + เสียงที่ผู้ใช้ใส่เอง
    for (const snd of [...(c.gameSounds ?? []), ...(c.sound ? [c.sound] : [])]) {
      if (!snd.assetId || snd.enabled === false) continue
      const times = snd.at === 'cast' ? [st.castStart] : snd.at === 'release' ? [st.launchAt] : (st.shots.length ? st.shots.map(x => x.impactAt) : [st.launchAt])
      for (const at of times) sounds.push({ at, assetId: snd.assetId, offset: 0, dur: null, volume: snd.volume, fadeIn: 0, fadeOut: 0 })
    }
  }
  hits.sort((a, b) => a.at - b.at)
  sounds.sort((a, b) => a.at - b.at)
  return { skill, hits, sounds, dur }
}

// ── ท่าที่กำลังเล่น ──
export interface ActivePose {
  clips: string[]
  /** เฟรม (ทศนิยม) นับรวมทุกคลิป */
  frame: number
  loop: boolean
}

export function activePose(scene: Scene, tl: Timeline, a: Actor, rt: RangerRuntime, t: number): ActivePose {
  let best: { start: number; pri: number; pose: ActivePose } | null = null
  const consider = (start: number, end: number, pri: number, mk: () => ActivePose) => {
    if (t < start || t >= end) return
    if (!best || start > best.start || (start === best.start && pri > best.pri)) best = { start, pri, pose: mk() }
  }
  const fps = rt.fps
  const walkClip = rt.sam.animations['walk']?.length ? 'walk' : null
  for (const c of scene.cues) {
    if (c.actorId !== a.id) continue
    if (c.type === 'anim' && rt.sam.animations[c.clip]) {
      const sp = Math.max(0.05, c.speed)
      const clipLen = clipFrames(rt, c.clip) / (fps * sp)
      const len = c.loop ? c.duration : c.hold ? Math.max(clipLen, c.duration) : clipLen
      consider(c.start, c.start + len, 2, () => ({ clips: [c.clip], frame: (t - c.start) * fps * sp, loop: c.loop }))
    } else if (c.type === 'move' && c.clip && rt.sam.animations[c.clip]) {
      consider(c.start, c.start + c.duration, 1, () => ({ clips: [c.clip!], frame: (t - c.start) * fps, loop: true }))
    } else if (c.type === 'skill') {
      const st = tl.skill.get(c.id)
      if (!st) continue
      if (walkClip && st.walk > 0) {
        consider(c.start, st.castStart, 3, () => ({ clips: [walkClip], frame: (t - c.start) * fps, loop: true }))
        if (st.homeEnd > st.bodyEnd) consider(st.bodyEnd, st.homeEnd, 3, () => ({ clips: [walkClip], frame: (t - st.bodyEnd) * fps, loop: true }))
      }
      const clips = [...c.cast, c.release].filter(n => rt.sam.animations[n]?.length)
      consider(st.castStart, st.bodyEnd, 3, () => ({
        clips, loop: false,
        // ช่วงร่ายอาจถูกเร่ง (เพดานเวลา) · ช่วงปล่อยเล่นตามความเร็วปกติ
        frame: t < st.releaseAt
          ? (st.castDur > 0 ? ((t - st.castStart) / st.castDur) * st.castFrames : 0)
          : st.castFrames + (t - st.releaseAt) * st.fps,
      }))
    }
  }
  for (const h of tl.hits) {
    if (h.targetId !== a.id || !h.cue.hitReact || !rt.sam.animations[h.cue.hitClip]) continue
    const len = clipFrames(rt, h.cue.hitClip) / fps
    consider(h.at, h.at + len, 0, () => ({ clips: [h.cue.hitClip], frame: (t - h.at) * fps, loop: false }))
  }
  if (best) return (best as { pose: ActivePose }).pose
  const idle = rt.sam.animations[a.idleClip]?.length ? a.idleClip : rt.idle
  return { clips: [idle], frame: Math.max(0, t) * fps, loop: true }
}

/** เฟรม a, เฟรมถัดไป b, เศษ */
export function poseFrames(set: SamSet, pose: ActivePose): [SamFrame | null, SamFrame | null, number] {
  const lists = pose.clips.map(c => set.sam.animations[c] ?? []).filter(l => l.length)
  const total = lists.reduce((n, l) => n + l.length, 0)
  if (!total) return [null, null, 0]
  let f = pose.frame
  if (pose.loop) f = ((f % total) + total) % total
  else f = clamp(f, 0, total - 1)
  const i = Math.floor(f)
  const at = (k: number): SamFrame | null => {
    if (k >= total) { if (!pose.loop) return null; k = 0 }
    for (const l of lists) { if (k < l.length) return l[k]; k -= l.length }
    return null
  }
  return [at(i), at(i + 1), f - i]
}

// ── การมองเห็น (คิว "ปรากฏ") ──
export function visibility(scene: Scene, a: Actor, t: number): { alpha: number; localStart: number } | null {
  const shows = scene.cues.filter((c): c is ShowCue => c.type === 'show' && c.actorId === a.id)
  if (!shows.length) return { alpha: 1, localStart: 0 }
  for (const s of shows) {
    const e = s.start + s.duration
    if (t < s.start || t >= e) continue
    let al = 1
    if (s.fadeIn > 0) al = Math.min(al, (t - s.start) / s.fadeIn)
    if (s.fadeOut > 0) al = Math.min(al, (e - t) / s.fadeOut)
    return { alpha: clamp(al, 0, 1), localStart: s.start }
  }
  return null
}

// ── กล้อง ──
export interface CameraState { cx: number; cy: number; zoom: number }
export function cameraAt(scene: Scene, t: number): CameraState {
  let cx = scene.width / 2, cy = scene.height / 2, zoom = 1
  const cams = scene.cues.filter((c): c is CameraCue => c.type === 'camera' && c.actorId === CAMERA_ID).sort((p, q) => p.start - q.start)
  for (const c of cams) {
    if (t < c.start) break
    const prog = (d: number) => EASES[c.ease](d > 0 ? clamp((t - c.start) / d, 0, 1) : 1)
    const ep = prog(c.duration)                          // ความคืบหน้าการเลื่อน
    const ez = prog(c.zoomDuration ?? c.duration)       // ความคืบหน้าการซูม
    // "กรอบภาพ" เคลื่อนจากกรอบเดิมไปกรอบใหม่เป็นเส้นตรง (มุมทั้ง 4 ของกรอบวิ่งตรงไปหามุมปลายทาง):
    //   กลางกรอบเลื่อนแบบเส้นตรง · ความกว้างกรอบ (= เวที ÷ ซูม) เปลี่ยนแบบเส้นตรง
    //   → เลื่อนกับซูมไปพร้อมกันตลอดทาง ไม่มีช่วงที่ซูมออกก่อนแล้วค่อยเลื่อน
    const w0 = 1 / Math.max(0.05, zoom), w1 = 1 / Math.max(0.05, c.zoom)
    cx = lerp(cx, c.center.x, ep)
    cy = lerp(cy, c.center.y, ep)
    zoom = 1 / lerp(w0, w1, ez)
  }
  return { cx, cy, zoom }
}

export function sceneEnd(scene: Scene, tl: Timeline): number {
  let end = 0
  for (const c of scene.cues) end = Math.max(end, c.start + (tl.dur.get(c.id) ?? 0))
  return end
}
