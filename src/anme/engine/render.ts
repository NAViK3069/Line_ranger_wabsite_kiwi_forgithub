// ====================================================
// render.ts — วาดฉาก ณ เวลา t ลง canvas
// ctx ต้องตั้ง transform ให้ "1 หน่วย = 1 พิกเซลเวที" มาก่อน (ฝั่งผู้เรียกจัดการขนาดจอ/DPR)
// ====================================================
import { renderSAMFrame, lerpSAMFrame } from '@/anme/lib/animation/samRenderer'
import type { SamFrame } from '@/anme/lib/animation/samParser'
import { assets, type RangerRuntime } from './assets'
import {
  BANNER_TIME, HIT_FLASH, actorPos, activePose, arcHeight, arcPos, buildTimeline, cameraAt, fxFinishPoint, fxImpactPoint,
  fxLaunchPoint, poseFrames, visibility, type Timeline,
} from './timeline'
import { clamp } from './scene'
import type { Actor, Scene, Vec } from './types'

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
    const pCx = i00 * cx + i01 * cy + i02, pCy = i10 * cx + i11 * cy + i12
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
    for (const s of st.shots) {
      if (t < s.launchAt || t >= s.endAt) continue
      let pos: Vec, rot = 0, clip: string | null, local: number, loop = false
      const flightFrames = fx.flight ? b.sam.animations[fx.flight]?.length ?? 0 : 0
      if (t < s.impactAt) {
        clip = fx.flight
        local = (t - s.launchAt) * fps
        if (fx.mode === 'projectile') {
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
        clip = fx.finish
        local = (t - s.impactAt) * fps
        pos = fxFinishPoint(scene, c, s.impactAt)
        if (fx.rotate && fx.rotateFinish && fx.mode === 'projectile') {
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
      renderSAMFrame(ctx, frame, b.sam.images, b.sprites, pos.x, pos.y, z, undefined, caster.flip, 0, rot)
      ctx.restore()
    }
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
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  drawOverlays(ctx, scene, t)
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
