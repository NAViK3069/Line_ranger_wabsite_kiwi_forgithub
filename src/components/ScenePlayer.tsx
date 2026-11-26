'use client'

// ====================================================
// ScenePlayer — เล่นฉากของ Video Studio (.anme.json) แบบดูอย่างเดียว (ไม่มีตัวแก้ไข)
// ใช้ในหน้า /gear-options (วิดีโอสอนออพชั่นเกียร์) — วาดสดลง canvas ด้วย engine ตัวเดียวกับสตูดิโอ
// จึงไม่ต้องอัดเป็นไฟล์ MP4 (ไฟล์ฉากเล็กแค่ ~10KB · ภาพ/เสียงเรนเจอร์โหลดผ่าน Worker และแคชที่ edge อยู่แล้ว)
//
//   • ไม่ import store.ts ของสตูดิโอ (นั่นคือสถานะของตัวแก้ไข + autosave) — ถือเวลา/สถานะเล่นเองในคอมโพเนนต์นี้
//   • การ์ดคำอธิบายสกิล (ที่ไม่ได้แก้ข้อความเอง) แปลตามภาษาของเว็บ เหมือนในสตูดิโอ
//   • ระดับเสียง = ปุ่มเสียงของทั้งเว็บ (SoundContext)
//   • หยุดแล้วไม่วาดซ้ำทุกเฟรม — วาดใหม่เฉพาะตอนเล่น / ลากแถบเวลา / ภาพเพิ่งโหลดเสร็จ / ขนาดจอเปลี่ยน
// ====================================================

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import { assets } from '@/anme/engine/assets'
import { audioPlayer } from '@/anme/engine/audio'
import { applyLang } from '@/anme/engine/i18n'
import { renderScene } from '@/anme/engine/render'
import { normalizeScene } from '@/anme/engine/scene'
import { buildSkillCard } from '@/anme/engine/skillCard'
import { actorPos, buildTimeline, cameraAt, sceneEnd, type Timeline } from '@/anme/engine/timeline'
import type { AppState } from '@/anme/engine/store'
import type { InfoCue, Scene, Vec } from '@/anme/engine/types'

interface Props {
  /** URL ของไฟล์ฉาก เช่น /gear-options/scenes/sample.anme.json */
  src: string
  /** โหลดเสร็จแล้วเล่นเลย (ต้องมีการกดอะไรในหน้าก่อนแล้ว ไม่งั้นเบราว์เซอร์ไม่ให้เปิดเสียง) */
  autoPlay?: boolean
  /** ถึงท้ายฉากแล้วเริ่มใหม่ */
  loop?: boolean
  /**
   * ชั้นภาพซ้อนบนวิดีโอ (การ์ดข้อมูล ตัวเลขดาเมจ ฯลฯ) — เรียกใหม่ทุกเฟรมด้วยเวลาปัจจุบัน
   * ต้องคำนวณทุกอย่างจาก ctx.t (ไม่ใช้ CSS transition) → ลากแถบเวลา/เล่นซ้ำแล้วได้ภาพเดิมเป๊ะ
   * พิกัดในชั้นนี้ = พิกเซลของเวที (เช่น 1280×720) — ย่อขยายตามขนาดจอให้เอง
   */
  overlay?: (ctx: OverlayCtx) => ReactNode
  /** วาดลง canvas ของฉากเอง: under = ใต้ตัวแสดง · over = ทับตัวแสดง (พิกัดโลก) — เช่น วงแสงที่พื้นรอบเรนเจอร์ */
  canvasLayers?: CanvasLayers
  /** ความเร็วการเล่น ณ เวลาฉาก t (ไม่ใส่ = 1) — เช่น เร่ง ×2 เฉพาะช่วงแข่งยิง · ภาพ/เสียง/ชั้นซ้อนยังคิดจากเวลาฉากเหมือนเดิม */
  rateAt?: (t: number) => number
}

/** ข้อมูลที่ชั้นวาดบน canvas ใช้ — เหมือน OverlayCtx แต่พิกัดเป็นพิกัดโลก (canvas คิดกล้องให้แล้ว) */
export interface CanvasFxCtx {
  t: number
  scene: Scene
  tl: Timeline
  /** ตำแหน่งเท้าของตัวแสดง ณ เวลานี้ (พิกัดโลก) */
  actorAt: (actorId: string) => Vec | null
  /** เวลาที่การโจมตีของคิวนี้โดนเป้าหมาย (วินาที) */
  hitsOf: (cueId: string) => number[]
}
export interface CanvasLayers {
  under?: (ctx: CanvasRenderingContext2D, c: CanvasFxCtx) => void
  over?: (ctx: CanvasRenderingContext2D, c: CanvasFxCtx) => void
}

export interface OverlayCtx {
  t: number
  scene: Scene
  tl: Timeline
  /** จุดในฉาก (พิกัดโลก) → ตำแหน่งบนจอในชั้นซ้อน หลังคิดกล้องแล้ว */
  project: (p: Vec) => Vec
  /** ตำแหน่งเท้าของตัวแสดง ณ เวลานี้ (พิกัดโลก) */
  actorAt: (actorId: string) => Vec | null
  /** เวลาที่การโจมตีของคิวนี้โดนเป้าหมาย (วินาที) */
  hitsOf: (cueId: string) => number[]
}

/** เวลาปัจจุบันแบบ subscribe ได้ — ให้ชั้นซ้อน render ทุกเฟรมโดยไม่ทำให้ทั้ง ScenePlayer render ตาม */
function createClock() {
  let t = 0
  const subs = new Set<() => void>()
  return {
    get: () => t,
    set(v: number) { if (v !== t) { t = v; subs.forEach(f => f()) } },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
  }
}
type Clock = ReturnType<typeof createClock>

function OverlayLayer({ clock, scene, tl, render, boxW }: { clock: Clock; scene: Scene; tl: Timeline; render: (c: OverlayCtx) => ReactNode; boxW: number }) {
  const t = useSyncExternalStore(clock.subscribe, clock.get, clock.get)
  const cam = cameraAt(scene, t)
  const W = scene.width, H = scene.height
  const ctx: OverlayCtx = {
    t, scene, tl,
    project: p => ({ x: (p.x - cam.cx) * cam.zoom + W / 2, y: (p.y - cam.cy) * cam.zoom + H / 2 }),
    actorAt: id => { const a = scene.actors.find(x => x.id === id); return a ? actorPos(scene, a, t) : null },
    hitsOf: id => tl.hits.filter(h => h.cue.id === id).map(h => h.at),
  }
  return (
    <div className="absolute left-0 top-0 pointer-events-none overflow-hidden"
      style={{ width: W, height: H, transform: `scale(${boxW / W})`, transformOrigin: '0 0' }}>
      {render(ctx)}
    </div>
  )
}

function useAssetsVersion() {
  const [v, setV] = useState(assets.version)
  useEffect(() => assets.subscribe(() => setV(assets.version)), [])
  return v
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** ทุกอย่างที่ฉากต้องใช้โหลดเสร็จหรือยัง (เรนเจอร์ เสียง รูป + ฉากหลังจากด่าน) */
function sceneReady(scene: Scene): boolean {
  for (const d of scene.assets) {
    const st = assets.statusOf(d.id)?.state
    if (!st || st === 'loading') return false
  }
  const bg = scene.background
  if (bg.kind === 'stage' && bg.stage) return !!assets.stage(bg.stage) || assets.stageFailed(bg.stage)
  return true
}

/** ไอคอนเล่น/หยุดที่เด้งขึ้นกลางจอแป๊บเดียวแล้วจางหาย (key ใหม่ = เล่นใหม่) */
function FlashIcon({ icon }: { icon: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.animate(
      [{ opacity: 0.95, transform: 'scale(0.85)' }, { opacity: 0.9, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.25)' }],
      { duration: 650, easing: 'ease-out', fill: 'forwards' },
    )
  }, [])
  return (
    <div ref={ref} className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 border border-white/30 flex items-center justify-center pointer-events-none" style={{ opacity: 0 }}>
      <span className="material-icons-round text-white text-4xl">{icon}</span>
    </div>
  )
}

export default function ScenePlayer({ src, autoPlay = false, loop = true, overlay, canvasLayers, rateAt }: Props) {
  const layersRef = useRef(canvasLayers)
  layersRef.current = canvasLayers
  const rateRef = useRef(rateAt)
  rateRef.current = rateAt
  const { lang, tSkill, tSkillDesc } = useLanguage()
  const { volume } = useSound()
  const version = useAssetsVersion()

  const [raw, setRaw] = useState<Scene | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [shownTime, setShownTime] = useState(0)
  const [boxW, setBoxW] = useState(0)
  const clock = useMemo(createClock, [])

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const dirtyRef = useRef(true)
  /** กำลังลากแถบเวลาอยู่ → หยุดเดินเวลา + ปิดเสียงไว้ จนกว่าจะปล่อย (ไม่งั้นภาพวิ่งหนีนิ้ว) */
  const scrubRef = useRef(false)
  const live = useRef({ playing, volume, loop })
  live.current = { playing, volume, loop }

  // ── โหลดไฟล์ฉาก ──
  useEffect(() => {
    let alive = true
    setRaw(null); setScene(null); setError(''); setPlaying(false)
    timeRef.current = 0; setShownTime(0)
    fetch(src)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => { if (alive) setRaw(normalizeScene(j)) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [src])

  // ── โหลดเรนเจอร์/เสียงของฉาก (asset store ใช้ร่วมกับสตูดิโอ — ตัวที่โหลดแล้วไม่โหลดซ้ำ) ──
  useEffect(() => { if (raw) assets.sync(raw.assets) }, [raw])

  // ── การ์ดคำอธิบายสกิลตามภาษาของเว็บ (ข้อความที่ผู้สร้างฉากแก้เอง = คงไว้) ──
  useEffect(() => {
    if (!raw) return
    let alive = true
    applyLang(lang === 'th' ? 'th' : 'en')   // ข้อความตายตัวบนการ์ด (ร่าย / CD …) ใช้ภาษานี้
    setScene(raw)
    ;(async () => {
      const cues = await Promise.all(raw.cues.map(async c => {
        if (c.type !== 'info' || (c as InfoCue).card.edited) return c
        const a = raw.actors.find(x => x.id === c.actorId)
        const def = a && raw.assets.find(d => d.id === a.assetId)
        const id = def?.type === 'ranger' && def.source === 'lerico' ? def.rangerId : null
        if (!id) return c
        try {
          const card = await buildSkillCard(id, (c as InfoCue).slot, tSkill, tSkillDesc)
          return card.name ? { ...c, card } : c
        } catch { return c }
      }))
      if (alive) setScene({ ...raw, cues })
    })()
    return () => { alive = false }
  }, [raw, lang, tSkill, tSkillDesc])

  const ready = !!scene && sceneReady(scene)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tl = useMemo(() => (scene ? buildTimeline(scene) : null), [scene, version])
  const end = scene && tl ? Math.max(0.5, Math.min(scene.duration, sceneEnd(scene, tl) + 0.6)) : 0

  // ── เล่นเองเมื่อพร้อม ──
  useEffect(() => { if (ready && autoPlay) setPlaying(true) }, [ready, autoPlay])

  // ── ขนาด canvas ตามกล่อง (คมชัดตาม DPR สูงสุด 2) ──
  useEffect(() => {
    const el = wrapRef.current, cv = canvasRef.current
    if (!el || !cv || !scene) return
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = el.clientWidth
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(w * (scene.height / scene.width) * dpr)
      setBoxW(w)
      dirtyRef.current = true
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scene])

  // อะไรเปลี่ยน (โหลดภาพเสร็จ / ฉากใหม่ / ภาษา) → วาดใหม่ 1 ครั้งแม้หยุดอยู่
  useEffect(() => { dirtyRef.current = true }, [scene, version])

  // ── วงเล่น ──
  useEffect(() => {
    if (!scene || !tl) return
    let raf = 0
    let last = performance.now()
    let lastShown = -1
    const audioState = (p: boolean) => ({
      // rate = ความเร็วภาพตอนนี้ (rateAt) → เสียงเริ่มตรงจังหวะภาพที่เร่ง · keepPitch ให้ตัวเสียงเล่นความเร็วปกติจนจบ
      scene, time: timeRef.current, playing: p, rate: rateRef.current?.(timeRef.current) ?? 1, busy: null,
      muted: live.current.volume <= 0, volume: live.current.volume,
    }) as unknown as AppState

    const loopFn = (now: number) => {
      raf = requestAnimationFrame(loopFn)
      // จำกัดช่วงกระโดดต่อเฟรม (กลับมาจากแท็บอื่นไม่ให้วิดีโอข้ามไปไกล) แต่ยังให้เครื่องช้า (~4 fps) เล่นทันเวลาจริง
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const { loop: lp } = live.current
      const p = live.current.playing && !scrubRef.current
      if (p) {
        let t = timeRef.current + dt * (rateRef.current?.(timeRef.current) ?? 1)
        if (t >= end) {
          if (lp) t = 0
          else { t = end; setPlaying(false) }
        }
        timeRef.current = t
        dirtyRef.current = true
      }
      audioPlayer.update(audioState(p), tl, { keepPitch: true })
      if (!dirtyRef.current) return
      dirtyRef.current = false
      const cv = canvasRef.current
      const ctx = cv?.getContext('2d')
      if (!cv || !ctx) return
      const k = cv.width / scene.width
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.setTransform(k, 0, 0, k, 0, 0)
      const L = layersRef.current
      const tNow = timeRef.current
      const fx: CanvasFxCtx | null = L ? {
        t: tNow, scene, tl,
        actorAt: id => { const a = scene.actors.find(x => x.id === id); return a ? actorPos(scene, a, tNow) : null },
        hitsOf: id => tl.hits.filter(h => h.cue.id === id).map(h => h.at),
      } : null
      renderScene(ctx, scene, tNow, {
        playing: p, timeline: tl,
        beforeActors: L?.under && fx ? c2 => L.under!(c2, fx) : undefined,
        afterActors: L?.over && fx ? c2 => L.over!(c2, fx) : undefined,
      })
      clock.set(timeRef.current)   // ชั้นซ้อน (การ์ด/ตัวเลข) ขยับตามเฟรมเดียวกับภาพ
      // ตัวเลขเวลาบนแถบ — อัปเดตทุก ~0.1 วิ ไม่ต้อง render React ทุกเฟรม
      const shown = Math.floor(timeRef.current * 10)
      if (shown !== lastShown) { lastShown = shown; setShownTime(timeRef.current) }
    }
    raf = requestAnimationFrame(loopFn)
    return () => {
      cancelAnimationFrame(raf)
      audioPlayer.update(audioState(false), tl)   // หยุดเสียงที่ค้าง
    }
  }, [scene, tl, end, clock])

  const seek =(t: number) => { timeRef.current = Math.max(0, Math.min(end, t)); dirtyRef.current = true; setShownTime(timeRef.current) }

  // จับ/ปล่อยแถบเวลา — ปล่อยนอกแถบก็นับ (ฟังที่ window) · ปล่อยแล้วเล่นต่อจากจุดนั้นถ้าเดิมเล่นอยู่
  const startScrub = () => {
    if (scrubRef.current) return
    scrubRef.current = true
    const release = () => {
      scrubRef.current = false
      dirtyRef.current = true
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }
  const toggle = () => {
    if (!ready) return
    if (!playing && timeRef.current >= end - 0.05) seek(0)
    setFlash(f => ({ icon: playing ? 'pause' : 'play_arrow', n: f.n + 1 }))
    setHover(false)
    setPlaying(p => !p)
  }

  // ── ไอคอนกลางจอ ──
  //   ยังไม่เคยเล่น / เล่นจบ → ปุ่มเล่นค้างไว้ (ต้องมีให้กด)
  //   กดหยุด/เล่นต่อ → ไอคอนเด้งขึ้นแป๊บเดียวแล้วจางหาย (แบบ YouTube)
  //   หยุดอยู่ + ขยับเมาส์บนวิดีโอ → ปุ่มเล่นโผล่ · เมาส์นิ่ง 1.2 วิ / ออกนอกวิดีโอ → ค่อยๆ หาย
  const started = playing || shownTime > 0.05
  const ended = shownTime >= end - 0.05 && end > 0
  const [flash, setFlash] = useState<{ icon: string; n: number }>({ icon: '', n: 0 })
  const [hover, setHover] = useState(false)
  const hoverTimer = useRef(0)
  const onPointerMove = () => {
    if (playing) return
    setHover(true)
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHover(false), 1200)
  }
  const onPointerLeave = () => { window.clearTimeout(hoverTimer.current); setHover(false) }
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const showPlay = ready && !error && !playing && (!started || ended || hover)

  return (
    <div className="w-full select-none">
      <div ref={wrapRef} className="relative w-full aspect-video bg-black rounded-xl overflow-hidden" onClick={toggle}
        onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {overlay && scene && tl && ready && boxW > 0 && (
          <OverlayLayer clock={clock} scene={scene} tl={tl} render={overlay} boxW={boxW} />
        )}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm gap-2">
            <span className="material-icons-round">error</span>โหลดวิดีโอไม่ได้ ({error})
          </div>
        ) : !ready ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm gap-2 bg-black/40">
            <span className="material-icons-round animate-spin">autorenew</span>Loading...
          </div>
        ) : (
          <>
            <button
              aria-label="Play" tabIndex={showPlay ? 0 : -1}
              className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 hover:bg-black/70 border border-white/30 flex items-center justify-center transition-[opacity,background-color] duration-300"
              style={{ opacity: showPlay ? 1 : 0, pointerEvents: showPlay ? 'auto' : 'none' }}
            >
              <span className="material-icons-round text-white text-4xl">{ended ? 'replay' : 'play_arrow'}</span>
            </button>
            {flash.n > 0 && <FlashIcon key={flash.n} icon={flash.icon} />}
          </>
        )}
      </div>

      {/* แถบควบคุม */}
      <div className="flex items-center gap-2 sm:gap-3 mt-2 px-1">
        <button onClick={toggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}
          className="w-9 h-9 shrink-0 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 flex items-center justify-center text-white">
          <span className="material-icons-round">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <button onClick={() => { seek(0); if (ready) setPlaying(true) }} disabled={!ready} aria-label="Restart"
          className="w-9 h-9 shrink-0 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 flex items-center justify-center text-white">
          <span className="material-icons-round text-[20px]">replay</span>
        </button>
        <input
          type="range" min={0} max={end || 1} step={0.01} value={Math.min(shownTime, end || 1)} disabled={!ready}
          onPointerDown={startScrub}
          onChange={e => seek(parseFloat(e.target.value))}
          className="flex-1 min-w-0 accent-cyan-400"
          aria-label="Seek"
        />
        <span className="text-xs text-gray-400 tabular-nums shrink-0">{fmt(shownTime)} / {fmt(end)}</span>
      </div>
    </div>
  )
}
