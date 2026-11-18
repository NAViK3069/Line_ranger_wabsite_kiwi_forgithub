// ====================================================
// StageView.tsx — เวที: วาดฉากด้วย canvas + ชั้น SVG สำหรับคลิกเลือก/ลากจัดตำแหน่ง
//   • ลาก actor = ย้ายจุดยืน (ใกล้เส้นพื้นจะดูดติด)
//   • เลือกคิวสกิล = ลากจุดปล่อย / จุดกระทบ / จุดร่าย ได้
//   • เลือกคิวเดิน = ลากปลายทาง · เลือกคิวกล้อง = ลากกรอบกล้อง
// ====================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { assets, isAudioName } from '@/anme/engine/assets'
import { addUploadedRanger, loadDemo, patchActor, patchCue, patchSkill, uploadAudio, uploadMedia } from '@/anme/engine/actions'
import { actorBounds, renderScene } from '@/anme/engine/render'
import { checkpoint, getState, select, useStore } from '@/anme/engine/store'
import {
  actorHitPoint, actorPos, approachPlan, arcHeight, arcPos, buildTimeline, cameraAt, facing, fxFinishPoint, fxImpactPoint,
  fxLaunchPoint, moveFrom, visibility, type Timeline,
} from '@/anme/engine/timeline'
import { L } from '@/anme/engine/i18n'
import type { CameraCue, MoveCue, Scene, SkillCue, Vec } from '@/anme/engine/types'
import { Icon } from './widgets'

// timeline แคชตาม (ฉาก, เวอร์ชัน asset) — ใช้ร่วมกันทั้งเวทีและไทม์ไลน์
let tlCache: { scene: Scene; ver: number; tl: Timeline } | null = null
export function timelineOf(scene: Scene): Timeline {
  if (!tlCache || tlCache.scene !== scene || tlCache.ver !== assets.version) tlCache = { scene, ver: assets.version, tl: buildTimeline(scene) }
  return tlCache.tl
}

export function useAssetsVersion() {
  const [v, setV] = useState(assets.version)
  useEffect(() => assets.subscribe(() => setV(assets.version)), [])
  return v
}

export function StageView() {
  const scene = useStore(s => s.scene)
  const time = useStore(s => s.time)
  const sel = useStore(s => s.sel)
  const playing = useStore(s => s.playing)
  useStore(s => s.lang)
  useAssetsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [box, setBox] = useState({ w: 800, h: 450 })
  const [dragOver, setDragOver] = useState(false)
  const W = scene.width, H = scene.height
  const k = Math.max(0.05, Math.min((box.w - 24) / W, (box.h - 24) / H))

  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // วงวาด — อ่าน state ล่าสุดทุกเฟรม (ไม่ผูกกับ React render)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const st = getState()
      if (st.busy?.startsWith('export')) return
      const cv = canvasRef.current
      if (!cv) return
      const ctx = cv.getContext('2d')!
      const sc = st.scene
      const kk = cv.width / sc.width
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.setTransform(kk, 0, 0, kk, 0, 0)
      renderScene(ctx, sc, st.time, { playing: st.playing, timeline: timelineOf(sc), guides: st.guides && !st.playing, forceMute: st.muted, hoverPart: st.playing ? null : st.hoverPart })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cssW = Math.round(W * k), cssH = Math.round(H * k)

  const cam = cameraAt(scene, time)
  const camT = `translate(${W / 2} ${H / 2}) scale(${cam.zoom}) translate(${-cam.cx} ${-cam.cy})`
  const px = 1 / (k * cam.zoom)       // 1 พิกเซลจอ เป็นหน่วยเวที

  const toWorld = (e: { clientX: number; clientY: number }, c = cam): Vec => {
    const r = svgRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W
    const sy = ((e.clientY - r.top) / r.height) * H
    return { x: (sx - W / 2) / c.zoom + c.cx, y: (sy - H / 2) / c.zoom + c.cy }
  }

  /** ลากทั่วไป: onMove ได้ค่าเลื่อน (หน่วยเวที) */
  const drag = (e: React.PointerEvent, onMove: (d: Vec, w: Vec, ev: PointerEvent) => void) => {
    e.stopPropagation(); e.preventDefault()
    const c0 = cam
    const p0 = toWorld(e, c0)
    let started = false
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev, c0)
      const d = { x: p.x - p0.x, y: p.y - p0.y }
      if (!started) { if (Math.hypot(d.x, d.y) < 2 * px) return; checkpoint(); started = true }
      onMove(d, p, ev)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const snapY = (y: number, isRanger: boolean, ev: PointerEvent) =>
    isRanger && !ev.altKey && Math.abs(y - scene.groundY) < 12 * px ? scene.groundY : Math.round(y)

  const onActorDown = (e: React.PointerEvent, id: string) => {
    select({ kind: 'actor', id })
    const a = scene.actors.find(x => x.id === id)!
    if (a.locked) return
    const isRanger = assets.get(a.assetId)?.kind === 'ranger'
    const x0 = a.x, y0 = a.y
    drag(e, (d, _w, ev) => patchActor(id, { x: Math.round(x0 + d.x), y: snapY(y0 + d.y, isRanger, ev) }, false))
  }

  const selCue = sel.kind === 'cue' ? scene.cues.find(c => c.id === sel.id) : undefined
  const selActorId = sel.kind === 'actor' ? sel.id : selCue && selCue.actorId
  const tl = timelineOf(scene)

  // ── ไฟล์ลากมาวาง ──
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = [...e.dataTransfer.files]
    if (!files.length) return
    if (files.some(f => /\.sam$/i.test(f.name))) { addUploadedRanger(files); return }
    const audio = files.filter(f => f.type.startsWith('audio/') || isAudioName(f.name))
    if (audio.length) uploadAudio(audio)
    if (audio.length === files.length) return
    uploadMedia(files.filter(f => /^(image|video)\//.test(f.type) || /\.(gif|webp|png|jpe?g|mp4|webm|mov|apng)$/i.test(f.name)))
  }

  const empty = scene.actors.length === 0

  return (
    <div className={'stage-wrap' + (dragOver ? ' drag-over' : '')} ref={wrapRef}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPointerDown={() => select({ kind: 'none' })}
    >
      <div className="stage" style={{ width: cssW, height: cssH }}>
        <canvas ref={canvasRef} width={Math.round(W * k * dpr)} height={Math.round(H * k * dpr)} style={{ width: cssW, height: cssH }} />
        <svg ref={svgRef} className="stage-svg" viewBox={`0 0 ${W} ${H}`} width={cssW} height={cssH}>
          <g transform={camT}>
            {scene.actors.map(a => {
              if (!a.visible || !visibility(scene, a, time)) return null
              const b = actorBounds(scene, a, time)
              if (!b) return null
              const selected = a.id === selActorId
              const p = actorPos(scene, a, time)
              const isR = assets.get(a.assetId)?.kind === 'ranger'
              return (
                <g key={a.id} className={'actor-hit' + (selected ? ' sel' : '') + ' tag-' + a.tag}>
                  <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} rx={6 * px}
                    onPointerDown={e => onActorDown(e, a.id)} style={{ cursor: a.locked ? 'default' : 'move' }}
                    strokeWidth={(selected ? 2 : 1.2) * px} />
                  {selected && !playing && <>
                    {isR && <ellipse cx={p.x} cy={p.y} rx={10 * px} ry={4 * px} className="foot" strokeWidth={1.5 * px} />}
                    <text x={b.x0} y={b.y0 - 6 * px} fontSize={12 * px} className="actor-label">{a.name}{a.locked ? L(' (ล็อก)', ' (locked)') : ''}</text>
                  </>}
                </g>
              )
            })}
            {!playing && selCue?.type === 'skill' && <SkillHandles scene={scene} cue={selCue} tl={tl} px={px} drag={drag} />}
            {!playing && selCue?.type === 'move' && <MoveHandles scene={scene} cue={selCue} px={px} drag={drag} snapY={snapY} />}
            {!playing && selCue?.type === 'camera' && <CameraHandles scene={scene} cue={selCue} px={px} drag={drag} />}
          </g>
        </svg>
        {empty && (
          <div className="stage-empty" onPointerDown={e => e.stopPropagation()}>
            <div className="stage-empty-card">
              <div className="glow-title">LINE RANGERS · ANIMATION STUDIO</div>
              <p>{L('พิมพ์ ID เรนเจอร์หรือชื่อในแถบซ้าย · ลากไฟล์ .sam/.plist/.png, ภาพ, GIF, WebP, วิดีโอ หรือเสียงมาวางที่นี่', 'Type a ranger ID or name on the left · drop .sam/.plist/.png, images, GIF, WebP, video or audio here')}</p>
              <button className="btn primary big" onClick={() => loadDemo()}><Icon name="sparkle" /> {L('เปิดฉากตัวอย่าง', 'Open demo scene')}</button>
            </div>
          </div>
        )}
        {dragOver && <div className="drop-hint"><Icon name="upload" size={40} /><span>{L('วางไฟล์เพื่ออัปโหลด', 'Drop files to upload')}</span></div>}
      </div>
    </div>
  )
}

type DragFn = (e: React.PointerEvent, onMove: (d: Vec, w: Vec, ev: PointerEvent) => void) => void

function Handle({ p, px, color, label, onDown, shape = 'circle' }: { p: Vec; px: number; color: string; label: string; onDown: (e: React.PointerEvent) => void; shape?: 'circle' | 'diamond' | 'square' }) {
  const r = 9 * px
  return (
    <g className="handle" onPointerDown={onDown} style={{ ['--hc' as string]: color }}>
      <circle cx={p.x} cy={p.y} r={r * 2.2} className="handle-halo" />
      {shape === 'circle' && <circle cx={p.x} cy={p.y} r={r} strokeWidth={2.5 * px} />}
      {shape === 'diamond' && <path d={`M${p.x} ${p.y - r * 1.3}L${p.x + r * 1.3} ${p.y}L${p.x} ${p.y + r * 1.3}L${p.x - r * 1.3} ${p.y}Z`} strokeWidth={2.5 * px} />}
      {shape === 'square' && <rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={3 * px} strokeWidth={2.5 * px} />}
      <path d={`M${p.x - r * 0.5} ${p.y}H${p.x + r * 0.5}M${p.x} ${p.y - r * 0.5}V${p.y + r * 0.5}`} strokeWidth={1.6 * px} className="handle-cross" />
      <text x={p.x + r * 1.6} y={p.y - r * 1.2} fontSize={12 * px} className="handle-label">{label}</text>
    </g>
  )
}

function SkillHandles({ scene, cue, tl, px, drag }: { scene: Scene; cue: SkillCue; tl: Timeline; px: number; drag: DragFn }) {
  const caster = scene.actors.find(a => a.id === cue.actorId)
  const target = scene.actors.find(a => a.id === cue.targetId)
  const st = tl.skill.get(cue.id)
  const fx = cue.fx
  const t0 = st?.shots[0]?.launchAt ?? st?.launchAt ?? cue.start
  const path = useMemo(() => {
    if (!fx || !caster || fx.mode !== 'projectile') return null
    const a = fxLaunchPoint(scene, cue, caster, t0), b = fxImpactPoint(scene, cue, t0)
    const h = arcHeight(cue, st?.bullet ?? null, a, b)
    const pts: string[] = []
    for (let i = 0; i <= 32; i++) { const q = arcPos(a, b, i / 32, h); pts.push(`${q.x},${q.y}`) }
    return pts.join(' ')
  }, [scene, cue, caster, fx, t0, st])
  if (!caster) return null
  const cp = actorPos(scene, caster, t0)
  const dir = caster.flip ? -1 : 1
  const els: JSX.Element[] = []
  if (target) {
    const h = actorHitPoint(scene, target, t0)
    els.push(<g key="tgt" className="target-ring"><circle cx={h.x} cy={h.y} r={26 * px} strokeWidth={2 * px} /><circle cx={h.x} cy={h.y} r={6 * px} strokeWidth={2 * px} /></g>)
  }
  // เดินเข้าหาเป้า: เส้นทาง + จุดหยุด (ลากได้)
  const ap = approachPlan(scene, cue)
  if (ap && target) {
    els.push(<line key="apl" x1={ap.from.x} y1={ap.from.y} x2={ap.stop.x} y2={ap.stop.y} className="approach-path" strokeWidth={2.5 * px} strokeDasharray={`${10 * px} ${7 * px}`} />)
    els.push(<Handle key="stop" p={ap.stop} px={px} color="#ff9d3d" shape="square" label={L('จุดหยุดก่อนตี', 'Stop point')} onDown={e => {
      const s0 = { ...cue.approach.stopOffset }
      const f = facing(caster)
      drag(e, d => patchSkill(cue.id, c => { c.approach.stopOffset = { x: Math.round(s0.x + d.x * f), y: Math.round(s0.y + d.y) } }, false))
    }} />)
  }
  if (!fx) return <g>{els}</g>
  if (path) els.push(<polyline key="path" points={path} className="fx-path" strokeWidth={2 * px} strokeDasharray={`${8 * px} ${6 * px}`} />)
  if (fx.mode === 'projectile' || fx.mode === 'caster') {
    const lp = fxLaunchPoint(scene, cue, caster, t0)
    els.push(<line key="ll" x1={cp.x} y1={cp.y} x2={lp.x} y2={lp.y} className="fx-link" strokeWidth={1.2 * px} />)
    els.push(<Handle key="launch" p={lp} px={px} color="#33e1ff" label={fx.mode === 'caster' ? L('จุดเกิดเอฟเฟกต์', 'Effect point') : L('จุดปล่อย', 'Muzzle')} onDown={e => {
      const l0 = { ...fx.launch }
      drag(e, d => patchSkill(cue.id, c => { c.fx!.launch = { x: Math.round(l0.x + d.x / (caster.scale * dir)), y: Math.round(l0.y + d.y / caster.scale) } }, false))
    }} />)
  }
  if ((fx.mode === 'projectile' || fx.mode === 'target') && target) {
    const ip = fxImpactPoint(scene, cue, t0)
    els.push(<Handle key="impact" p={ip} px={px} color="#ff4fd8" shape="diamond" label={fx.mode === 'target' ? L('จุดเกิดเอฟเฟกต์', 'Effect point') : L('จุดกระทบ', 'Impact')} onDown={e => {
      const i0 = { ...fx.impact }
      drag(e, d => patchSkill(cue.id, c => { c.fx!.impact = { x: Math.round(i0.x + d.x), y: Math.round(i0.y + d.y) } }, false))
    }} />)
    if (fx.finishSplit) {
      const fp = fxFinishPoint(scene, cue, t0)
      els.push(<line key="fl" x1={ip.x} y1={ip.y} x2={fp.x} y2={fp.y} className="fx-link burst" strokeWidth={1.2 * px} />)
      els.push(<Handle key="finish" p={fp} px={px} color="#b47cff" shape="diamond" label={L('จุดระเบิด', 'Burst')} onDown={e => {
        const f0 = { ...fx.finishOffset }
        drag(e, d => patchSkill(cue.id, c => { c.fx!.finishOffset = { x: Math.round(f0.x + d.x), y: Math.round(f0.y + d.y) } }, false))
      }} />)
    }
  }
  if (fx.mode === 'point') {
    els.push(<Handle key="point" p={fx.point} px={px} color="#ffc93d" shape="square" label={L('ตำแหน่งร่ายสกิล', 'Cast point')} onDown={e => {
      const p0 = { ...fx.point }
      drag(e, d => patchSkill(cue.id, c => { c.fx!.point = { x: Math.round(p0.x + d.x), y: Math.round(p0.y + d.y) } }, false))
    }} />)
  }
  return <g>{els}</g>
}

function MoveHandles({ scene, cue, px, drag, snapY }: { scene: Scene; cue: MoveCue; px: number; drag: DragFn; snapY: (y: number, r: boolean, ev: PointerEvent) => number }) {
  const from = moveFrom(scene, cue)
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={cue.to.x} y2={cue.to.y} className="move-path" strokeWidth={2.5 * px} strokeDasharray={`${10 * px} ${7 * px}`} />
      <circle cx={from.x} cy={from.y} r={5 * px} className="move-from" />
      <Handle p={cue.to} px={px} color="#3fd68f" label={L('ปลายทาง', 'Destination')} onDown={e => {
        const t0 = { ...cue.to }
        drag(e, (d, _w, ev) => patchCue<MoveCue>(cue.id, c => { c.to = { x: Math.round(t0.x + d.x), y: snapY(t0.y + d.y, true, ev) } }, false))
      }} />
    </g>
  )
}

function CameraHandles({ scene, cue, px, drag }: { scene: Scene; cue: CameraCue; px: number; drag: DragFn }) {
  const w = scene.width / cue.zoom, h = scene.height / cue.zoom
  return (
    <g className="cam-frame">
      <rect x={cue.center.x - w / 2} y={cue.center.y - h / 2} width={w} height={h} strokeWidth={2 * px} strokeDasharray={`${12 * px} ${6 * px}`}
        onPointerDown={e => {
          const c0 = { ...cue.center }
          drag(e, d => patchCue<CameraCue>(cue.id, c => { c.center = { x: Math.round(c0.x + d.x), y: Math.round(c0.y + d.y) } }, false))
        }} />
      <text x={cue.center.x - w / 2 + 8 * px} y={cue.center.y - h / 2 + 18 * px} fontSize={13 * px} className="handle-label">{L('กล้อง', 'Camera')} ×{cue.zoom.toFixed(2)}</text>
    </g>
  )
}
