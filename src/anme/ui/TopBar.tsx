// ====================================================
// TopBar.tsx — แถบบน: โปรเจค (รีเซ็ต/เปิด/บันทึก/นำเข้า/ส่งออก) · ย้อน/ทำซ้ำ · ภาษา · ถ่ายภาพ · ส่งออกวิดีโอ
// ====================================================
import { useEffect, useRef, useState } from 'react'
import { resetScene, type ResetKind } from '@/anme/engine/actions'
import { download, exportPng, exportVideo, videoExt } from '@/anme/engine/exporter'
import { L } from '@/anme/engine/i18n'
import { getState, redo, replaceScene, setLang, setState, toast, undo, useStore } from '@/anme/engine/store'
import { buildTimeline, sceneEnd } from '@/anme/engine/timeline'
import type { Scene } from '@/anme/engine/types'
import { deleteProject, listProjects, loadProject, saveProjectData } from '@/anme/engine/storage'
import { Icon, Num, Seg, Toggle } from './widgets'

const safeName = (n: string) => n.replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().slice(0, 60) || 'scene'

async function saveProject(name: string) {
  await saveProjectData(name, getState().scene)
  setState({ projectName: name, dirty: false })
}

export function TopBar() {
  const scene = useStore(s => s.scene)
  const dirty = useStore(s => s.dirty)
  const projectName = useStore(s => s.projectName)
  const lang = useStore(s => s.lang)
  const [modal, setModal] = useState<null | 'open' | 'export' | 'reset'>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const onSave = async () => {
    const name = safeName(scene.name)
    try { await saveProject(name); toast(L(`บันทึก “${name}” แล้ว`, `Saved “${name}”`), 'ok') } catch (e) { toast(String(e instanceof Error ? e.message : e), 'error') }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const onSnapshot = async () => {
    const blob = await exportPng(scene, getState().time, 1)
    download(blob, `${safeName(scene.name)}-${getState().time.toFixed(2)}s.png`)
  }

  return (
    <header className="topbar">
      {/* กลับเมนู Custom ของเว็บ Line Ranger Kiwi — <a> ธรรมดา (ไม่ใช่ next/link) ให้ออกจากสตูดิโอแบบสะอาด */}
      <a className="ibtn" href="/custom" title={L('กลับเมนู Custom', 'Back to Custom')}><Icon name="back" /></a>
      <div className="brand">
        <div className="brand-mark">LR</div>
        <div className="brand-text"><b>ANME</b><span>Ranger Animation Studio</span></div>
      </div>
      <div className="proj">
        <span className="proj-name">{scene.name}</span>
        {projectName && <span className={'proj-state' + (dirty ? ' dirty' : '')}>{dirty ? L('● ยังไม่บันทึก', '● unsaved') : L('บันทึกแล้ว', 'saved')}</span>}
      </div>
      <div className="top-actions">
        <button className="ibtn" title={L('ย้อน (Ctrl+Z)', 'Undo (Ctrl+Z)')} onClick={undo}><Icon name="undo" /></button>
        <button className="ibtn" title={L('ทำซ้ำ (Ctrl+Y)', 'Redo (Ctrl+Y)')} onClick={redo}><Icon name="redo" /></button>
        <span className="sep" />
        <button className="btn" title={L('รีเซ็ต / เริ่มใหม่', 'Reset / start over')} onClick={() => setModal('reset')}><Icon name="reset" /> <span className="lbl">{L('รีเซ็ต', 'Reset')}</span></button>
        <button className="btn" title={L('เปิดโปรเจค', 'Open project')} onClick={() => setModal('open')}><Icon name="folder" /> <span className="lbl">{L('เปิด', 'Open')}</span></button>
        <button className="btn" title={L('บันทึก (Ctrl+S)', 'Save (Ctrl+S)')} onClick={onSave}><Icon name="save" /> <span className="lbl">{L('บันทึก', 'Save')}</span></button>
        <button className="btn ghost" title={L('ส่งออกไฟล์ฉาก .json', 'Export scene .json')} onClick={() => download(new Blob([JSON.stringify(scene, null, 1)], { type: 'application/json' }), `${safeName(scene.name)}.anme.json`)}><Icon name="download" /> <span className="lbl">JSON</span></button>
        <button className="btn ghost" title={L('นำเข้าไฟล์ฉาก .json', 'Import scene .json')} onClick={() => importRef.current?.click()}><Icon name="upload" /> <span className="lbl">{L('นำเข้า', 'Import')}</span></button>
        <input ref={importRef} type="file" hidden accept=".json,application/json" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try { replaceScene(JSON.parse(await f.text()) as Scene); toast(L('นำเข้าฉากแล้ว', 'Scene imported'), 'ok') } catch { toast(L('ไฟล์ไม่ถูกต้อง', 'Invalid file'), 'error') }
        }} />
        <span className="sep" />
        <div className="lang-switch" title={L('ภาษา', 'Language')}>
          <Icon name="globe" size={14} />
          <button className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>TH</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <button className="btn" title={L('บันทึกภาพนิ่ง PNG', 'Save PNG snapshot')} onClick={onSnapshot}><Icon name="camera" /> <span className="lbl">{L('ภาพนิ่ง', 'Snapshot')}</span></button>
        <button className="btn primary" onClick={() => setModal('export')}><Icon name="film" /> <span className="lbl">{L('ส่งออกวิดีโอ', 'Export video')}</span></button>
      </div>
      {modal === 'open' && <OpenModal onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
      {modal === 'reset' && <ResetModal onClose={() => setModal(null)} />}
    </header>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal" onPointerDown={e => e.stopPropagation()}>
        <header><b>{title}</b><button className="ibtn" onClick={onClose}><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ResetModal({ onClose }: { onClose: () => void }) {
  const opts: { kind: ResetKind; icon: 'reset' | 'film' | 'move' | 'layers'; title: string; desc: string; danger?: boolean }[] = [
    { kind: 'cues', icon: 'film', title: L('ล้างไทม์ไลน์', 'Clear timeline'), desc: L('ลบคิวทั้งหมด (สกิล ท่าทาง เดิน กล้อง เสียง) เก็บตัวละครไว้', 'Remove every cue (skills, clips, moves, camera, sound) — keep the actors') },
    { kind: 'positions', icon: 'move', title: L('จัดตำแหน่งใหม่', 'Reset positions'), desc: L('วางตัวละครกลับที่ตั้งต้น ขนาด ×1 หันหน้าตามฝ่าย และลบคิวกล้อง', 'Put actors back in default slots, scale ×1, face their side, remove camera cues') },
    { kind: 'background', icon: 'layers', title: L('รีเซ็ตพื้นหลัง', 'Reset background'), desc: L('กลับไปใช้ฉากด่านเริ่มต้นและเส้นพื้นปกติ', 'Back to the default stage and ground line') },
    { kind: 'all', icon: 'reset', title: L('รีเซ็ตทั้งหมด', 'Reset everything'), desc: L('ล้างฉากทั้งหมด เริ่มใหม่ตั้งแต่ต้น (ย้อนกลับได้ด้วย Ctrl+Z)', 'Wipe the whole scene and start over (Ctrl+Z can undo)'), danger: true },
  ]
  return (
    <Modal title={L('รีเซ็ต', 'Reset')} onClose={onClose}>
      <div className="reset-list">
        {opts.map(o => (
          <button key={o.kind} className={'reset-item' + (o.danger ? ' danger' : '')} onClick={() => { resetScene(o.kind); onClose() }}>
            <Icon name={o.icon} size={20} />
            <span><b>{o.title}</b><small>{o.desc}</small></span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function OpenModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<{ name: string; at: number }[] | null>(null)
  const load = () => listProjects().then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])
  const open = async (name: string) => {
    const project = await loadProject(name)
    if (project) { replaceScene(project as Scene, name); toast(L(`เปิด “${name}”`, `Opened “${name}”`), 'ok'); onClose() }
  }
  return (
    <Modal title={L('เปิดโปรเจค', 'Open project')} onClose={onClose}>
      {!list && <div className="muted">{L('กำลังโหลด…', 'Loading…')}</div>}
      {list && !list.length && <div className="muted">{L('ยังไม่มีโปรเจคที่บันทึก — กด “บันทึก” ที่แถบบนเพื่อเก็บฉากปัจจุบัน', 'No saved projects yet — press “Save” in the top bar to store this scene')}</div>}
      <div className="proj-list">
        {list?.map(p => (
          <div key={p.name} className="proj-item">
            <button className="proj-open" onClick={() => open(p.name)}><Icon name="film" /> <b>{p.name}</b><span>{new Date(p.at).toLocaleString(getState().lang === 'en' ? 'en-GB' : 'th-TH')}</span></button>
            <button className="ibtn danger" title={L('ลบ', 'Delete')} onClick={async () => { if (confirm(L(`ลบโปรเจค “${p.name}”?`, `Delete project “${p.name}”?`))) { await deleteProject(p.name); load() } }}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const scene = useStore(s => s.scene)
  const muted = useStore(s => s.muted)
  const end = Math.max(0.5, Math.min(scene.duration, sceneEnd(scene, buildTimeline(scene)) + 0.6))
  const hasSound = buildTimeline(scene).sounds.length > 0
  const [scale, setScale] = useState<'0.5' | '1' | '1.5'>('1')
  const [fps, setFps] = useState<'30' | '60'>('60')
  const [audio, setAudio] = useState(!muted)
  const [range, setRange] = useState({ from: 0, to: +end.toFixed(2) })
  const [prog, setProg] = useState<number | null>(null)
  const signal = useRef({ cancel: false })
  const run = async () => {
    signal.current = { cancel: false }
    setProg(0)
    setState({ busy: 'export', playing: false })
    try {
      const k = parseFloat(scale)
      const blob = await exportVideo(getState().scene, { scale: k, fps: +fps, from: range.from, to: range.to, bitrate: Math.round(12_000_000 * k * k), audio: audio && hasSound }, setProg, signal.current)
      if (blob) { download(blob, `${safeName(scene.name)}.${videoExt()}`); toast(L('ส่งออกวิดีโอเสร็จแล้ว', 'Video exported'), 'ok') }
    } catch (e) {
      toast(L('ส่งออกไม่สำเร็จ: ', 'Export failed: ') + (e instanceof Error ? e.message : e), 'error', 6000)
    } finally {
      setState({ busy: null }); setProg(null)
    }
  }
  return (
    <Modal title={L('ส่งออกวิดีโอ', 'Export video')} onClose={() => { if (prog == null) onClose() }}>
      <div className="export-grid">
        <div className="field-label">{L('ความละเอียด', 'Resolution')}</div>
        <Seg value={scale} onChange={setScale} options={[
          { value: '0.5', label: `${scene.width / 2}×${scene.height / 2}` }, { value: '1', label: `${scene.width}×${scene.height}` }, { value: '1.5', label: `${scene.width * 1.5}×${scene.height * 1.5}` },
        ]} />
        <div className="field-label">{L('เฟรมเรต', 'Frame rate')}</div>
        <Seg value={fps} onChange={setFps} options={[{ value: '30', label: '30 fps' }, { value: '60', label: '60 fps' }]} />
        <div className="field-label">{L('ช่วงเวลา', 'Range')}</div>
        <div className="row" style={{ gap: 6 }}>
          <Num label={L('จาก', 'From')} unit={L('วิ', 's')} step={0.1} min={0} value={range.from} onChange={v => setRange(r => ({ ...r, from: v }))} />
          <Num label={L('ถึง', 'To')} unit={L('วิ', 's')} step={0.1} min={0.1} value={range.to} onChange={v => setRange(r => ({ ...r, to: v }))} />
        </div>
        {hasSound
          ? <Toggle label={L('ใส่เสียงในวิดีโอ', 'Include sound')} value={audio} onChange={setAudio} />
          : <div className="muted small">{L('ฉากนี้ยังไม่มีเสียง — วิดีโอจะไม่มีเสียง', 'This scene has no sound — the video will be silent')}</div>}
        <div className="muted small">.{videoExt()} · {L('เข้ารหัสทีละเฟรม (ไม่มีเฟรมตก แม้เครื่องช้า)', 'encoded frame by frame (no dropped frames, even on a slow PC)')}</div>
      </div>
      {prog != null && <div className="progress"><div style={{ width: `${Math.round(prog * 100)}%` }} /><span>{Math.round(prog * 100)}%</span></div>}
      <div className="modal-foot">
        {prog == null
          ? <><button className="btn ghost" onClick={onClose}>{L('ยกเลิก', 'Cancel')}</button><button className="btn primary" onClick={run}><Icon name="film" /> {L('เริ่มส่งออก', 'Start export')}</button></>
          : <button className="btn danger" onClick={() => { signal.current.cancel = true }}>{L('หยุด', 'Stop')}</button>}
      </div>
    </Modal>
  )
}
