// ====================================================
// Timeline.tsx — ไทม์ไลน์: แถวละ 1 actor (+ กล้อง) · บล็อกคิวลากย้าย/ยืดได้ · ลากหัวอ่าน
// ====================================================
import { useEffect, useRef, useState } from 'react'
import { addCue, addSkill, placeCue, prevCueEnd, resequenceCue, rippleAfter, skillPresets, uploadAudio } from '@/anme/engine/actions'
import { audioPlayer } from '@/anme/engine/audio'
import { L } from '@/anme/engine/i18n'
import { assets } from '@/anme/engine/assets'
import { cueColor, cueLabel } from '@/anme/engine/scene'
import { checkpoint, getState, select, setMuted, setState, setTime, setVolume, toast, updateScene, useStore } from '@/anme/engine/store'
import { buildTimeline, sceneEnd } from '@/anme/engine/timeline'
import type { Scene } from '@/anme/engine/types'
import type { Cue } from '@/anme/engine/types'
import { AUDIO_ID, CAMERA_ID } from '@/anme/engine/types'
import { timelineOf, useAssetsVersion } from './StageView'
import { Icon } from './widgets'

const LABEL_W = 190

/** ยืดความยาวฉากให้ครอบคิวสุดท้าย */
function extendTo(s: Scene) {
  const end = sceneEnd(s, buildTimeline(s))
  if (end + 0.5 > s.duration) s.duration = Math.ceil(end + 1)
}
const SNAP = 0.05

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

export function Timeline() {
  const scene = useStore(s => s.scene)
  const time = useStore(s => s.time)
  const playing = useStore(s => s.playing)
  const loop = useStore(s => s.loop)
  const rate = useStore(s => s.rate)
  const sel = useStore(s => s.sel)
  const muted = useStore(s => s.muted)
  const volume = useStore(s => s.volume)
  useStore(s => s.lang)
  const audioRef = useRef<HTMLInputElement>(null)
  useAssetsVersion()
  const [pps, setPps] = useState(120)
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null)
  const [ins, setIns] = useState<{ id: string; before: boolean } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // ระยะเลื่อนแนวนอน — ใช้ซ่อนเส้นเวลาเมื่อมันเลื่อนไปอยู่ใต้กล่องชื่อเลเยอร์ (ไม่ให้วาดทะลุ)
  const [scrollX, setScrollX] = useState(0)
  const tl = timelineOf(scene)
  const width = Math.max(scene.duration, sceneEnd(scene, tl) + 1) * pps + 80

  // หัวอ่านวิ่งออกนอกจอ → เลื่อนตาม
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * pps
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - LABEL_W - 40) el.scrollLeft = Math.max(0, x - 60)
  }, [time, playing, pps])

  const scrub = (e: React.PointerEvent) => {
    const el = scrollRef.current!
    const calc = (cx: number) => {
      const r = el.getBoundingClientRect()
      return Math.max(0, (cx - r.left - LABEL_W + el.scrollLeft) / pps)
    }
    setState({ playing: false })
    setTime(calc(e.clientX))
    const move = (ev: PointerEvent) => setTime(calc(ev.clientX))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!
    const r = el.getBoundingClientRect()
    return (clientX - r.left - LABEL_W + el.scrollLeft) / pps
  }

  /**
   * ลากบล็อก — บล็อกในแถวเดียวกันห้ามซ้อนกัน (ดู placeCue):
   *   ทับครึ่งหน้าของบล็อกอื่น = ชิดหัวบล็อกนั้น · ทับครึ่งหลัง = ชิดท้ายต่อกันสนิท · ไม่มีที่ว่าง = แทรกแล้วดันแถว
   * resize = ลากหาง (ยืด/หด ดันบล็อกหลังออกไป) · resizeL = ลากหัว (ไม่เกินท้ายบล็อกก่อนหน้า)
   * กด Alt ค้างไว้ = ย้ายอิสระและไม่ snap
   */
  const dragCue = (e: React.PointerEvent, c: Cue, mode: 'move' | 'resize' | 'resizeL') => {
    e.stopPropagation()
    select({ kind: 'cue', id: c.id })
    const x0 = e.clientX
    const start0 = c.start
    const scene0 = getState().scene
    const tl0 = timelineOf(scene0)
    const durs = new Map(tl0.dur)
    // ความยาวจริงของบล็อกตอนเริ่มลาก (ท่าที่ไม่วนยาวเท่าคลิป ไม่ใช่ค่า duration)
    const len0 = durs.get(c.id) ?? ('duration' in c ? c.duration : 0)
    const minStart = mode === 'resizeL' ? prevCueEnd(scene0, c, durs) : 0
    let started = false
    let hint: { id: string; before: boolean } | null = null
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps
      if (!started) { if (Math.abs(ev.clientX - x0) < 3) return; checkpoint(); started = true }
      const snap = (v: number) => (ev.altKey ? v : Math.round(v / SNAP) * SNAP)
      let next: { id: string; before: boolean } | null = null
      updateScene(s => {
        const k = s.cues.find(x => x.id === c.id)
        if (!k) return
        if (mode === 'move') {
          const desired = Math.max(0, +snap(start0 + dt).toFixed(3))
          if (ev.altKey) { k.start = desired; return }
          const pl = placeCue(scene0, c, desired, len0, durs)
          k.start = pl.start
          next = pl.insert
          return
        }
        if (!('duration' in k)) return
        // ท่าที่ไม่วน → ยืดได้ด้วย: สลับเป็นวนตามความยาวที่ลาก
        if (k.type === 'anim' && !k.loop) { k.loop = true }
        if (mode === 'resize') {
          k.duration = Math.max(0.05, +snap(len0 + dt).toFixed(3))
          rippleAfter(s, k.id)   // ยืดแล้วชนบล็อกหลัง → ดันออกไป (ระยะห่างเดิมคงไว้)
        } else {
          const end = start0 + len0
          const st = Math.min(end - 0.05, Math.max(minStart, +snap(start0 + dt).toFixed(3)))
          k.start = +st.toFixed(3)
          k.duration = +(end - st).toFixed(3)
        }
      }, false)
      if (mode === 'move') {
        const n = next as { id: string; before: boolean } | null
        if (n?.id !== hint?.id || n?.before !== hint?.before) { hint = n; setIns(n) }
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      if (hint) {
        const h = hint
        updateScene(s => { resequenceCue(s, c.id, start0, h.id, h.before, durs); extendTo(s) }, false)
      }
      hint = null; setIns(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // แถวบนสุด = เลเยอร์หน้าสุด (วาดทีหลัง) → แสดงกลับลำดับของ scene.actors · กล้องอยู่ล่างสุดเสมอ
  const rows = [...[...scene.actors].reverse().map(a => ({ id: a.id, name: a.name, tag: a.tag as string, visible: a.visible, locked: a.locked })),
    { id: AUDIO_ID, name: L('เสียง', 'Sound'), tag: 'audio', visible: true, locked: false },
    { id: CAMERA_ID, name: L('กล้อง', 'Camera'), tag: 'camera', visible: true, locked: false }]
  const layerCount = scene.actors.length

  // ── ลากเรียงเลเยอร์ (จับที่ ⋮⋮ หน้าชื่อ) ──
  const dragRow = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    select({ kind: 'actor', id })
    const order = rows.slice(0, layerCount).map(r => r.id)
    const from = order.indexOf(id)
    const y0 = e.clientY
    let to = from
    const els = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-layer]') ?? [])]
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - y0) < 3 && to === from) return
      // ช่องแทรก = จำนวนแถว (ไม่นับแถวที่ลาก) ที่จุดกึ่งกลางอยู่เหนือเมาส์
      let k = 0
      els.forEach((el, i) => { if (i === from) return; const r = el.getBoundingClientRect(); if (ev.clientY > r.top + r.height / 2) k++ })
      to = k
      setDrag({ id, to })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDrag(null)
      if (to === from) return
      const next = order.filter(x => x !== id)
      next.splice(to, 0, id)
      updateScene(s => {
        const byId = new Map(s.actors.map(a => [a.id, a]))
        s.actors = next.slice().reverse().map(x => byId.get(x)!).filter(Boolean)
      })
      const s = getState().scene
      if (s.depthSort && s.assets.find(d => d.id === s.actors.find(a => a.id === id)?.assetId)?.type === 'ranger') {
        toast(L('เปิด “เรียงลึกตามแกน Y” อยู่ — เรนเจอร์จะซ้อนกันตามตำแหน่ง Y · ปิดได้ที่ตั้งค่าฉากเพื่อใช้ลำดับเลเยอร์นี้', '“Depth sort by Y” is on — rangers overlap by their Y position · turn it off in Scene settings to use this layer order'), 'info', 5500)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ไม้บรรทัด
  const step = pps >= 160 ? 0.25 : pps >= 80 ? 0.5 : pps >= 40 ? 1 : 2
  const ticks: number[] = []
  for (let t = 0; t * pps < width; t += step) ticks.push(+t.toFixed(3))

  const selActor = sel.kind === 'actor' ? scene.actors.find(a => a.id === sel.id) : sel.kind === 'cue' ? scene.actors.find(a => a.id === scene.cues.find(c => c.id === sel.id)?.actorId) : undefined
  const selRt = selActor ? assets.get(selActor.assetId) : undefined

  return (
    <div className="timeline">
      <div className="tl-bar">
        <div className="transport">
          <button className="ibtn" title={L('กลับจุดเริ่ม (Home)', 'Back to start (Home)')} onClick={() => { setState({ playing: false }); setTime(0) }}><Icon name="first" /></button>
          <button className={'ibtn play' + (playing ? ' on' : '')} title={L('เล่น/หยุด (Space)', 'Play/pause (Space)')} onClick={() => setState({ playing: !playing })}><Icon name={playing ? 'pause' : 'play'} size={18} /></button>
          <button className={'ibtn' + (loop ? ' on' : '')} title={L('เล่นวน', 'Loop')} onClick={() => setState({ loop: !loop })}><Icon name="loop" /></button>
          <div className="timecode"><b>{fmtTime(time)}</b><span>/ {fmtTime(scene.duration)}</span></div>
          <button className={'ibtn' + (muted ? ' on muted' : '')} title={muted ? L('เปิดเสียง', 'Unmute') : L('ปิดเสียง', 'Mute')} onClick={() => setMuted(!muted)}><Icon name={muted ? 'volumeOff' : 'volume'} /></button>
          <input className="vol" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} title={L('ระดับเสียง', 'Volume')}
            onChange={e => { const v = parseFloat(e.target.value); setVolume(v); if (muted && v > 0) setMuted(false) }}
            style={{ ['--k' as string]: `${(muted ? 0 : volume) * 100}%` }} />
          <select className="mini-sel" value={rate} onChange={e => setState({ rate: parseFloat(e.target.value) })} title={L('ความเร็วการเล่น', 'Playback speed')}>
            {[0.1, 0.25, 0.5, 1, 1.5, 2].map(r => <option key={r} value={r}>×{r}</option>)}
          </select>
        </div>
        <div className="tl-add">
          {selActor && selRt?.kind === 'ranger' && skillPresets(selRt).map(p => (
            <button key={p.key} className="chip skill" onClick={() => addSkill(selActor.id, p.key)} title={`${p.cast.join(' + ')} → ${p.release}${p.set ? ' · ' + p.set : ''}`}>
              <Icon name="bolt" size={13} /> {p.label}
            </button>
          ))}
          {selActor && selRt?.kind === 'ranger' && <button className="chip anim" onClick={() => addCue('anim', selActor.id)}><Icon name="film" size={13} /> {L('ท่าทาง', 'Clip')}</button>}
          {selActor && selRt?.kind === 'ranger' && <button className="chip move" onClick={() => addCue('move', selActor.id)}><Icon name="run" size={13} /> {L('เดิน', 'Move')}</button>}
          {selActor && <button className="chip show" onClick={() => addCue('show', selActor.id)}><Icon name="eye" size={13} /> {L('ปรากฏ', 'Visible')}</button>}
          <button className="chip sound" onClick={() => audioRef.current?.click()}><Icon name="music" size={13} /> {L('เสียง', 'Sound')}</button>
          <input ref={audioRef} type="file" hidden multiple accept="audio/*" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) uploadAudio(f) }} />
          <button className="chip camera" onClick={() => addCue('camera', CAMERA_ID)}><Icon name="camera" size={13} /> {L('กล้อง', 'Camera')}</button>
          {!selActor && <span className="muted small">{L('เลือกตัวละครเพื่อเพิ่มสกิล/ท่าทาง · ลากบล็อกทับกัน = สลับ/แทรก', 'Select an actor to add skills/clips · drop a block on another = swap/insert')}</span>}
        </div>
        <div className="tl-zoom">
          <span className="muted small">{L('ยาว', 'Length')}</span>
          <input className="dur-input" type="number" min={1} max={600} step={0.5} value={scene.duration}
            onChange={e => { const v = parseFloat(e.target.value); if (v > 0) updateScene(s => { s.duration = v }) }} />
          <span className="muted small">{L('วิ', 's')}</span>
          <input type="range" min={30} max={400} value={pps} onChange={e => setPps(+e.target.value)} title={L('ซูมไทม์ไลน์', 'Timeline zoom')} />
        </div>
      </div>
      <div className="tl-scroll" ref={scrollRef} onScroll={e => setScrollX(e.currentTarget.scrollLeft)}>
        <div className="tl-inner" style={{ width: width + LABEL_W }}>
          <div className="tl-ruler" onPointerDown={scrub}>
            <div className="tl-corner" style={{ width: LABEL_W }} />
            <div className="tl-ticks" style={{ width }}>
              {ticks.map(t => (
                <div key={t} className={'tick' + (Math.abs(t - Math.round(t)) < 1e-6 ? ' major' : '')} style={{ left: t * pps }}>
                  {Math.abs(t - Math.round(t)) < 1e-6 && <span>{t}s</span>}
                </div>
              ))}
              <div className="tl-end" style={{ left: scene.duration * pps }} />
            </div>
          </div>
          {rows.map((r, ri) => {
            const isLayer = r.id !== CAMERA_ID && r.id !== AUDIO_ID
            // เส้นบอกจุดวาง: ช่องแทรก drag.to นับโดยไม่รวมแถวที่ลาก
            const dragFrom = drag ? rows.findIndex(x => x.id === drag.id) : -1
            const slot = drag && isLayer && r.id !== drag.id ? (ri > dragFrom ? ri - 1 : ri) : -1
            const dropBefore = drag != null && slot === drag.to
            const dropAfter = drag != null && isLayer && ri === layerCount - 1 && drag.to === layerCount - 1 && r.id !== drag.id
            const cues = scene.cues.filter(c => c.actorId === r.id)
            const hits = tl.hits.filter(h => h.targetId === r.id)
            const isSel = sel.kind === 'actor' && sel.id === r.id
            return (
              <div key={r.id} {...(isLayer ? { 'data-layer': r.id } : {})}
                className={'tl-row' + (isSel ? ' sel' : '') + (r.visible ? '' : ' hidden-row') + (drag?.id === r.id ? ' dragging' : '') + (dropBefore ? ' drop-before' : '') + (dropAfter ? ' drop-after' : '')}>
                {/* ลากตรงไหนของกล่องก็ย้ายเลเยอร์ได้ (ชื่อ / เลข / ⋮⋮) — ยกเว้นปุ่มข้างใน (ซ่อน/แสดง, เพิ่มเสียง)
                    dragRow เรียก preventDefault → ไม่เกิดการลากเลือกข้อความ · แตะเฉยๆ (ไม่ขยับ) = เลือกตัวละครเหมือนเดิม */}
                <div className={'tl-label' + (isLayer ? ' draggable' : '')} style={{ width: LABEL_W }}
                  title={isLayer ? L('ลากเพื่อย้ายเลเยอร์ (บน = อยู่หน้า)', 'Drag to reorder layers (top = front)') : undefined}
                  onPointerDown={e => { if (isLayer && !(e.target as HTMLElement).closest('button')) dragRow(e, r.id) }}
                  onClick={() => isLayer && select({ kind: 'actor', id: r.id })}>
                  {isLayer
                    ? <span className="grip">⋮⋮</span>
                    : <span className="grip ghost" />}
                  {isLayer && <span className="layer-no" title={L('ลำดับเลเยอร์ (1 = หน้าสุด)', 'Layer order (1 = front)')}>{ri + 1}</span>}
                  <span className={'tag-dot tag-' + r.tag} />
                  <span className="tl-name">{r.name}</span>
                  {r.id === AUDIO_ID && (
                    <button className="ibtn tiny" title={L('เพิ่มไฟล์เสียง', 'Add audio file')} onClick={e => { e.stopPropagation(); audioRef.current?.click() }}><Icon name="plus" size={13} /></button>
                  )}
                  {isLayer && (
                    <button className="ibtn tiny" title={L('ซ่อน/แสดง', 'Hide/show')} onClick={e => { e.stopPropagation(); updateScene(s => { const a = s.actors.find(x => x.id === r.id); if (a) a.visible = !a.visible }) }}>
                      <Icon name={r.visible ? 'eye' : 'eyeOff'} size={13} />
                    </button>
                  )}
                </div>
                <div className="tl-lane" style={{ width }} onPointerDown={scrub}>
                  {cues.map(c => {
                    const d = tl.dur.get(c.id) ?? 1
                    const st = c.type === 'skill' ? tl.skill.get(c.id) : undefined
                    const selected = sel.kind === 'cue' && sel.id === c.id
                    // ยืด/หดได้: เดิน · ท่าทาง (idle ฯลฯ — ไม่วนจะสลับเป็นวนเองตอนลาก) · ปรากฏ · กล้อง · เสียงที่ตัดความยาว
                    const resizable = c.type === 'move' || c.type === 'show' || c.type === 'camera' || c.type === 'anim' || (c.type === 'sound' && c.duration > 0)
                    const label = c.type === 'skill' ? c.label : c.type === 'anim' ? c.clip : c.type === 'sound' ? (scene.assets.find(d => d.id === c.assetId)?.name ?? cueLabel(c.type)) : cueLabel(c.type)
                    return (
                      <div key={c.id} className={'cue cue-' + c.type + (selected ? ' sel' : '') + (resizable ? ' has-grips' : '') + (ins?.id === c.id ? (ins.before ? ' ins-before' : ' ins-after') : '')}
                        style={{ left: c.start * pps, width: Math.max(8, d * pps), ['--cc' as string]: cueColor[c.type] }}
                        onPointerDown={e => dragCue(e, c, 'move')}
                        title={`${cueLabel(c.type)} · ${label} · ${c.start.toFixed(2)}s → ${(c.start + d).toFixed(2)}s`}
                      >
                        {st && st.castDur > 0 && <div className="cue-cast" style={{ width: st.castDur * pps }} />}
                        {st && <div className="cue-body-end" style={{ left: (st.bodyEnd - c.start) * pps }} />}
                        {st?.shots.map(s => (
                          <div key={s.index} className="cue-impact" style={{ left: (s.impactAt - c.start) * pps }} title={`${L('กระทบ', 'Impact')} ${s.impactAt.toFixed(2)}s`} />
                        ))}
                        <span className="cue-label">{c.type === 'skill' && <Icon name="bolt" size={11} />}{c.type === 'sound' && <Icon name="music" size={11} />} {label}</span>
                        {/* จับหัว/หางเพื่อปรับระยะเวลา — มีขีดจับให้เห็นชัด */}
                        {resizable && <div className="cue-resize l" title={L('ลากเพื่อปรับจุดเริ่ม', 'Drag to change the start')} onPointerDown={e => dragCue(e, c, 'resizeL')} />}
                        {resizable && <div className="cue-resize r" title={L('ลากเพื่อปรับความยาว', 'Drag to change the length')} onPointerDown={e => dragCue(e, c, 'resize')} />}
                      </div>
                    )
                  })}
                  {hits.map((h, i) => <div key={i} className="hit-marker" style={{ left: h.at * pps }} title={`${L('โดน', 'Hit by')} ${h.cue.label} @ ${h.at.toFixed(2)}s`} />)}
                </div>
              </div>
            )
          })}
          {time * pps >= scrollX - 1 && <div className="playhead" style={{ left: LABEL_W + time * pps }}><div className="playhead-cap" /></div>}
        </div>
      </div>
    </div>
  )
}

/** เดินเวลาเมื่อกำลังเล่น */
export function usePlayback() {
  useEffect(() => {
    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const st = getState()
      audioPlayer.update(st, timelineOf(st.scene))
      if (!st.playing || st.busy?.startsWith('export')) return
      let t = st.time + dt * st.rate
      if (t >= st.scene.duration) {
        if (st.loop) t = 0
        else { t = st.scene.duration; setState({ playing: false }) }
      }
      setTime(t)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}
