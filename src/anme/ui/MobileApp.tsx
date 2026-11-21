// ====================================================
// MobileApp.tsx — หน้าตา Video Studio บนมือถือ (จอ ≤ 760px) แบบแอปตัดต่อวิดีโอบนมือถือ
//
//   ┌ แถบบน ───── ✕ ออก · ชื่อโปรเจค · ⋯ เมนู · [ส่งออก]
//   ├ พรีวิว ──── เวทีเต็มความกว้าง (แตะ ⤢ = เต็มจอ)
//   ├ แถวควบคุม ─ เวลา · ▶ · ย้อน/ทำซ้ำ · เต็มจอ
//   ├ ไทม์ไลน์ ── เส้นเวลาอยู่กลางจอ · ปัดซ้ายขวา = เลื่อนเวลา · 2 นิ้ว = ซูม · แตะบล็อก = เลือก
//   └ แถบเครื่องมือ ─ เปลี่ยนตามสิ่งที่เลือก (ไม่ได้เลือก / ตัวละคร / คิว) · แผงตั้งค่าเลื่อนขึ้นจากด้านล่าง
//
// ใช้ engine เดิมทั้งหมด (store / actions / StageView / Inspector / แท็บคลัง) — เปลี่ยนแค่การจัดวาง
// จอกว้างกว่า 760px ใช้ App แบบ 3 แผงเดิมของ ANME (ดู App.tsx)
// ====================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addCue, addSkill, deleteSelection, duplicateSelection, placeCue, prevCueEnd, resequenceCue, rippleAfter, skillPresets, uploadAudio } from '@/anme/engine/actions'
import { assets } from '@/anme/engine/assets'
import { L } from '@/anme/engine/i18n'
import { cueColor, cueLabel } from '@/anme/engine/scene'
import {
  checkpoint, getState, redo, replaceScene, select, setLang, setMuted, setState, setTime, toast, undo, updateScene, useStore,
} from '@/anme/engine/store'
import { buildTimeline, sceneEnd } from '@/anme/engine/timeline'
import type { Cue, Scene } from '@/anme/engine/types'
import { AUDIO_ID, CAMERA_ID } from '@/anme/engine/types'
import { download, exportPng } from '@/anme/engine/exporter'
import { Inspector } from './Inspector'
import { MapsTab, MediaTab, RangersTab } from './Library'
import { StageView, timelineOf, useAssetsVersion } from './StageView'
import { ExportModal, OpenModal, ResetModal, safeName, saveProject } from './TopBar'
import { Icon, ICONS } from './widgets'

type IconName = keyof typeof ICONS
type Sheet = null | 'ranger' | 'media' | 'maps' | 'edit' | 'more'
type Modal = null | 'export' | 'open' | 'reset'

const fmt = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t - m * 60), cs = Math.floor((t % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function MobileApp() {
  useStore(s => s.lang)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [full, setFull] = useState(false)
  const audioRef = useRef<HTMLInputElement>(null)

  // เพิ่มตัวละคร/สื่อสำเร็จ → ปิดแผงคลังเอง ให้เห็นบนเวทีทันที
  const actorCount = useStore(s => s.scene.actors.length)
  const prevCount = useRef(actorCount)
  useEffect(() => {
    if (actorCount > prevCount.current) setSheet(s => (s === 'ranger' || s === 'media' ? null : s))
    prevCount.current = actorCount
  }, [actorCount])

  return (
    <div className={'m-app' + (full ? ' m-full' : '')}>
      <MobileTop onMore={() => setSheet('more')} onExport={() => setModal('export')} />
      <div className="m-preview">
        <StageView pad={0} />
        {full && <button className="m-full-close" onClick={() => setFull(false)} aria-label={L('ออกจากเต็มจอ', 'Exit full screen')}><Icon name="shrink" size={20} /></button>}
      </div>
      <MobileTransport full={full} onFull={() => setFull(f => !f)} />
      <MobileTimeline onAdd={() => setSheet('ranger')} />
      <MobileToolbar open={setSheet} onAudio={() => audioRef.current?.click()} />
      <input ref={audioRef} type="file" hidden multiple accept="audio/*" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) uploadAudio(f) }} />

      {sheet && (
        <BottomSheet title={sheetTitle(sheet)} onClose={() => setSheet(null)} tall={sheet === 'ranger' || sheet === 'media' || sheet === 'maps'}>
          {sheet === 'ranger' && <div className="m-lib"><RangersTab /></div>}
          {sheet === 'media' && <div className="m-lib"><MediaTab /></div>}
          {sheet === 'maps' && <div className="m-lib"><MapsTab /></div>}
          {sheet === 'edit' && <Inspector />}
          {sheet === 'more' && <MoreMenu onModal={m => { setSheet(null); setModal(m) }} />}
        </BottomSheet>
      )}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
      {modal === 'open' && <OpenModal onClose={() => setModal(null)} />}
      {modal === 'reset' && <ResetModal onClose={() => setModal(null)} />}
    </div>
  )
}

function sheetTitle(s: Exclude<Sheet, null>): string {
  return {
    ranger: L('เพิ่มเรนเจอร์', 'Add ranger'),
    media: L('ภาพ / วิดีโอ / เสียง', 'Image / video / audio'),
    maps: L('ฉาก / พื้นหลัง', 'Stage / background'),
    edit: L('แก้ไข', 'Edit'),
    more: L('เมนู', 'Menu'),
  }[s]
}

// ── แถบบน ────────────────────────────────────────────

function MobileTop({ onMore, onExport }: { onMore: () => void; onExport: () => void }) {
  const scene = useStore(s => s.scene)
  const dirty = useStore(s => s.dirty)
  const projectName = useStore(s => s.projectName)
  return (
    <header className="m-top">
      <a className="m-icon" href="/custom" aria-label={L('ออกจากสตูดิโอ', 'Leave studio')}><Icon name="x" size={22} /></a>
      <div className="m-title">
        <b>{scene.name}</b>
        {projectName && <span className={dirty ? 'dirty' : ''}>{dirty ? L('ยังไม่บันทึก', 'unsaved') : L('บันทึกแล้ว', 'saved')}</span>}
      </div>
      <button className="m-icon" onClick={onMore} aria-label={L('เมนู', 'Menu')}><Icon name="more" size={22} /></button>
      <button className="m-export" onClick={onExport}><Icon name="upload" size={16} /> {L('ส่งออก', 'Export')}</button>
    </header>
  )
}

// ── แถวควบคุม ───────────────────────────────────────

function MobileTransport({ full, onFull }: { full: boolean; onFull: () => void }) {
  const time = useStore(s => s.time)
  const playing = useStore(s => s.playing)
  const duration = useStore(s => s.scene.duration)
  return (
    <div className="m-transport">
      <div className="m-time"><b>{fmt(time)}</b><span> / {fmt(duration)}</span></div>
      <button className={'m-play' + (playing ? ' on' : '')} onClick={() => setState({ playing: !playing })} aria-label={playing ? L('หยุด', 'Pause') : L('เล่น', 'Play')}>
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <div className="m-tr-right">
        <button className="m-icon" onClick={undo} aria-label={L('ย้อน', 'Undo')}><Icon name="undo" size={20} /></button>
        <button className="m-icon" onClick={redo} aria-label={L('ทำซ้ำ', 'Redo')}><Icon name="redo" size={20} /></button>
        <button className="m-icon" onClick={onFull} aria-label={L('เต็มจอ', 'Full screen')}><Icon name={full ? 'shrink' : 'expand'} size={20} /></button>
      </div>
    </div>
  )
}

// ── ไทม์ไลน์ (เส้นเวลาอยู่กลางจอ) ───────────────────────

const ROW_H = 46
const RULER_H = 26
const SNAP = 0.05

function extendTo(s: Scene) {
  const end = sceneEnd(s, buildTimeline(s))
  if (end + 0.5 > s.duration) s.duration = Math.ceil(end + 1)
}

function MobileTimeline({ onAdd }: { onAdd: () => void }) {
  const scene = useStore(s => s.scene)
  const time = useStore(s => s.time)
  const playing = useStore(s => s.playing)
  const sel = useStore(s => s.sel)
  useStore(s => s.lang)
  useAssetsVersion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pps, setPps] = useState(70)
  const [half, setHalf] = useState(180)
  const syncing = useRef(false)
  const tl = timelineOf(scene)
  const total = Math.max(scene.duration, sceneEnd(scene, tl) + 1)
  const width = total * pps

  // ครึ่งความกว้างจอ = ระยะเว้นซ้าย/ขวา → เวลา 0 และเวลาสุดท้ายเลื่อนมาอยู่ใต้เส้นกลางได้
  useLayoutEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setHalf(Math.round(el.clientWidth / 2)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // เวลาเปลี่ยน (เล่นอยู่ / กดย้อน / ซูม) → เลื่อนไทม์ไลน์ให้เวลานั้นอยู่ใต้เส้นกลาง
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const x = time * pps
    if (Math.abs(el.scrollLeft - x) > 0.5) { syncing.current = true; el.scrollLeft = x }
  }, [time, pps, half])

  // ผู้ใช้ปัดไทม์ไลน์ → เวลาตามตำแหน่งเส้นกลาง (หยุดเล่นก่อน)
  const onScroll = () => {
    const el = scrollRef.current!
    if (syncing.current) { syncing.current = false; return }
    if (getState().playing) setState({ playing: false })
    setTime(el.scrollLeft / pps)
  }

  // สองนิ้ว = ซูม (ถ่างออก = ขยาย)
  const pinch = useRef<{ d0: number; p0: number } | null>(null)
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const onTouchStart = (e: React.TouchEvent) => { if (e.touches.length === 2) pinch.current = { d0: dist(e.touches), p0: pps } }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return
    const next = Math.max(20, Math.min(400, pinch.current.p0 * dist(e.touches) / pinch.current.d0))
    setPps(Math.round(next))
  }
  const onTouchEnd = (e: React.TouchEvent) => { if (e.touches.length < 2) pinch.current = null }

  // ลากบล็อกที่เลือกอยู่ (ย้าย / ยืด) — บล็อกที่ยังไม่ได้เลือก แตะครั้งแรกแค่เลือก ไม่ลาก (จะได้ปัดไทม์ไลน์ได้สะดวก)
  const dragCue = (e: React.PointerEvent, c: Cue, mode: 'move' | 'resize' | 'resizeL') => {
    e.stopPropagation()
    const isSel = getState().sel.kind === 'cue' && (getState().sel as { id: string }).id === c.id
    if (!isSel) { select({ kind: 'cue', id: c.id }); return }
    e.preventDefault()
    const x0 = e.clientX
    const start0 = c.start
    const scene0 = getState().scene
    const durs = new Map(timelineOf(scene0).dur)
    const len0 = durs.get(c.id) ?? ('duration' in c ? c.duration : 0)
    const minStart = mode === 'resizeL' ? prevCueEnd(scene0, c, durs) : 0
    let insert: { id: string; before: boolean } | null = null
    let started = false
    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch { /* บางเบราว์เซอร์/อีเวนต์จำลอง capture ไม่ได้ — ลากต่อได้ตามปกติ */ }
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.abs(ev.clientX - x0) < 4) return; checkpoint(); started = true }
      const dt = (ev.clientX - x0) / pps
      const snap = (v: number) => Math.round(v / SNAP) * SNAP
      updateScene(s => {
        const k = s.cues.find(x => x.id === c.id)
        if (!k) return
        if (mode === 'move') {
          // ห้ามซ้อน: ชิดหัว/ท้ายบล็อกที่ทับ หรือแทรกแล้วดันแถวตอนปล่อย (ดู placeCue)
          const pl = placeCue(scene0, c, Math.max(0, +snap(start0 + dt).toFixed(3)), len0, durs)
          k.start = pl.start
          insert = pl.insert
          return
        }
        if (!('duration' in k)) return
        if (k.type === 'anim' && !k.loop) k.loop = true
        if (mode === 'resize') {
          k.duration = Math.max(0.05, +snap(len0 + dt).toFixed(3))
          rippleAfter(s, k.id)
        } else {
          const end = start0 + len0
          const st = Math.min(end - 0.05, Math.max(minStart, +snap(start0 + dt).toFixed(3)))
          k.start = +st.toFixed(3)
          k.duration = +(end - st).toFixed(3)
        }
      }, false)
    }
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up)
      const ins = insert
      if (started) updateScene(s => { if (ins) resequenceCue(s, c.id, start0, ins.id, ins.before, durs); extendTo(s) }, false)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  // แถว: ตัวละคร (บนสุด = อยู่หน้าสุด) · เสียง/กล้อง โชว์เมื่อมีคิว
  const rows = useMemo(() => {
    const out: { id: string; name: string; tag: string; actor: boolean; thumb?: string }[] =
      [...scene.actors].reverse().map(a => ({ id: a.id, name: a.name, tag: a.tag, actor: true }))
    if (scene.cues.some(c => c.actorId === AUDIO_ID)) out.push({ id: AUDIO_ID, name: L('เสียง', 'Sound'), tag: 'audio', actor: false })
    if (scene.cues.some(c => c.actorId === CAMERA_ID)) out.push({ id: CAMERA_ID, name: L('กล้อง', 'Camera'), tag: 'camera', actor: false })
    return out
  }, [scene.actors, scene.cues])

  // ไม้บรรทัด: ตัวเลขทุก 1/2/5 วิ ตามระดับซูม + จุดคั่นกลาง
  const major = pps >= 90 ? 1 : pps >= 40 ? 2 : 5
  const ticks: { t: number; major: boolean }[] = []
  for (let t = 0; t <= total + 1e-6; t += major / 2) ticks.push({ t: +t.toFixed(3), major: Math.abs(t / major - Math.round(t / major)) < 1e-6 })

  const selActorId = sel.kind === 'actor' ? sel.id : null
  const selCueId = sel.kind === 'cue' ? sel.id : null

  return (
    <div className="m-tl" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="m-tl-scroll" ref={scrollRef} onScroll={onScroll}
        onPointerDown={e => { if (e.target === e.currentTarget) select({ kind: 'none' }) }}>
        <div className="m-tl-inner" style={{ width: width + half * 2, height: RULER_H + Math.max(1, rows.length) * ROW_H + 16 }}>
          <div className="m-ruler" style={{ left: half, width }}>
            {ticks.map(k => (
              <div key={k.t} className={'m-tick' + (k.major ? ' major' : '')} style={{ left: k.t * pps }}>
                {k.major ? <span>{fmt(k.t).slice(0, 5)}</span> : <i />}
              </div>
            ))}
          </div>
          {rows.length === 0 && (
            <button className="m-empty-track" style={{ left: half, top: RULER_H + 6 }} onClick={onAdd}>
              <Icon name="plus" size={16} /> {L('แตะเพื่อเพิ่มเรนเจอร์', 'Tap to add a ranger')}
            </button>
          )}
          {rows.map((r, ri) => {
            const top = RULER_H + ri * ROW_H
            const cues = scene.cues.filter(c => c.actorId === r.id)
            return (
              <div key={r.id} className="m-row" style={{ top, height: ROW_H }}>
                {r.actor && (
                  <div className={'m-band' + (selActorId === r.id ? ' sel' : '')} style={{ left: half, width: scene.duration * pps }}
                    onClick={() => select({ kind: 'actor', id: r.id })} />
                )}
                {cues.map(c => {
                  const d = tl.dur.get(c.id) ?? 1
                  const isSel = selCueId === c.id
                  const resizable = c.type === 'move' || c.type === 'show' || c.type === 'camera' || c.type === 'anim' || (c.type === 'sound' && c.duration > 0)
                  const label = c.type === 'skill' ? c.label : c.type === 'anim' ? c.clip : c.type === 'sound' ? (scene.assets.find(a => a.id === c.assetId)?.name ?? cueLabel(c.type)) : cueLabel(c.type)
                  return (
                    <div key={c.id} className={'m-cue' + (isSel ? ' sel' : '')}
                      style={{ left: half + c.start * pps, width: Math.max(14, d * pps), ['--cc' as string]: cueColor[c.type] }}
                      onPointerDown={e => dragCue(e, c, 'move')}>
                      <span>{c.type === 'skill' && <Icon name="bolt" size={11} />}{c.type === 'sound' && <Icon name="music" size={11} />} {label}</span>
                      {isSel && resizable && <div className="m-cue-resize l" onPointerDown={e => dragCue(e, c, 'resizeL')} />}
                      {isSel && resizable && <div className="m-cue-resize" onPointerDown={e => dragCue(e, c, 'resize')} />}
                    </div>
                  )
                })}
                <button className={'m-row-label tag-' + r.tag + (selActorId === r.id ? ' sel' : '')}
                  onClick={() => r.actor && select({ kind: 'actor', id: r.id })}>
                  <i className={'tag-dot tag-' + r.tag} />{r.name}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div className="m-playhead" />
      {rows.length > 0 && <button className="m-tl-add" onClick={onAdd} aria-label={L('เพิ่มเรนเจอร์', 'Add ranger')}><Icon name="plus" size={22} /></button>}
    </div>
  )
}

// ── แถบเครื่องมือ (เปลี่ยนตามสิ่งที่เลือก) ────────────────

interface Tool { key: string; icon: IconName; label: string; run: () => void; tone?: 'danger' | 'accent' }

function MobileToolbar({ open, onAudio }: { open: (s: Sheet) => void; onAudio: () => void }) {
  const sel = useStore(s => s.sel)
  const scene = useStore(s => s.scene)
  useStore(s => s.lang)
  useAssetsVersion()

  const cue = sel.kind === 'cue' ? scene.cues.find(c => c.id === sel.id) : undefined
  const actor = sel.kind === 'actor' ? scene.actors.find(a => a.id === sel.id) : undefined
  const rt = actor ? assets.get(actor.assetId) : undefined

  let tools: Tool[]
  let context: string | null = null
  if (actor) {
    context = actor.name
    tools = [
      ...(rt?.kind === 'ranger' ? skillPresets(rt).map(p => ({ key: p.key, icon: 'bolt' as IconName, label: p.label, run: () => addSkill(actor.id, p.key, getState().time), tone: 'accent' as const })) : []),
      ...(rt?.kind === 'ranger' ? [
        { key: 'anim', icon: 'film' as IconName, label: L('ท่าทาง', 'Clip'), run: () => addCue('anim', actor.id) },
        { key: 'move', icon: 'run' as IconName, label: L('เดิน', 'Move'), run: () => addCue('move', actor.id) },
      ] : []),
      { key: 'show', icon: 'eye', label: L('ปรากฏ', 'Visible'), run: () => addCue('show', actor.id) },
      { key: 'edit', icon: 'edit', label: L('แก้ไข', 'Edit'), run: () => open('edit') },
      { key: 'flip', icon: 'flip', label: L('กลับด้าน', 'Flip'), run: () => updateScene(s => { const a = s.actors.find(x => x.id === actor.id); if (a) a.flip = !a.flip }) },
      { key: 'dup', icon: 'copy', label: L('ทำซ้ำ', 'Duplicate'), run: duplicateSelection },
      { key: 'del', icon: 'trash', label: L('ลบ', 'Delete'), run: deleteSelection, tone: 'danger' },
    ]
  } else if (cue) {
    context = `${cueLabel(cue.type)}${cue.type === 'skill' ? ' · ' + cue.label : ''}`
    tools = [
      { key: 'edit', icon: 'edit', label: L('แก้ไข', 'Edit'), run: () => open('edit') },
      { key: 'dup', icon: 'copy', label: L('ทำซ้ำ', 'Duplicate'), run: duplicateSelection },
      { key: 'del', icon: 'trash', label: L('ลบ', 'Delete'), run: deleteSelection, tone: 'danger' },
    ]
  } else if (sel.kind === 'background') {
    context = L('พื้นหลัง', 'Background')
    tools = [
      { key: 'edit', icon: 'edit', label: L('แก้ไข', 'Edit'), run: () => open('edit') },
      { key: 'maps', icon: 'layers', label: L('เปลี่ยนฉาก', 'Change stage'), run: () => open('maps') },
    ]
  } else {
    tools = [
      { key: 'ranger', icon: 'sparkle', label: L('เรนเจอร์', 'Ranger'), run: () => open('ranger'), tone: 'accent' },
      { key: 'media', icon: 'image', label: L('ภาพ/วิดีโอ', 'Media'), run: () => open('media') },
      { key: 'audio', icon: 'music', label: L('เสียง', 'Audio'), run: onAudio },
      { key: 'maps', icon: 'layers', label: L('ฉาก', 'Stage'), run: () => open('maps') },
      { key: 'camera', icon: 'camera', label: L('กล้อง', 'Camera'), run: () => addCue('camera', CAMERA_ID) },
      { key: 'scene', icon: 'edit', label: L('ตั้งค่าฉาก', 'Scene'), run: () => open('edit') },
    ]
  }

  return (
    <div className="m-toolbar">
      {context && (
        <button className="m-tool-back" onClick={() => select({ kind: 'none' })} aria-label={L('กลับ', 'Back')}>
          <Icon name="back" size={20} />
        </button>
      )}
      <div className="m-tools">
        {context && <div className="m-context">{context}</div>}
        <div className="m-tools-row">
          {tools.map(t => (
            <button key={t.key} className={'m-tool' + (t.tone ? ' ' + t.tone : '')} onClick={t.run}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── แผงเลื่อนขึ้นจากด้านล่าง ──────────────────────────────

function BottomSheet({ title, onClose, tall, children }: { title: string; onClose: () => void; tall?: boolean; children: React.ReactNode }) {
  // ปัดหัวแผงลงเพื่อปิด
  const startY = useRef<number | null>(null)
  const [dy, setDy] = useState(0)
  return (
    <div className="m-sheet-back" onPointerDown={onClose}>
      <div className={'m-sheet' + (tall ? ' tall' : '')} style={{ transform: dy ? `translateY(${dy}px)` : undefined }}
        onPointerDown={e => e.stopPropagation()}>
        <div className="m-sheet-head"
          onTouchStart={e => { startY.current = e.touches[0].clientY }}
          onTouchMove={e => { if (startY.current != null) setDy(Math.max(0, e.touches[0].clientY - startY.current)) }}
          onTouchEnd={() => { if (dy > 80) onClose(); setDy(0); startY.current = null }}>
          <div className="m-grab" />
          <b>{title}</b>
          <button className="m-icon" onClick={onClose} aria-label={L('ปิด', 'Close')}><Icon name="x" size={20} /></button>
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  )
}

// ── เมนู ⋯ ───────────────────────────────────────────

function MoreMenu({ onModal }: { onModal: (m: Modal) => void }) {
  const scene = useStore(s => s.scene)
  const lang = useStore(s => s.lang)
  const loop = useStore(s => s.loop)
  const muted = useStore(s => s.muted)
  const rate = useStore(s => s.rate)
  const importRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    const name = safeName(scene.name)
    try { await saveProject(name); toast(L(`บันทึก “${name}” แล้ว`, `Saved “${name}”`), 'ok') } catch (e) { toast(String(e instanceof Error ? e.message : e), 'error') }
  }
  const snapshot = async () => {
    const blob = await exportPng(scene, getState().time, 1)
    download(blob, `${safeName(scene.name)}-${getState().time.toFixed(2)}s.png`)
  }

  const items: { icon: IconName; label: string; run: () => void }[] = [
    { icon: 'save', label: L('บันทึกโปรเจค', 'Save project'), run: save },
    { icon: 'folder', label: L('เปิดโปรเจค', 'Open project'), run: () => onModal('open') },
    { icon: 'reset', label: L('รีเซ็ต / เริ่มใหม่', 'Reset / start over'), run: () => onModal('reset') },
    { icon: 'camera', label: L('บันทึกภาพนิ่ง', 'Save snapshot'), run: snapshot },
    { icon: 'download', label: L('ส่งออกไฟล์ฉาก (.json)', 'Export scene (.json)'), run: () => download(new Blob([JSON.stringify(scene, null, 1)], { type: 'application/json' }), `${safeName(scene.name)}.anme.json`) },
    { icon: 'upload', label: L('นำเข้าไฟล์ฉาก (.json)', 'Import scene (.json)'), run: () => importRef.current?.click() },
  ]

  return (
    <div className="m-more">
      <div className="m-more-grid">
        {items.map(i => (
          <button key={i.label} className="m-more-item" onClick={i.run}><Icon name={i.icon} size={20} /><span>{i.label}</span></button>
        ))}
      </div>
      <input ref={importRef} type="file" hidden accept=".json,application/json" onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        try { replaceScene(JSON.parse(await f.text()) as Scene); toast(L('นำเข้าฉากแล้ว', 'Scene imported'), 'ok') } catch { toast(L('ไฟล์ไม่ถูกต้อง', 'Invalid file'), 'error') }
      }} />
      <div className="m-more-rows">
        <MoreRow label={L('ภาษา', 'Language')}>
          <div className="m-seg">
            <button className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>ไทย</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </MoreRow>
        <MoreRow label={L('ความเร็วการเล่น', 'Playback speed')}>
          <div className="m-seg">
            {[0.25, 0.5, 1, 1.5, 2].map(r => <button key={r} className={rate === r ? 'on' : ''} onClick={() => setState({ rate: r })}>×{r}</button>)}
          </div>
        </MoreRow>
        <MoreRow label={L('เล่นวน', 'Loop')}>
          <button className={'m-switch' + (loop ? ' on' : '')} onClick={() => setState({ loop: !loop })} aria-pressed={loop}><i /></button>
        </MoreRow>
        <MoreRow label={L('เสียง', 'Sound')}>
          <button className={'m-switch' + (!muted ? ' on' : '')} onClick={() => setMuted(!muted)} aria-pressed={!muted}><i /></button>
        </MoreRow>
        <MoreRow label={L('ความยาวฉาก (วินาที)', 'Scene length (s)')}>
          <div className="m-stepper">
            <button onClick={() => updateScene(s => { s.duration = Math.max(1, s.duration - 1) })}>−</button>
            <b>{scene.duration}</b>
            <button onClick={() => updateScene(s => { s.duration = Math.min(600, s.duration + 1) })}>+</button>
          </div>
        </MoreRow>
      </div>
    </div>
  )
}

function MoreRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="m-more-row"><span>{label}</span>{children}</div>
}
