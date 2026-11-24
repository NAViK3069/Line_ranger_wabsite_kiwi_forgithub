// ====================================================
// render.ts — วาดฉาก ณ เวลา t ลง canvas
// ctx ต้องตั้ง transform ให้ "1 หน่วย = 1 พิกเซลเวที" มาก่อน (ฝั่งผู้เรียกจัดการขนาดจอ/DPR)
// ====================================================
import { renderSAMFrame, lerpSAMFrame } from '@/anme/lib/animation/samRenderer'
import type { SamFrame } from '@/anme/lib/animation/samParser'
import { assets, type RangerRuntime } from './assets'
import {
  BANNER_TIME, HIT_FLASH, actorPos, activePose, arcHeight, arcPos, buildTimeline, cameraAt, fxFinishPoint, fxImpactPoint,
  GAME_PX_PER_PT, facing, fxLaunchPoint, gamePathPos, gameRotation, poseFrames, visibility, type Timeline,
} from './timeline'
import { ART_FACES_LEFT, clamp } from './scene'
import type { Actor, InfoCue, Scene, SkillCard, Vec } from './types'
import { appUrl } from './storage'

export interface RenderOptions {
  playing: boolean
  /** ใช้ timeline ที่คำนวณไว้แล้ว (ประหยัด) */
  timeline?: Timeline
  /** วาดเส้นพื้นช่วยจัด */
  guides?: boolean
  /** ปิดเสียงวิดีโอทั้งหมด (ตอน export / ตอนลาก) */
  forceMute?: boolean
  /** วาดกรอบแดงรอบชิ้นส่วนนี้ (แผงเลเยอร์) */
  hoverPart?: { actorId: string; name: string } | null
}

// Set ของชิ้นที่ซ่อน — แคชตามอาร์เรย์เดิม ไม่สร้างใหม่ทุกเฟรม
const hiddenCache = new WeakMap<string[], Set<string>>()
function hiddenSet(list: string[] | undefined): Set<string> | undefined {
  if (!list?.length) return undefined
  let s = hiddenCache.get(list)
  if (!s) { s = new Set(list); hiddenCache.set(list, s) }
  return s
}

/** สี่มุมของชิ้นส่วน (คำนวณแบบเดียวกับ renderSAMFrame) — ใช้วาดกรอบชิ้นที่ชี้อยู่ */
function pieceQuads(frame: SamFrame, rt: RangerRuntime, name: string, ox: number, oy: number, z: number, flip: boolean, pivot: number): Vec[][] {
  const out: Vec[][] = []
  for (const [, res, m, color] of frame) {
    if (color[3] === 0 || res >= rt.sam.images.length) continue
    const img = rt.sam.images[res]
    if (img.name !== name) continue
    const spr = rt.sprites[img.name]
    if (!spr) continue
    const [m00, m01, m10, m11, m02, m12] = m
    const [i00, i01, i10, i11, i02, i12] = img.m
    const cx = spr.w / 2, cy = spr.h / 2
    const pCx = i00 * (spr.ox + cx) + i01 * (spr.oy + cy) + i02, pCy = i10 * (spr.ox + cx) + i11 * (spr.oy + cy) + i12
    const wCx = m00 * pCx + m01 * pCy + m02, wCy = m10 * pCx + m11 * pCy + m12
    const f00 = m00 * i00 + m01 * i10, f01 = m00 * i01 + m01 * i11, f10 = m10 * i00 + m11 * i10, f11 = m10 * i01 + m11 * i11
    out.push([[-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy]].map(([sx, sy]) => {
      const wx = wCx + f00 * sx + f01 * sy, wy = wCy + f10 * sx + f11 * sy
      return { x: ox + (flip ? 2 * pivot - wx : wx) * z, y: oy + wy * z }
    }))
  }
  return out
}

const usedVideos = new Set<string>()

function syncVideo(key: string, url: string, localT: number, playing: boolean, loop: boolean, speed: number, muted: boolean) {
  const v = assets.video(key, url)
  usedVideos.add(key)
  const dur = v.duration || 0
  let target = Math.max(0, localT * speed)
  if (dur > 0) target = loop ? target % dur : Math.min(target, Math.max(0, dur - 0.04))
  const ended = !loop && dur > 0 && localT * speed >= dur - 0.04
  v.muted = muted
  if (playing && !ended) {
    v.playbackRate = clamp(speed, 0.1, 8)
    if (v.paused) { v.currentTime = target; v.play().catch(() => { v.muted = true; v.play().catch(() => {}) }) }
    else if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target
  } else {
    if (!v.paused) v.pause()
    if (Math.abs(v.currentTime - target) > 0.03 && !v.seeking) v.currentTime = target
  }
  return v.readyState >= 2 ? v : null
}

/** ภาพของ media actor / พื้นหลัง ณ เวลา local */
function mediaSource(assetId: string, key: string, localT: number, playing: boolean, loop: boolean, speed: number, muted: boolean):
  { img: CanvasImageSource; w: number; h: number } | null {
  const rt = assets.get(assetId)
  if (!rt) return null
  if (rt.kind === 'image') {
    if (!rt.frames) return { img: rt.still, w: rt.w, h: rt.h }
    let tt = Math.max(0, localT * speed)
    tt = loop ? tt % rt.total : Math.min(tt, rt.total - 1e-3)
    let lo = 0, hi = rt.frames.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rt.frames[mid].at <= tt) lo = mid; else hi = mid - 1 }
    return { img: rt.frames[lo].bmp, w: rt.w, h: rt.h }
  }
  if (rt.kind === 'sequence') {
    const n = rt.frames.length
    let i = Math.floor(Math.max(0, localT * speed) * rt.fps)
    i = loop ? i % n : Math.min(i, n - 1)
    return { img: rt.frames[i], w: rt.w, h: rt.h }
  }
  if (rt.kind === 'video') {
    const v = syncVideo(key, rt.url, localT, playing, loop, speed, muted)
    return v ? { img: v, w: rt.w, h: rt.h } : null
  }
  return null
}

// ── พื้นหลัง ──
function drawBackground(ctx: CanvasRenderingContext2D, scene: Scene, t: number, opts: RenderOptions) {
  const bg = scene.background
  const W = scene.width, H = scene.height
  ctx.save()
  if (bg.blur > 0) ctx.filter = `blur(${bg.blur}px)`
  // พื้นฐานกันขอบโหว่ตอนกล้องซูมออก
  ctx.fillStyle = bg.kind === 'color' ? bg.color : '#05060b'
  ctx.fillRect(-W * 2, -H * 2, W * 5, H * 5)
  if (bg.kind === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, bg.gradient[0]); g.addColorStop(1, bg.gradient[1])
    ctx.fillStyle = g
    ctx.fillRect(-W * 2, -H * 2, W * 5, H * 5)
  }
  let src: { img: CanvasImageSource; w: number; h: number } | null = null
  let roadRatio: number | null = null
  if (bg.kind === 'stage') {
    const st = assets.stage(bg.stage)
    if (st) { src = { img: st.canvas, w: st.canvas.width, h: st.canvas.height }; roadRatio = st.roadRatio }
  } else if (bg.kind === 'asset' && bg.assetId) {
    src = mediaSource(bg.assetId, 'bg', t, opts.playing, true, 1, opts.forceMute ?? true)
  }
  if (src) {
    let w: number, h: number
    const ar = src.w / src.h
    if (bg.fit === 'stretch') { w = W; h = H }
    else if (bg.fit === 'contain') { if (W / H > ar) { h = H; w = H * ar } else { w = W; h = W / ar } }
    else if (bg.fit === 'height') { h = H; w = H * ar }
    else { if (W / H > ar) { w = W; h = W / ar } else { h = H; w = H * ar } }
    w *= bg.scale; h *= bg.scale
    let x = (W - w) / 2 + bg.offsetX
    let y = (H - h) / 2 + bg.offsetY
    // ฉากด่าน: ให้ "ถนน" ในภาพตรงกับเส้นพื้นของฉาก · ชิดซ้าย (ภาพยาวมาก)
    if (roadRatio != null) { y = scene.groundY - h * roadRatio + bg.offsetY; x = bg.offsetX - w * 0.04 }
    if (bg.scrollX) {
      const span = w
      const off = ((-bg.scrollX * t) % span + span) % span
      x = x - off
      for (let k = -1; k <= Math.ceil(W / span) + 1; k++) ctx.drawImage(src.img, x + k * span, y, w, h)
    } else {
      ctx.drawImage(src.img, x, y, w, h)
    }
  }
  ctx.filter = 'none'
  if (bg.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${bg.dim})`; ctx.fillRect(-W * 2, -H * 2, W * 5, H * 5) }
  ctx.restore()
}

// ── ตัวละคร ──
function drawRanger(ctx: CanvasRenderingContext2D, scene: Scene, tl: Timeline, a: Actor, rt: RangerRuntime, t: number, alpha: number, hover?: RenderOptions['hoverPart']) {
  const pose = activePose(scene, tl, a, rt, t)
  const [fa, fb, frac] = poseFrames(rt, pose)
  if (!fa) return
  const frame = scene.smooth ? lerpSAMFrame(fa, fb, frac) : fa
  const p = actorPos(scene, a, t)
  const z = a.scale
  const ox = p.x - rt.stand.x * z, oy = p.y - rt.stand.y * z
  ctx.save()
  ctx.globalCompositeOperation = a.blend
  const hidden = hiddenSet(a.hiddenParts)
  renderSAMFrame(ctx, frame, rt.sam.images, rt.sprites, ox, oy, z, hidden, a.flip, rt.stand.x, 0, alpha * a.opacity)
  // แฟลชตอนโดน
  let flash = 0
  for (const h of tl.hits) {
    if (h.targetId !== a.id || !h.cue.flash) continue
    const d = t - h.at
    if (d >= 0 && d < HIT_FLASH) flash = Math.max(flash, 1 - d / HIT_FLASH)
  }
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter'
    renderSAMFrame(ctx, frame, rt.sam.images, rt.sprites, ox, oy, z, hidden, a.flip, rt.stand.x, 0, flash * 0.85 * alpha)
  }
  ctx.restore()
  // กรอบแดงรอบชิ้นที่ชี้อยู่ในแผงเลเยอร์
  if (hover && hover.actorId === a.id) {
    ctx.save()
    ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2; ctx.setLineDash([5, 3])
    ctx.shadowColor = 'rgba(255,40,80,0.9)'; ctx.shadowBlur = 6
    for (const q of pieceQuads(frame, rt, hover.name, ox, oy, z, a.flip, rt.stand.x)) {
      ctx.beginPath(); q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); ctx.closePath(); ctx.stroke()
    }
    ctx.restore()
  }
}

/** ชิ้นส่วนในเฟรมที่ actor แสดงอยู่ ณ เวลา t (เรียงบน→ล่าง) — ใช้ในแผงเลเยอร์ */
export function actorFrameParts(scene: Scene, tl: Timeline, a: Actor, rt: RangerRuntime, t: number): { name: string; count: number }[] {
  const [fa] = poseFrames(rt, activePose(scene, tl, a, rt, t))
  if (!fa) return []
  const by = new Map<string, number>()
  for (const [, res, , color] of fa) {
    if (color[3] === 0 || res >= rt.sam.images.length) continue
    const n = rt.sam.images[res].name
    by.set(n, (by.get(n) ?? 0) + 1)
  }
  return [...by].map(([name, count]) => ({ name, count })).reverse()
}

function drawMedia(ctx: CanvasRenderingContext2D, a: Actor, t: number, localStart: number, alpha: number, opts: RenderOptions) {
  const src = mediaSource(a.assetId, 'actor:' + a.id, t - localStart, opts.playing, a.loop, a.speed, opts.forceMute || a.muted)
  if (!src) return
  ctx.save()
  ctx.globalAlpha = alpha * a.opacity
  ctx.globalCompositeOperation = a.blend
  ctx.translate(a.x, a.y)
  if (a.rotation) ctx.rotate((a.rotation * Math.PI) / 180)
  ctx.scale(a.flip ? -a.scale : a.scale, a.scale)
  ctx.drawImage(src.img, -src.w / 2, -src.h / 2, src.w, src.h)
  ctx.restore()
}

// ── เอฟเฟกต์สกิล ──
// ช่วงบิน: normal (วนระหว่างบิน หรือยืดให้จบพอดีถึงเป้า) · ช่วงกระทบ: finish ที่ปลายทาง (หรือจุดแยก)
function drawSkillFx(ctx: CanvasRenderingContext2D, scene: Scene, tl: Timeline, t: number) {
  for (const c of scene.cues) {
    if (c.type !== 'skill' || !c.fx) continue
    const st = tl.skill.get(c.id)
    const b = st?.bullet
    if (!st || !b) continue
    const caster = scene.actors.find(a => a.id === c.actorId)
    if (!caster || !caster.visible) continue
    const fx = c.fx
    const fps = b.fps * Math.max(0.05, c.speed)
    const z = fx.scale * caster.scale
    // renderSAMFrame หมุนก่อนแล้วค่อยมิเรอร์ → ตอนกลับด้าน มุมต้องสะท้อนเป็น π − มุม
    const toRot = (ang: number) => (caster.flip ? Math.PI - ang : ang) + (fx.rotOffset * Math.PI) / 180
    // จุดยึดภาพ (ดู SkillFx.anchor): center = กึ่งกลางภาพเฟรมแรกของช่วงนั้น · stand = จุดยืนของผู้ร่ายในไฟล์ · อื่นๆ = 0,0
    const casterRt = assets.get(caster.assetId)
    const standRef = casterRt?.kind === 'ranger' ? casterRt.stand : null
    // เกม: SuperAnimNode anchor (0.5, 0.5) = กึ่งกลางกรอบเวทีของไฟล์กระสุน (ทั้งช่วงบินและระเบิด — โหนดเดียวกัน)
    const bc = b.sam.canvas
    const gameRef: Vec = { x: bc.x + bc.w / 2, y: bc.y + bc.h / 2 }
    const refFor = (flight: boolean): Vec => {
      if (fx.game) return gameRef
      if (fx.anchor === 'center') return (flight ? b.flightRef ?? b.burstRef : b.burstRef ?? b.flightRef) ?? { x: 0, y: 0 }
      if (fx.anchor === 'stand') return standRef ?? { x: 0, y: 0 }
      return { x: 0, y: 0 }
    }
    for (const s of st.shots) {
      if (t < s.launchAt || t >= s.endAt) continue
      let pos: Vec, rot = 0, clip: string | null, local: number, loop = false, inFlight = true
      const flightFrames = fx.flight ? b.sam.animations[fx.flight]?.length ?? 0 : 0
      if (t < s.impactAt) {
        clip = fx.flight
        local = (t - s.launchAt) * fps
        if (fx.game) {
          // เกม: CCBezierBy / CCMoveBy + CCRotateTo เชิงเส้นตามเวลา · คลิป normal วนตลอดทาง
          const from = fxLaunchPoint(scene, c, caster, s.launchAt)
          const to = fxImpactPoint(scene, c, s.launchAt)
          const k = clamp((t - s.launchAt) / s.flightDur, 0, 1)
          pos = gamePathPos(fx.game, from, to, k, facing(caster))
          rot = gameRotation(fx.game, k)
          loop = true
        } else if (fx.mode === 'projectile') {
          const from = fxLaunchPoint(scene, c, caster, s.launchAt)
          const to = fxImpactPoint(scene, c, t)
          const h = arcHeight(c, b, from, to)
          const k = clamp((t - s.launchAt) / s.flightDur, 0, 1)
          pos = arcPos(from, to, k, h)
          if (fx.fitFlight && flightFrames) local = k * (flightFrames - 1)
          else loop = true
          if (fx.rotate) {
            const nx = arcPos(from, to, Math.min(1, k + 0.01), h)
            const pv = arcPos(from, to, Math.max(0, k - 0.01), h)
            rot = toRot(Math.atan2(nx.y - pv.y, nx.x - pv.x))
          }
        } else {
          pos = fx.mode === 'caster' ? fxLaunchPoint(scene, c, caster, s.launchAt) : fxImpactPoint(scene, c, t)
        }
      } else {
        inFlight = false
        clip = fx.finish
        local = (t - s.impactAt) * fps
        pos = fxFinishPoint(scene, c, s.impactAt)
        // โหนดเดียวกับช่วงบิน: finish ค้างมุมที่ CCRotateTo ไปถึง (วาร์ป moveSpeed 0 = มุมเริ่ม)
        if (fx.game) rot = gameRotation(fx.game, s.flightDur > 0 ? 1 : 0)
        else if (fx.rotate && fx.rotateFinish && fx.mode === 'projectile') {
          const from = fxLaunchPoint(scene, c, caster, s.launchAt)
          const to = fxImpactPoint(scene, c, s.impactAt)
          const h = arcHeight(c, b, from, to)
          const a = arcPos(from, to, 0.99, h), e = arcPos(from, to, 1, h)
          rot = toRot(Math.atan2(e.y - a.y, e.x - a.x))
        }
      }
      if (!clip) continue
      const frames = b.sam.animations[clip]
      if (!frames?.length) continue
      let i = Math.floor(local)
      i = loop ? i % frames.length : Math.min(i, frames.length - 1)
      const fa = frames[i]
      const fb = frames[i + 1] ?? (loop ? frames[0] : null)
      const frame = scene.smooth ? lerpSAMFrame(fa, fb, local - Math.floor(local)) : fa
      ctx.save()
      ctx.globalCompositeOperation = fx.blend
      // วางจุดยึด (ref) ลงที่ pos: renderSAMFrame หมุนรอบ 0,0 ของไฟล์ก่อนแล้วค่อยกลับด้าน (แกน 0)
      // → ตำแหน่งของ ref หลังหมุน/กลับด้าน = mirror(R·ref) · เลื่อนจุดเริ่มวาดถอยกลับเท่านั้น
      const ref = refFor(inFlight)
      const cr = Math.cos(rot), sr = Math.sin(rot)
      const rx = (cr * ref.x - sr * ref.y) * (caster.flip ? -1 : 1), ry = sr * ref.x + cr * ref.y
      renderSAMFrame(ctx, frame, b.sam.images, b.sprites, pos.x - rx * z, pos.y - ry * z, z, undefined, caster.flip, 0, rot)
      ctx.restore()
    }
  }
}

// ── แถบบอกระยะ (เลเยอร์ "ระยะ" ใต้เรนเจอร์ — แบบปุ่มระยะโจมตีของตัวเล่นอนิเมชั่นเรนเจอร์) ──
// หน่วย pt ของเกม → หน่วยของไฟล์ .sam ด้วยตัวคูณเดียวกับตัวเล่นอนิเมชั่น (PT_TO_WORLD) แล้วคูณ scale ของตัวละคร
// ขนาดเส้น/ตัวหนังสือคิดเทียบเวที 720p (จอใหญ่/เล็กกว่าก็ได้สัดส่วนเดิม) · เส้นมีขอบดำรอง อ่านออกบนฉากสว่าง
// เกม: 1 pt = 2 พิกเซลของไฟล์ .sam (contentScaleFactor — ยืนยันจาก SuperAnimNode::init ใน libgame.so · เดิมจูนด้วยตา 2.1)
const PT_TO_WORLD = GAME_PX_PER_PT
const RANGE_ATK_COLOR = '#ffffff'
const RANGE_BUFF_COLOR = '#4ade80'
const RANGE_SKILL_COLOR = '#fb923c'
const LAYER_FADE = 0.15
const UI_FONT = 'LineBold, Kanit, Inter, system-ui, sans-serif'

/** ความทึบของคิวที่มีช่วงเวลา (เฟดเข้า/ออกสั้นๆ) · นอกช่วง = 0 */
function cueAlpha(c: { start: number; duration: number }, t: number, fadeIn = LAYER_FADE, fadeOut = LAYER_FADE): number {
  const e = c.start + c.duration
  if (t < c.start || t >= e) return 0
  // บล็อกที่เริ่มตั้งแต่ต้นฉาก ไม่ต้องเฟดเข้า (ไม่งั้นเฟรมแรกของวิดีโอ/ตอนหัวอ่านอยู่ 0 จะมองไม่เห็น)
  const kin = c.start <= 0 ? 1 : (t - c.start) / fadeIn
  return clamp(Math.min(kin, (e - t) / fadeOut), 0, 1)
}

function drawRanges(ctx: CanvasRenderingContext2D, scene: Scene, t: number, order: Actor[]) {
  // คิวระยะที่กำลังแสดงของแต่ละตัว (เลเยอร์เปิดอยู่เท่านั้น)
  // ตำแหน่งแนวตั้ง (atkY / skillY) ใช้ของคิวแรกที่เจอในช่วงนั้น
  const active = new Map<string, { atk: number; skill1: number; skill2: number; atkY: number; skillY: number }>()
  for (const c of scene.cues) {
    if (c.type !== 'range') continue
    const al = cueAlpha(c, t)
    if (al <= 0) continue
    const m = active.get(c.actorId) ?? { atk: 0, skill1: 0, skill2: 0, atkY: c.atkY ?? 0, skillY: c.skillY ?? 0 }
    if (c.atk) m.atk = Math.max(m.atk, al)
    if (c.skill1) m.skill1 = Math.max(m.skill1, al)
    if (c.skill2) m.skill2 = Math.max(m.skill2, al)
    active.set(c.actorId, m)
  }
  if (!active.size) return
  const list = order.flatMap(a => {
    const show = active.get(a.id)
    if (!show || !a.layers?.range) return []
    const rt = assets.get(a.assetId)
    if (rt?.kind !== 'ranger' || !rt.gamedata) return []
    const vis = visibility(scene, a, t)
    if (!vis || vis.alpha <= 0) return []
    return [{ a, rt, gd: rt.gamedata, show, alpha: vis.alpha, p: actorPos(scene, a, t) }]
  })
  if (!list.length) return
  const f = scene.height / 720
  const TICK = 20 * f, ROW = 52 * f, LW = 5 * f
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.font = `900 ${Math.round(26 * f)}px ${UI_FONT}`
  // ป้ายตัวอักษรขอบดำหนา (strokeText — ไม่ใช้ shadowBlur เพราะวาดใหม่ทุกเฟรม)
  const label = (text: string, x: number, y: number, color: string) => {
    ctx.lineWidth = 7 * f; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y)
    ctx.fillStyle = color; ctx.fillText(text, x, y)
  }
  // เส้นสองชั้น: ขอบดำกว้าง + สีจริง
  const path = (pts: [number, number][][], color: string) => {
    for (const [w, c] of [[LW + 4 * f, 'rgba(0,0,0,0.75)'], [LW, color]] as const) {
      ctx.lineWidth = w; ctx.strokeStyle = c
      ctx.beginPath()
      for (const seg of pts) seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
  }
  // นับแถวรวมทุกตัว + แถบสกิลเริ่มจากระดับหัวของตัวที่สูงที่สุด — หลายตัวในฉาก แถบ/ป้ายจะได้ไม่ทับกัน
  // มีหลายตัว → ใส่ชื่อตัวละครหน้าป้ายด้วย จะได้รู้ว่าแถบไหนของใคร
  // ค่าเริ่มต้น: ATK ต่ำกว่าเท้าพอสมควร (ไม่ทับเงา/ตัวละคร) · สกิลลอยสูงเหนือหัว — ปรับเพิ่มได้ด้วย atkY / skillY ของบล็อก
  let atkRow = 0, row = 0
  const top = Math.min(...list.map(({ a, rt, p }) => p.y + rt.box.y0 * a.scale)) - 70 * f
  const many = list.length > 1
  for (const { a, gd, show, alpha, p } of list) {
    const who = many ? `${a.name} · ` : ''
    const dir = (a.flip !== ART_FACES_LEFT) ? -1 : 1   // ทิศ "ข้างหน้า" บนจอ (+1 = ขวา)
    const k = PT_TO_WORLD * a.scale                      // pt → พิกเซลเวที
    const range = gd.range ?? null
    // ── ระยะโจมตี: คร่อมจากจุดยืนถึงระยะโจมตี ใต้เท้า ขีดตั้งชี้ขึ้น ป้ายใต้เส้น ──
    if (show.atk > 0 && range) {
      ctx.globalAlpha = alpha * show.atk
      const x1 = p.x + dir * range * k, y = p.y + 62 * f + show.atkY * f + atkRow++ * ROW
      path([[[p.x, y - TICK], [p.x, y], [x1, y], [x1, y - TICK]]], RANGE_ATK_COLOR)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      label(`${who}ATK ${Math.round(range)}pt`, (p.x + x1) / 2, y + 8 * f, RANGE_ATK_COLOR)
    }
    // ── ระยะสกิล: จุดกึ่งกลาง = ตัวเอง (บัฟ, 觸發基準 self) หรือเป้าที่ระยะโจมตี (แนวหลัง = ระยะ × ตัวคูณ)
    //    แผ่ไปหน้า/หลังข้างละ area · วางเหนือหัว ซ้อนขึ้นทีละแถบ ──
    for (const slot of ['skill1', 'skill2'] as const) {
      const sr = gd.skillRanges?.[slot]
      if (!sr || show[slot] <= 0) continue
      const buff = sr.basis === 'self'
      let cx = p.x
      if (!buff) {
        if (!range) continue
        cx = p.x + dir * range * (sr.basis === 'rear' && sr.rearMul ? sr.rearMul : 1) * k
      }
      ctx.globalAlpha = alpha * show[slot]
      const half = sr.area * k
      const y = top + show.skillY * f - row++ * ROW
      const color = buff ? RANGE_BUFF_COLOR : RANGE_SKILL_COLOR
      path([[[cx - half, y + TICK], [cx - half, y], [cx + half, y], [cx + half, y + TICK]], [[cx, y], [cx, y + TICK]]], color)
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'center'
      // ป้ายบอกชนิดเสมอ: Buff (รอบตัวเอง) · ATK (รอบเป้า) · ATK Rear (เป้าแนวหลัง)
      const name = `${slot === 'skill1' ? 'Skill 1' : 'Skill 2'} · ${buff ? 'Buff' : sr.basis === 'rear' ? 'ATK Rear' : 'ATK'}`
      label(`${who}${name} ${sr.area * 2}pt`, cx, y - 7 * f, color)
    }
  }
  ctx.restore()
}

// ── การ์ดคำอธิบายสกิล (เลเยอร์ "คำอธิบาย" ใต้เรนเจอร์) — มุมซ้ายบนของจอ ไม่ขยับตามกล้อง ──
// ไอคอนโหลดผ่าน Worker (/api/res → CORS) วาดลง canvas แล้วยังส่งออกวิดีโอได้ · ยังโหลดไม่เสร็จ = กล่องเปล่าไปก่อน
const iconCache = new Map<string, HTMLImageElement | null>()
function iconImg(url: string): HTMLImageElement | null {
  if (!iconCache.has(url)) {
    iconCache.set(url, null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => iconCache.set(url, img)
    img.src = appUrl(url)
  }
  return iconCache.get(url) ?? null
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * วาดการ์ดหนึ่งใบที่ (x, y) · คืนความสูง (ใช้เรียงใบถัดไป)
 * ไม่ตัดบรรทัด — ผลของสกิลข้อละ 1 บรรทัดเสมอ การ์ดกว้างตามข้อความที่ยาวที่สุด
 * ขยาย (scale) = ขยายทั้งใบเท่ากันหมด (ตัวหนังสือ ไอคอน ระยะห่าง ความกว้าง)
 */
function drawSkillCard(ctx: CanvasRenderingContext2D, card: SkillCard, x: number, y: number, u: number, life: number): number {
  const pad = 14 * u, icon = 54 * u, gap = 12 * u
  const fTitle = `900 ${Math.round(25 * u)}px ${UI_FONT}`
  const fStat = `700 ${Math.round(14 * u)}px ${UI_FONT}`
  const fBody = `700 ${Math.round(16.5 * u)}px ${UI_FONT}`
  const fMeta = `800 ${Math.round(15.5 * u)}px ${UI_FONT}`
  const bodyLH = 22 * u, metaLH = 21 * u, bullet = 16 * u
  const metas = [card.target, card.timing].filter(Boolean)

  // ── วัดขนาด ──
  ctx.font = fTitle
  const nameW = ctx.measureText(card.name).width
  ctx.font = fStat
  const statW = card.stat ? ctx.measureText(card.stat).width : 0
  ctx.font = fBody
  const lines = card.effects.map(s => ({ s, first: true }))
  const bodyW = Math.max(0, ...lines.map(l => ctx.measureText(l.s).width + bullet))
  ctx.font = fMeta
  const metaW = Math.max(0, ...metas.map(m => ctx.measureText(m).width + bullet))
  const w = Math.max(280 * u, icon + gap + Math.max(nameW, statW), bodyW, metaW) + pad * 2
  const headH = icon
  const h = pad + headH
    + (lines.length ? 10 * u + 1 + 9 * u + lines.length * bodyLH : 0)
    + (metas.length ? 9 * u + 1 + 8 * u + metas.length * metaLH : 0)
    + pad - 2 * u

  // ── พื้นการ์ด: กระจกสีเข้ม + เงา + ขอบไล่สีทอง→ฟ้า + แถบซ้ายสีทอง ──
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 4 * u
  roundRectPath(ctx, x, y, w, h, 14 * u)
  const bg = ctx.createLinearGradient(x, y, x, y + h)
  bg.addColorStop(0, 'rgba(16,24,52,0.95)'); bg.addColorStop(1, 'rgba(6,9,22,0.95)')
  ctx.fillStyle = bg
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRectPath(ctx, x, y, w, h, 14 * u)
  ctx.clip()
  const acc = ctx.createLinearGradient(x, y, x, y + h)
  acc.addColorStop(0, '#ffe27a'); acc.addColorStop(1, '#ff8a1f')
  ctx.fillStyle = acc
  ctx.fillRect(x, y, 4 * u, h)
  // แสงวาบพาดผ่านตอนการ์ดเข้ามา (0.15–0.75 วิแรก)
  const sweep = clamp((life - 0.15) / 0.6, 0, 1)
  if (sweep > 0 && sweep < 1) {
    const sx = x - w * 0.4 + sweep * w * 1.8
    const g = ctx.createLinearGradient(sx - 60 * u, y, sx + 60 * u, y + h * 0.3)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
  roundRectPath(ctx, x + 0.75 * u, y + 0.75 * u, w - 1.5 * u, h - 1.5 * u, 13.5 * u)
  const bd = ctx.createLinearGradient(x, y, x + w, y + h)
  bd.addColorStop(0, 'rgba(255,214,102,0.95)'); bd.addColorStop(0.55, 'rgba(255,150,60,0.25)'); bd.addColorStop(1, 'rgba(90,200,255,0.45)')
  ctx.strokeStyle = bd; ctx.lineWidth = 1.5 * u
  ctx.stroke()

  // ── หัว: ไอคอนสกิล + ชื่อ + อัตราใช้/คูลดาวน์ ──
  const ix = x + pad + 2 * u, iy = y + pad
  ctx.save()
  roundRectPath(ctx, ix, iy, icon, icon, 11 * u)
  ctx.fillStyle = '#0b1226'; ctx.fill()
  ctx.clip()
  const img = card.icon ? iconImg(card.icon) : null
  if (img) ctx.drawImage(img, ix, iy, icon, icon)
  ctx.restore()
  roundRectPath(ctx, ix, iy, icon, icon, 11 * u)
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2 * u; ctx.stroke()

  const tx = ix + icon + gap
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.font = fTitle
  const titleY = iy + (card.stat ? 26 * u : 36 * u)
  ctx.lineWidth = 5 * u; ctx.strokeStyle = 'rgba(20,10,0,0.9)'; ctx.lineJoin = 'round'
  ctx.strokeText(card.name, tx, titleY)
  const tg = ctx.createLinearGradient(0, titleY - 22 * u, 0, titleY + 2 * u)
  tg.addColorStop(0, '#fff7cf'); tg.addColorStop(0.5, '#ffd84d'); tg.addColorStop(1, '#ffa11c')
  ctx.fillStyle = tg
  ctx.fillText(card.name, tx, titleY)
  if (card.stat) {
    ctx.font = fStat; ctx.fillStyle = '#9fb3d9'
    ctx.fillText(card.stat, tx, iy + 48 * u)
  }

  // เส้นคั่นไล่สีจางไปทางขวา
  let cy = iy + headH
  const divider = () => {
    cy += 9 * u
    const g = ctx.createLinearGradient(x + pad, 0, x + w - pad, 0)
    g.addColorStop(0, 'rgba(255,214,102,0.55)'); g.addColorStop(1, 'rgba(255,214,102,0)')
    ctx.fillStyle = g
    ctx.fillRect(x + pad, cy, w - pad * 2, Math.max(1, u))
    cy += 1 + 8 * u
  }

  // ── ผลของสกิล: หัวข้อเป็นเพชรสีฟ้าอมเขียว ──
  if (lines.length) {
    divider()
    cy += 1 * u
    ctx.font = fBody; ctx.textBaseline = 'middle'
    for (const l of lines) {
      const my = cy + bodyLH / 2
      if (l.first) {
        ctx.save()
        ctx.translate(x + pad + 4 * u, my)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#5eead4'
        ctx.fillRect(-3.2 * u, -3.2 * u, 6.4 * u, 6.4 * u)
        ctx.restore()
      }
      ctx.fillStyle = '#f1f5f9'
      ctx.fillText(l.s, x + pad + bullet, my)
      cy += bodyLH
    }
  }

  // ── เป้าหมาย/ระยะ (ฟ้า) · เวลาร่าย/ฟื้นตัว (ส้ม) — ไอคอนวาดเอง (ไม่พึ่งอีโมจิของเครื่อง) ──
  if (metas.length) {
    divider()
    ctx.font = fMeta; ctx.textBaseline = 'middle'
    const glyph = (kind: 'target' | 'time', gx: number, gy: number, color: string) => {
      ctx.save()
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8 * u
      ctx.beginPath(); ctx.arc(gx, gy, 5.5 * u, 0, Math.PI * 2); ctx.stroke()
      if (kind === 'target') {
        ctx.beginPath(); ctx.arc(gx, gy, 1.8 * u, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(gx, gy - 3.4 * u); ctx.lineTo(gx, gy); ctx.lineTo(gx + 2.6 * u, gy + 1.4 * u); ctx.stroke()
      }
      ctx.restore()
    }
    metas.forEach((m, i) => {
      const my = cy + metaLH / 2
      const isTime = m === card.timing && i === metas.length - 1 && !!card.timing
      const color = isTime ? '#fdba74' : '#7dd3fc'
      glyph(isTime ? 'time' : 'target', x + pad + 5 * u, my, color)
      ctx.fillStyle = color
      ctx.fillText(m, x + pad + bullet, my)
      cy += metaLH
    })
  }
  return h
}

function drawInfoCards(ctx: CanvasRenderingContext2D, scene: Scene, t: number) {
  const cards = scene.cues
    .filter((c): c is InfoCue => c.type === 'info' && t >= c.start && t < c.start + c.duration)
    .filter(c => scene.actors.find(a => a.id === c.actorId)?.layers?.info)
    .sort((p, q) => p.start - q.start)
  if (!cards.length) return
  const f = scene.height / 720
  let y = 18 * f
  for (const c of cards) {
    const life = t - c.start
    const kin = clamp(life / 0.3, 0, 1)
    const ease = 1 - Math.pow(1 - kin, 3)
    const al = Math.min(kin, clamp((c.start + c.duration - t) / 0.22, 0, 1))
    const u = f * Math.max(0.3, c.scale)
    ctx.save()
    ctx.globalAlpha = al
    const h = drawSkillCard(ctx, c.card, 18 * f + c.offsetX - (1 - ease) * 46 * u, y + c.offsetY, u, life)
    ctx.restore()
    y += (h + 10 * f) * Math.max(ease, al)
  }
}

function drawOverlays(ctx: CanvasRenderingContext2D, scene: Scene, t: number) {
  const W = scene.width, H = scene.height
  // ป้ายชื่อสกิล
  for (const c of scene.cues) {
    if (c.type !== 'skill' || !c.banner) continue
    const d = t - c.start
    if (d < 0 || d >= BANNER_TIME) continue
    const inK = clamp(d / 0.18, 0, 1), outK = clamp((BANNER_TIME - d) / 0.25, 0, 1)
    const ease = 1 - Math.pow(1 - inK, 3)
    const bh = Math.round(H * 0.12)
    const y = H * 0.2
    ctx.save()
    ctx.globalAlpha = outK
    ctx.translate((1 - ease) * -W * 0.6, y)
    ctx.transform(1, 0, -0.18, 1, 0, 0)
    const g = ctx.createLinearGradient(0, 0, W, 0)
    g.addColorStop(0, 'rgba(10,14,40,0)'); g.addColorStop(0.15, 'rgba(10,14,40,0.88)'); g.addColorStop(0.85, 'rgba(10,14,40,0.88)'); g.addColorStop(1, 'rgba(10,14,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, -bh / 2, W * 1.2, bh)
    const gl = ctx.createLinearGradient(0, 0, W, 0)
    gl.addColorStop(0, 'rgba(255,200,60,0)'); gl.addColorStop(0.3, '#ffd23f'); gl.addColorStop(0.7, '#ff8a1f'); gl.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = gl
    ctx.fillRect(0, -bh / 2 - 4, W * 1.2, 4); ctx.fillRect(0, bh / 2, W * 1.2, 4)
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, 0, 0.18, 1, 0, 0])))
    ctx.font = `900 ${Math.round(bh * 0.5)}px "LineBold", "Kanit", system-ui, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = 6; ctx.strokeStyle = '#1a0f00'; ctx.lineJoin = 'round'
    ctx.strokeText(c.banner, W / 2, 2)
    const tg = ctx.createLinearGradient(0, -bh / 3, 0, bh / 3)
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#ffe58a'); tg.addColorStop(1, '#ffb52e')
    ctx.fillStyle = tg
    ctx.fillText(c.banner, W / 2, 2)
    ctx.restore()
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, scene: Scene, a: Actor, t: number) {
  const st = assets.statusOf(a.assetId)
  const p = actorPos(scene, a, t)
  const isRanger = scene.assets.find(d => d.id === a.assetId)?.type === 'ranger'
  const cy = isRanger ? p.y - 70 * a.scale : p.y
  ctx.save()
  if (st?.state === 'error') {
    ctx.fillStyle = 'rgba(255,60,80,0.85)'
    ctx.font = '600 14px system-ui'; ctx.textAlign = 'center'
    ctx.fillText('! ' + (st.error.length > 40 ? st.error.slice(0, 40) + '…' : st.error), p.x, cy)
  } else {
    const ang = (performance.now() / 160) % (Math.PI * 2)
    ctx.strokeStyle = 'rgba(120,220,255,0.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(p.x, cy, 18, ang, ang + Math.PI * 1.3); ctx.stroke()
  }
  ctx.restore()
}

// ====================================================
export function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, t: number, opts: RenderOptions): Timeline {
  const tl = opts.timeline ?? buildTimeline(scene)
  usedVideos.clear()
  const W = scene.width, H = scene.height
  const cam = cameraAt(scene, t)

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  // กล้อง
  ctx.translate(W / 2, H / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.cx, -cam.cy)

  drawBackground(ctx, scene, t, opts)

  if (opts.guides) {
    ctx.save()
    ctx.strokeStyle = 'rgba(90,220,255,0.35)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-W, scene.groundY); ctx.lineTo(W * 2, scene.groundY); ctx.stroke()
    ctx.restore()
  }

  // ลำดับวาด: ตามลำดับเลเยอร์ · เปิด depthSort = เรนเจอร์สลับกันเองตามแกน Y (ช่องของ media คงเดิม)
  const order = scene.actors.filter(a => a.visible)
  if (scene.depthSort) {
    const isR = (a: Actor) => scene.assets.find(d => d.id === a.assetId)?.type === 'ranger'
    const slots = order.map((a, i) => (isR(a) ? i : -1)).filter(i => i >= 0)
    const sorted = slots.map(i => order[i]).sort((p, q) => actorPos(scene, p, t).y - actorPos(scene, q, t).y)
    slots.forEach((slot, k) => { order[slot] = sorted[k] })
  }

  for (const a of order) {
    const vis = visibility(scene, a, t)
    if (!vis || vis.alpha <= 0) continue
    const rt = assets.get(a.assetId)
    if (!rt) { drawPlaceholder(ctx, scene, a, t); continue }
    if (rt.kind === 'ranger') drawRanger(ctx, scene, tl, a, rt, t, vis.alpha, opts.hoverPart)
    else drawMedia(ctx, a, t, vis.localStart, vis.alpha, opts)
  }
  drawSkillFx(ctx, scene, tl, t)
  drawRanges(ctx, scene, t, order)
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  drawOverlays(ctx, scene, t)
  drawInfoCards(ctx, scene, t)
  ctx.restore()

  assets.pauseVideosExcept(usedVideos)
  return tl
}

/** กรอบของ actor ณ เวลา t (พิกัดเวที) — ใช้คลิกเลือก/ลาก */
export function actorBounds(scene: Scene, a: Actor, t: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const rt = assets.get(a.assetId)
  const p = actorPos(scene, a, t)
  if (!rt) return { x0: p.x - 30, y0: p.y - 90, x1: p.x + 30, y1: p.y }
  if (rt.kind === 'audio') return null
  if (rt.kind === 'ranger') {
    const s = a.scale, b = rt.box
    const xs = a.flip ? [-b.x1 * s, -b.x0 * s] : [b.x0 * s, b.x1 * s]
    return { x0: p.x + xs[0], x1: p.x + xs[1], y0: p.y + b.y0 * s, y1: p.y + b.y1 * s }
  }
  const w = rt.w * a.scale / 2, h = rt.h * a.scale / 2
  return { x0: a.x - w, x1: a.x + w, y0: a.y - h, y1: a.y + h }
}
