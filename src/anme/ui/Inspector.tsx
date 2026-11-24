// ====================================================
// Inspector.tsx — แผงตั้งค่าขวามือ (ตามสิ่งที่เลือก: ฉาก / พื้นหลัง / ตัวละคร / คิว)
// การตั้งค่าสกิลละเอียดแบบ LineRanger_TurnBased: เฟรมปล่อย · เพดานร่าย · เดินเข้าหาเป้า ·
// วิธีไปถึงเป้า · โค้งอัตโนมัติ · ยืดคลิปบิน · เฉียงตามทิศ · แยกจุดระเบิด
// ====================================================
import { useRef } from 'react'
import {
  addCue, addSkill, canTarget, deleteSelection, dropSameSideTargets, duplicateSelection, facingFor, fxFromGameData, moveLayer, patchActor, patchCue, presetSoundKind,
  patchSkill, setSkillSound, skillPresets, gameFx, gameProjectileOf, hasGameRules,
} from '@/anme/engine/actions'
import { previewSound } from '@/anme/engine/audio'
import { assets, uploadFile, type RangerRuntime } from '@/anme/engine/assets'
import { L } from '@/anme/engine/i18n'
import { STAGE_SIZES, cueColor, cueLabel, defaultFx } from '@/anme/engine/scene'
import { select, setState, setTime, toast, updateScene, useStore } from '@/anme/engine/store'
import { GAME_SPEED_TO_PXS, cueRules, cueTarget } from '@/anme/engine/timeline'
import type { Actor, AnimCue, Blend, CameraCue, Cue, Ease, FxMode, MoveCue, ShowCue, SkillCue, SoundCue } from '@/anme/engine/types'
import { BackgroundInspector } from './Library'
import { InfoFields, RangeFields, RangerLayers } from './LayerPanels'
import { PartsPanel } from './PartsPanel'
import { timelineOf, useAssetsVersion } from './StageView'
import { Icon, Num, Row, Section, Seg, Select, Slider, Text, Toggle } from './widgets'

const blends = (): { value: Blend; label: string }[] => [
  { value: 'source-over', label: L('ปกติ', 'Normal') }, { value: 'lighter', label: L('Add (เรืองแสง)', 'Add (glow)') }, { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' }, { value: 'overlay', label: 'Overlay' }, { value: 'color-dodge', label: 'Dodge' }, { value: 'hard-light', label: 'Hard light' },
]
const eases = (): { value: Ease; label: string }[] => [
  { value: 'linear', label: L('คงที่', 'Linear') }, { value: 'easeIn', label: L('เร่ง', 'Ease in') }, { value: 'easeOut', label: L('ผ่อน', 'Ease out') },
  { value: 'easeInOut', label: L('นุ่มนวล', 'Smooth') }, { value: 'backOut', label: L('เด้ง', 'Bounce') },
]

export function Inspector() {
  const sel = useStore(s => s.sel)
  const scene = useStore(s => s.scene)
  useStore(s => s.lang)
  useAssetsVersion()
  let body: JSX.Element
  if (sel.kind === 'actor') {
    const a = scene.actors.find(x => x.id === sel.id)
    body = a ? <ActorInspector a={a} /> : <SceneInspector />
  } else if (sel.kind === 'cue') {
    const c = scene.cues.find(x => x.id === sel.id)
    body = c ? <CueInspector c={c} /> : <SceneInspector />
  } else if (sel.kind === 'background') body = <BackgroundInspector />
  else body = <SceneInspector />
  return <aside className="inspector">{body}</aside>
}

function Header({ title, sub, color, actions }: { title: string; sub?: string; color?: string; actions?: JSX.Element }) {
  return (
    <div className="insp-head" style={color ? { ['--accent' as string]: color } : undefined}>
      <div>
        <div className="insp-title">{title}</div>
        {sub && <div className="insp-sub">{sub}</div>}
      </div>
      <div className="insp-actions">{actions}</div>
    </div>
  )
}

function SceneInspector() {
  const scene = useStore(s => s.scene)
  const guides = useStore(s => s.guides)
  const sizeKey = `${scene.width}x${scene.height}`
  return (
    <>
      <Header title={L('ตั้งค่าฉาก', 'Scene settings')} sub={L(`${scene.actors.length} ตัวละคร · ${scene.cues.length} คิว`, `${scene.actors.length} actors · ${scene.cues.length} cues`)} />
      <Section title={L('ฉาก', 'Scene')}>
        <Text label={L('ชื่อฉาก', 'Scene name')} value={scene.name} onChange={v => updateScene(s => { s.name = v })} />
        <Select label={L('ขนาดเวที', 'Stage size')} value={sizeKey}
          options={STAGE_SIZES.map(z => ({ value: `${z.w}x${z.h}`, label: `${z.label} · ${z.w}×${z.h}` }))}
          onChange={v => { const [w, h] = v.split('x').map(Number); updateScene(s => { const ky = h / s.height; s.width = w; s.height = h; s.groundY = Math.round(s.groundY * ky) }) }} />
        <Row>
          <Num label={L('ยาว', 'Length')} unit={L('วิ', 's')} value={scene.duration} step={0.5} min={0.5} onChange={(v, h) => updateScene(s => { s.duration = v }, h)} />
          <Num label={L('พื้น Y', 'Ground Y')} value={scene.groundY} onChange={(v, h) => updateScene(s => { s.groundY = v }, h)} />
        </Row>
        <Toggle label={L('เรียงลึกตามแกน Y (ตัวหน้าทับตัวหลัง)', 'Depth sort by Y (front covers back)')} value={scene.depthSort} onChange={v => updateScene(s => { s.depthSort = v })} />
        <Toggle label={L('ผสมเฟรมให้ลื่น (จอ 60–144Hz)', 'Smooth frame blending (60–144Hz)')} value={scene.smooth} onChange={v => updateScene(s => { s.smooth = v })} />
        <Toggle label={L('แสดงเส้นพื้นช่วยจัด', 'Show ground guide')} value={guides} onChange={v => setState({ guides: v })} />
      </Section>
      <Section title={L('พื้นหลัง', 'Background')} right={<button className="btn tiny" onClick={() => select({ kind: 'background' })}>{L('แก้ไข', 'Edit')}</button>}>
        <div className="muted small">{L('เลือกฉากจากแท็บ “ฉาก” ทางซ้าย หรือกด “แก้ไข” เพื่อปรับตำแหน่ง/ขนาด/ความมืด', 'Pick a map in the “Maps” tab on the left, or press “Edit” to adjust position/size/darkness')}</div>
      </Section>
      <Section title={L('คีย์ลัด', 'Shortcuts')} defaultOpen={false}>
        <ul className="keys">
          <li><kbd>Space</kbd> {L('เล่น/หยุด', 'Play/pause')}</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd> {L('ย้อน/ทำซ้ำ', 'Undo/redo')}</li>
          <li><kbd>Del</kbd> {L('ลบ', 'Delete')} · <kbd>Ctrl</kbd>+<kbd>D</kbd> {L('ทำซ้ำ', 'Duplicate')}</li><li><kbd>←</kbd><kbd>→</kbd> {L('เลื่อนตัวละคร (Shift = 10px)', 'Nudge actor (Shift = 10px)')}</li>
          <li><kbd>,</kbd> <kbd>.</kbd> {L('ถอย/เดินหน้า 1 เฟรม', 'Step 1 frame')}</li><li>{L('ลากป้ายชื่อช่องตัวเลข = ปรับค่า', 'Drag a number label to scrub')}</li>
          <li>{L('ลากบล็อกไปทับบล็อกอื่น = สลับ/แทรก (Alt = วางอิสระ)', 'Drop a block on another = swap/insert (Alt = free)')}</li>
          <li><kbd>Shift</kbd>/<kbd>Ctrl</kbd>+{L('คลิกบล็อก = เลือกหลายอัน · ลากบนที่ว่างในแถว = ลากกรอบเลือก · ลากบล็อกในกลุ่ม = ย้ายพร้อมกัน', 'click a block = multi-select · drag on empty lane = box select · drag a selected block = move them together')}</li>
        </ul>
      </Section>
    </>
  )
}

function ActorInspector({ a }: { a: Actor }) {
  const rt = assets.get(a.assetId)
  const st = assets.statusOf(a.assetId)
  const def = useStore(s => s.scene.assets.find(d => d.id === a.assetId))
  const groundY = useStore(s => s.scene.groundY)
  const set = (p: Partial<Actor>, h = true) => patchActor(a.id, p, h)
  const isRanger = def?.type === 'ranger'
  const ranger = rt?.kind === 'ranger' ? rt : null
  const sub = def?.type === 'ranger' ? (def.source === 'lerico' ? `${def.rangerId} · ${def.form}` : L('อัปโหลด SAM', 'Uploaded SAM')) : def?.type
  return (
    <>
      <Header title={a.name} sub={sub} color={a.tag === 'enemy' ? '#ff5470' : a.tag === 'ally' ? '#33e1ff' : '#b47cff'} actions={<>
        <button className="ibtn" title={L('ขึ้นเลเยอร์', 'Bring forward')} onClick={() => moveLayer(a.id, 1)}><Icon name="up" /></button>
        <button className="ibtn" title={L('ลงเลเยอร์', 'Send backward')} onClick={() => moveLayer(a.id, -1)}><Icon name="down" /></button>
        <button className="ibtn" title={L('ทำซ้ำ (Ctrl+D)', 'Duplicate (Ctrl+D)')} onClick={duplicateSelection}><Icon name="copy" /></button>
        <button className="ibtn danger" title={L('ลบ (Del)', 'Delete (Del)')} onClick={deleteSelection}><Icon name="trash" /></button>
      </>} />
      {ranger?.thumb && <div className="insp-thumb"><img src={ranger.thumb} alt="" /></div>}
      {st?.state === 'loading' && <div className="loading-line">{L('กำลังโหลดไฟล์…', 'Loading files…')}</div>}
      {st?.state === 'error' && <div className="error-box">{st.error}</div>}
      <Section title={L('ทั่วไป', 'General')}>
        <Text label={L('ชื่อ', 'Name')} value={a.name} onChange={v => set({ name: v })} />
        <Seg value={a.tag} onChange={v => { set(isRanger && v !== 'prop' ? { tag: v, flip: facingFor(v) } : { tag: v }); updateScene(dropSameSideTargets, false) }} options={[
          { value: 'ally', label: <><Icon name="shield" size={13} /> {L('ฝ่ายเรา', 'Ally')}</> },
          { value: 'enemy', label: <><Icon name="skull" size={13} /> {L('ศัตรู/เป้า', 'Enemy')}</> },
          { value: 'prop', label: <><Icon name="sparkle" size={13} /> {L('ประกอบ', 'Prop')}</> },
        ]} />
        <Row>
          <Num label="X" value={a.x} onChange={(v, h) => set({ x: v }, h)} />
          <Num label="Y" value={a.y} onChange={(v, h) => set({ y: v }, h)} />
        </Row>
        <Slider label={L('ขนาด', 'Scale')} value={a.scale} min={0.1} max={4} step={0.01} onChange={(v, h) => set({ scale: v }, h)} fmt={v => '×' + v.toFixed(2)} />
        <Slider label={L('ทึบแสง', 'Opacity')} value={a.opacity} min={0} max={1} onChange={(v, h) => set({ opacity: v }, h)} fmt={v => Math.round(v * 100) + '%'} />
        {!isRanger && <Slider label={L('หมุน', 'Rotate')} value={a.rotation} min={-180} max={180} step={1} onChange={(v, h) => set({ rotation: v }, h)} fmt={v => v + '°'} />}
        <Row>
          <button className={'btn' + (a.flip ? ' on' : '')} onClick={() => set({ flip: !a.flip })}><Icon name="flip" /> {L('กลับด้าน', 'Flip')}</button>
          <button className={'btn' + (a.locked ? ' on' : '')} onClick={() => set({ locked: !a.locked })}><Icon name={a.locked ? 'lock' : 'unlock'} /> {L('ล็อก', 'Lock')}</button>
        </Row>
        <Select label={L('โหมดผสมสี', 'Blend mode')} value={a.blend} options={blends()} onChange={v => set({ blend: v })} />
        {isRanger && <button className="btn ghost small" onClick={() => set({ y: groundY })}>{L('วางบนเส้นพื้น', 'Snap to ground')}</button>}
      </Section>
      {ranger && <RangerLayers a={a} rt={ranger} />}
      {ranger && <PartsPanel a={a} rt={ranger} />}
      {ranger && <RangerClips a={a} rt={ranger} />}
      {!isRanger && (
        <Section title={L('การเล่นสื่อ', 'Media playback')}>
          <Toggle label={L('เล่นวน', 'Loop')} value={a.loop} onChange={v => set({ loop: v })} />
          <Slider label={L('ความเร็ว', 'Speed')} value={a.speed} min={0.1} max={4} step={0.05} onChange={(v, h) => set({ speed: v }, h)} fmt={v => '×' + v.toFixed(2)} />
          {def?.type === 'video' && <Toggle label={L('ปิดเสียงวิดีโอ', 'Mute video')} value={a.muted} onChange={v => set({ muted: v })} />}
          <div className="muted small">{L('ใส่คิว “ปรากฏ” เพื่อให้สื่อนี้โผล่เฉพาะช่วงเวลา (เช่นเอฟเฟกต์ GIF ตอนกดสกิล)', 'Add a “Visible” cue so this media only shows during that time (e.g. a GIF effect on a skill)')}</div>
          <button className="btn" onClick={() => addCue('show', a.id)}><Icon name="eye" /> {L('เพิ่มช่วงปรากฏ', 'Add visible range')}</button>
        </Section>
      )}
    </>
  )
}

function RangerClips({ a, rt }: { a: Actor; rt: RangerRuntime }) {
  const presets = skillPresets(rt)
  return (
    <>
      <Section title={L('สกิล / โจมตี', 'Skills / attacks')} accent="#ffb238">
        <div className="chip-grid">
          {presets.map(p => (
            <button key={p.key} className="chip skill big" onClick={() => addSkill(a.id, p.key)}>
              <Icon name="bolt" size={13} /> {p.label}
              <small>{p.set ?? L('ไม่มีกระสุน', 'no bullet')}</small>
            </button>
          ))}
          {!presets.length && <span className="muted small">{L('ไม่พบท่าโจมตีในไฟล์นี้', 'No attack clips found')}</span>}
        </div>
        <div className="muted small">{L('ชุดเอฟเฟกต์ในไฟล์', 'Effect sets')}: {rt.setKeys.length ? rt.setKeys.join(', ') : '—'}{rt.pending.size ? L(' (กำลังโหลด…)', ' (loading…)') : ''}</div>
      </Section>
      <Section title={L(`ท่าทางทั้งหมด (${rt.clips.length})`, `All clips (${rt.clips.length})`)} accent="#4aa8ff">
        <Select label={L('ท่ายืนพื้นฐาน', 'Idle clip')} value={a.idleClip in rt.sam.animations ? a.idleClip : rt.idle} options={rt.clips} onChange={v => patchActor(a.id, { idleClip: v })} />
        <div className="muted small">{L('กดท่าเพื่อเพิ่มลงไทม์ไลน์ ณ หัวอ่าน', 'Click a clip to add it at the playhead')}</div>
        <div className="clip-grid">
          {rt.clips.map(c => (
            <button key={c} className="clip" onClick={() => addCue('anim', a.id, c)} title={L(`${rt.sam.animations[c].length} เฟรม`, `${rt.sam.animations[c].length} frames`)}>
              {c}<small>{(rt.sam.animations[c].length / rt.fps).toFixed(1)}s</small>
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

// ====================================================
function CueInspector({ c }: { c: Cue }) {
  const scene = useStore(s => s.scene)
  const actor = scene.actors.find(a => a.id === c.actorId)
  const tl = timelineOf(scene)
  const dur = tl.dur.get(c.id) ?? 0
  const sub = actor?.name ?? (c.type === 'camera' ? L('กล้อง', 'Camera') : c.type === 'sound' ? L('แทร็กเสียง', 'Sound track') : '')
  return (
    <>
      <Header title={`${cueLabel(c.type)}${c.type === 'skill' ? ' · ' + c.label : c.type === 'anim' ? ' · ' + c.clip : ''}`} sub={sub} color={cueColor[c.type]} actions={<>
        <button className="ibtn" title={L('ไปที่จุดเริ่มคิว', 'Go to cue start')} onClick={() => { setState({ playing: false }); setTime(c.start) }}><Icon name="first" /></button>
        <button className="ibtn" title={L('ทำซ้ำ', 'Duplicate')} onClick={duplicateSelection}><Icon name="copy" /></button>
        <button className="ibtn danger" title={L('ลบ', 'Delete')} onClick={deleteSelection}><Icon name="trash" /></button>
      </>} />
      <Section title={L('เวลา', 'Timing')}>
        <Row>
          <Num label={L('เริ่ม', 'Start')} unit={L('วิ', 's')} value={c.start} step={0.01} min={0} onChange={(v, h) => patchCue(c.id, k => { k.start = v }, h)} />
          <div className="readout">{L('ยาว', 'Length')} <b>{dur.toFixed(2)}</b> {L('วิ', 's')}</div>
        </Row>
      </Section>
      {c.type === 'anim' && <AnimFields c={c} />}
      {c.type === 'move' && <MoveFields c={c} />}
      {c.type === 'show' && <ShowFields c={c} />}
      {c.type === 'camera' && <CameraFields c={c} />}
      {c.type === 'skill' && <SkillFields c={c} />}
      {c.type === 'sound' && <SoundFields c={c} />}
      {c.type === 'range' && <RangeFields c={c} />}
      {c.type === 'info' && <InfoFields c={c} />}
    </>
  )
}

function useRanger(actorId: string) {
  const scene = useStore(s => s.scene)
  const a = scene.actors.find(x => x.id === actorId)
  const rt = a && assets.get(a.assetId)
  return rt?.kind === 'ranger' ? rt : null
}

function AnimFields({ c }: { c: AnimCue }) {
  const rt = useRanger(c.actorId)
  const p = (fn: (k: AnimCue) => void, h = true) => patchCue<AnimCue>(c.id, fn, h)
  return (
    <Section title={L('ท่าทาง', 'Animation')} accent={cueColor.anim}>
      <Select label={L('ท่า', 'Clip')} value={c.clip} options={rt?.clips ?? [c.clip]} onChange={v => p(k => { k.clip = v })} />
      <Slider label={L('ความเร็ว', 'Speed')} value={c.speed} min={0.1} max={4} step={0.05} onChange={(v, h) => p(k => { k.speed = v }, h)} fmt={v => '×' + v.toFixed(2)} />
      <Toggle label={L('เล่นวนตามระยะเวลา', 'Loop for a duration')} value={c.loop} onChange={v => p(k => { k.loop = v })} />
      {c.loop && <Num label={L('ระยะเวลา', 'Duration')} unit={L('วิ', 's')} step={0.1} min={0.1} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />}
    </Section>
  )
}

function MoveFields({ c }: { c: MoveCue }) {
  const rt = useRanger(c.actorId)
  const p = (fn: (k: MoveCue) => void, h = true) => patchCue<MoveCue>(c.id, fn, h)
  return (
    <Section title={L('เคลื่อนที่', 'Move')} accent={cueColor.move}>
      <div className="muted small">{L('ลากจุดสีเขียวบนเวทีเพื่อกำหนดปลายทาง', 'Drag the green point on stage to set the destination')}</div>
      <Row>
        <Num label={L('ไป X', 'To X')} value={c.to.x} onChange={(v, h) => p(k => { k.to.x = v }, h)} />
        <Num label={L('ไป Y', 'To Y')} value={c.to.y} onChange={(v, h) => p(k => { k.to.y = v }, h)} />
      </Row>
      <Num label={L('ระยะเวลา', 'Duration')} unit={L('วิ', 's')} step={0.05} min={0.05} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />
      <Select label={L('จังหวะ', 'Easing')} value={c.ease} options={eases()} onChange={v => p(k => { k.ease = v })} />
      <Select label={L('ท่าระหว่างเดิน', 'Clip while moving')} value={c.clip ?? ''} options={[{ value: '', label: L('— (ใช้ท่าปัจจุบัน)', '— (keep current)') }, ...(rt?.clips ?? []).map(x => ({ value: x, label: x }))]} onChange={v => p(k => { k.clip = v || null })} />
    </Section>
  )
}

function ShowFields({ c }: { c: ShowCue }) {
  const p = (fn: (k: ShowCue) => void, h = true) => patchCue<ShowCue>(c.id, fn, h)
  return (
    <Section title={L('ช่วงที่ปรากฏ', 'Visible range')} accent={cueColor.show}>
      <Num label={L('ระยะเวลา', 'Duration')} unit={L('วิ', 's')} step={0.05} min={0.05} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />
      <Row>
        <Num label={L('เฟดเข้า', 'Fade in')} unit={L('วิ', 's')} step={0.05} min={0} value={c.fadeIn} onChange={(v, h) => p(k => { k.fadeIn = v }, h)} />
        <Num label={L('เฟดออก', 'Fade out')} unit={L('วิ', 's')} step={0.05} min={0} value={c.fadeOut} onChange={(v, h) => p(k => { k.fadeOut = v }, h)} />
      </Row>
      <div className="muted small">{L('สื่อ/ตัวละครที่มีคิวนี้ จะมองเห็นเฉพาะในช่วงคิวเท่านั้น และวิดีโอ/GIF จะเริ่มเล่นจากต้นทุกครั้ง', 'Actors with this cue are only visible inside it, and videos/GIFs restart from the beginning each time')}</div>
    </Section>
  )
}

function CameraFields({ c }: { c: CameraCue }) {
  const scene = useStore(s => s.scene)
  const p = (fn: (k: CameraCue) => void, h = true) => patchCue<CameraCue>(c.id, fn, h)
  return (
    <Section title={L('กล้อง', 'Camera')} accent={cueColor.camera}>
      <div className="muted small">{L('ลากกรอบสีชมพูบนเวทีเพื่อเลื่อนกล้อง', 'Drag the pink frame on stage to move the camera')}</div>
      <Slider label={L('ซูม', 'Zoom')} value={c.zoom} min={0.5} max={4} step={0.01} onChange={(v, h) => p(k => { k.zoom = v }, h)} fmt={v => '×' + v.toFixed(2)} />
      <Row>
        <Num label="X" value={c.center.x} onChange={(v, h) => p(k => { k.center.x = v }, h)} />
        <Num label="Y" value={c.center.y} onChange={(v, h) => p(k => { k.center.y = v }, h)} />
      </Row>
      <Num label={L('เวลาเลื่อน', 'Pan time')} unit={L('วิ', 's')} step={0.05} min={0} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />
      {/* ซูมเสร็จพร้อมเลื่อน (ค่าเริ่มต้น) หรือแยกเวลาซูมเอง — สั้นกว่า = ซูมเสร็จก่อน · ยาวกว่า = ซูมเสร็จทีหลัง */}
      <Toggle label={L('ซูมเสร็จพร้อมการเลื่อน', 'Zoom finishes with the pan')} value={c.zoomDuration == null}
        onChange={v => p(k => { k.zoomDuration = v ? null : k.duration })} />
      {c.zoomDuration != null && (
        <>
          <Num label={L('เวลาซูม', 'Zoom time')} unit={L('วิ', 's')} step={0.05} min={0} value={c.zoomDuration} onChange={(v, h) => p(k => { k.zoomDuration = v }, h)} />
          <div className="muted small">{c.zoomDuration < c.duration ? L('ซูมเสร็จก่อนการเลื่อน', 'Zoom finishes before the pan') : c.zoomDuration > c.duration ? L('การเลื่อนเสร็จก่อนการซูม', 'Pan finishes before the zoom') : L('เสร็จพร้อมกัน', 'Both finish together')}</div>
        </>
      )}
      <Select label={L('จังหวะ', 'Easing')} value={c.ease} options={eases()} onChange={v => p(k => { k.ease = v })} />
      <Row>
        <button className="btn small" onClick={() => p(k => { k.zoom = 1; k.center = { x: scene.width / 2, y: scene.height / 2 } })}>{L('รีเซ็ตมุมกล้อง', 'Reset view')}</button>
        {scene.actors.length > 0 && <Select value="" options={[{ value: '', label: L('โฟกัสที่…', 'Focus on…') }, ...scene.actors.map(a => ({ value: a.id, label: a.name }))]}
          onChange={id => { const a = scene.actors.find(x => x.id === id); if (a) p(k => { k.center = { x: a.x, y: a.y - 90 * a.scale } }) }} />}
      </Row>
    </Section>
  )
}

// ── เสียง ──
function SoundFields({ c }: { c: SoundCue }) {
  const scene = useStore(s => s.scene)
  const def = scene.assets.find(d => d.id === c.assetId)
  const rt = assets.get(c.assetId)
  const len = rt?.kind === 'audio' ? rt.duration : 0
  const p = (fn: (k: SoundCue) => void, h = true) => patchCue<SoundCue>(c.id, fn, h)
  const audios = scene.assets.filter(d => d.type === 'audio')
  return (
    <Section title={L('เสียง', 'Sound')} accent={cueColor.sound}>
      <Select label={L('ไฟล์เสียง', 'Audio file')} value={c.assetId} options={audios.map(d => ({ value: d.id, label: d.name }))} onChange={v => p(k => { k.assetId = v })} />
      <Row>
        <button className="btn small" onClick={() => def && 'url' in def && previewSound(def.url)}><Icon name="play" size={13} /> {L('ฟังตัวอย่าง', 'Preview')}</button>
        <span className="muted small">{len ? L(`ยาว ${len.toFixed(2)} วิ`, `${len.toFixed(2)} s long`) : ''}</span>
      </Row>
      <Slider label={L('ความดัง', 'Volume')} value={c.volume} min={0} max={2} step={0.01} onChange={(v, h) => p(k => { k.volume = v }, h)} fmt={v => Math.round(v * 100) + '%'} />
      <Num label={L('เริ่มจากวินาที', 'Start offset')} unit={L('วิ', 's')} step={0.01} min={0} max={len || undefined} value={c.offset} onChange={(v, h) => p(k => { k.offset = v }, h)} />
      <Toggle label={L('เล่นจนจบไฟล์', 'Play to the end')} value={c.duration <= 0} onChange={v => p(k => { k.duration = v ? 0 : Math.max(0.1, +(len - k.offset).toFixed(2)) })} />
      {c.duration > 0 && <Num label={L('ตัดความยาว', 'Trim length')} unit={L('วิ', 's')} step={0.05} min={0.05} value={c.duration} onChange={(v, h) => p(k => { k.duration = v }, h)} />}
      <Row>
        <Num label={L('เฟดเข้า', 'Fade in')} unit={L('วิ', 's')} step={0.05} min={0} value={c.fadeIn} onChange={(v, h) => p(k => { k.fadeIn = v }, h)} />
        <Num label={L('เฟดออก', 'Fade out')} unit={L('วิ', 's')} step={0.05} min={0} value={c.fadeOut} onChange={(v, h) => p(k => { k.fadeOut = v }, h)} />
      </Row>
    </Section>
  )
}

// ── สกิล ──
function SkillFields({ c }: { c: SkillCue }) {
  const scene = useStore(s => s.scene)
  const time = useStore(s => s.time)
  const rt = useRanger(c.actorId)
  const fileRef = useRef<HTMLInputElement>(null)
  const p = (fn: (k: SkillCue) => void, h = true) => patchSkill(c.id, fn, h)
  // ห้ามตีฝั่งเดียวกัน (ฝ่ายเรา ↔ ศัตรู) — ตัวประกอบเป็นเป้าได้ทุกฝั่ง
  const caster = scene.actors.find(a => a.id === c.actorId)
  const targets = scene.actors.filter(a => (caster ? canTarget(caster, a) : a.id !== c.actorId))
  const fx = c.fx
  const target = scene.actors.find(a => a.id === c.targetId)
  const targetRt = target && assets.get(target.assetId)
  const bullet = fx && rt ? rt.bullets[fx.set] : undefined
  const st = timelineOf(scene).skill.get(c.id)
  const preset = rt ? skillPresets(rt).find(x => x.release === c.release) : undefined
  const gameSpeed = preset?.move?.speed ? Math.round(preset.move.speed * GAME_SPEED_TO_PXS) : null
  const audios = scene.assets.filter(d => d.type === 'audio')
  const s = L('วิ', 's')
  // กฎของเกม (ล็อคเป้า · Self · วง Area · ท่าพุ่ง) — ชุดเดียวกับตัวเล่นอนิเมชั่นเรนเจอร์
  const rules = cueRules(scene, c)
  const canGame = hasGameRules(preset?.move)
  const kind = presetSoundKind(preset?.key)
  const locked = rules.game ? cueTarget(scene, c) : null
  /** กระสุนเริ่มต้น: กฎของเกม → ตามเกม (null = ท่านี้ไม่มีกระสุนในเกม) · ปิด → แบบกำหนดเองจากข้อมูลเกม */
  const freshFx = () => (rt && rules.game && canGame ? gameFx(rt, kind, preset?.move ?? null)
    : rt ? fxFromGameData(rt, preset?.set ?? rt.setKeys[0] ?? 'bul', preset?.move ?? null, kind) : defaultFx('bul'))

  /** เฟรม ณ หัวอ่าน (นับจากต้นท่าร่าย) — ปุ่ม "ใช้เฟรมหัวอ่าน" */
  const frameAtPlayhead = () => {
    if (!st) return 0
    if (time <= st.castStart) return 0
    if (time < st.releaseAt) return Math.round(st.castDur > 0 ? ((time - st.castStart) / st.castDur) * st.castFrames : 0)
    return Math.round(st.castFrames + (time - st.releaseAt) * st.fps)
  }

  return (
    <>
      <Section title={L('ท่าของผู้ร่าย', 'Caster motion')} accent={cueColor.skill}>
        <Text label={L('ชื่อสกิล', 'Skill name')} value={c.label} onChange={v => p(k => { k.label = v })} />
        <div className="field-label">{L('ช่วงร่าย (เล่นต่อกัน)', 'Cast clips (in order)')}</div>
        <div className="clip-pick">
          {c.cast.map((n, i) => (
            <span key={i} className="pill">{n}<button onClick={() => p(k => { k.cast.splice(i, 1) })}><Icon name="x" size={11} /></button></span>
          ))}
          <select className="mini-sel" value="" onChange={e => { const v = e.target.value; if (v) p(k => { k.cast.push(v) }) }}>
            <option value="">+ {L('เพิ่ม', 'Add')}</option>
            {(rt?.clips ?? []).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <Select label={L('ท่าปล่อย', 'Release clip')} value={c.release} options={rt?.clips ?? [c.release]} onChange={v => p(k => { k.release = v })} />
        <Slider label={L('ความเร็ว', 'Speed')} value={c.speed} min={0.1} max={4} step={0.05} onChange={(v, h) => p(k => { k.speed = v }, h)} fmt={v => '×' + v.toFixed(2)} />
        <Row>
          <Toggle label={L('เพดานเวลาร่าย', 'Cast time cap')} value={c.castSpeedCap != null} onChange={v => p(k => { k.castSpeedCap = v ? +(Math.max(0.1, (st?.castDur ?? 1) * 0.6)).toFixed(2) : null })} />
          {c.castSpeedCap != null && <Num unit={s} step={0.05} min={0.05} value={c.castSpeedCap} onChange={(v, h) => p(k => { k.castSpeedCap = v }, h)} width={110} />}
        </Row>
        {st && (
          <div className="timing-bar">
            {st.walk > 0 && <span className="tb walk">{L('เดิน', 'Walk')} {st.walk.toFixed(2)}</span>}
            <span className="tb cast">{L('ร่าย', 'Cast')} {st.castDur.toFixed(2)}</span>
            <span className="tb rel">{L('ปล่อย', 'Release')} @{st.launchAt.toFixed(2)}</span>
            {st.shots[0] && <span className="tb hit">{L('กระทบ', 'Impact')} @{st.shots[0].impactAt.toFixed(2)}</span>}
          </div>
        )}
      </Section>

      <Section title={L('เดินเข้าหาเป้าก่อนร่าย', 'Walk to target first')} accent="#ff9d3d" defaultOpen={c.approach.enabled}
        right={<Toggle label="" value={c.approach.enabled} onChange={v => p(k => { k.approach.enabled = v })} />}>
        {!target && <div className="muted small">{L('ต้องเลือกเป้าหมายก่อน', 'Pick a target first')}</div>}
        {c.approach.enabled && <>
          <div className="muted small">{L('ลากจุด ■ สีส้มบนเวทีเพื่อตั้งจุดหยุด (เทียบเท้าเป้า · X ติดลบ = หยุดหน้าเป้า)', 'Drag the orange ■ on stage to set the stop point (relative to the target’s feet · negative X = in front)')}</div>
          <Row>
            <Num label={L('หยุด X', 'Stop X')} value={c.approach.stopOffset.x} onChange={(v, h) => p(k => { k.approach.stopOffset.x = v }, h)} />
            <Num label="Y" value={c.approach.stopOffset.y} onChange={(v, h) => p(k => { k.approach.stopOffset.y = v }, h)} />
          </Row>
          <Slider label={L('ความเร็วเดิน', 'Walk speed')} value={c.approach.speed} min={100} max={3000} step={10} onChange={(v, h) => p(k => { k.approach.speed = v }, h)} fmt={v => v + ' px/s'} />
          <Toggle label={L('ตีเสร็จแล้วเดินกลับที่เดิม', 'Walk back home afterwards')} value={c.approach.returnHome} onChange={v => p(k => { k.approach.returnHome = v })} />
        </>}
      </Section>

      <Section title={L('เป้าหมาย', 'Target')} accent="#ff5470">
        <Toggle label={L('กฎของเกม (ล็อคเป้า · วง Area · ท่าพุ่ง)', 'Game rules (lock-on · area · dash)')} value={rules.game}
          hint={L('ทำงานแบบในเกม (ถอดจาก libgame.so) — ชุดเดียวกับตัวเล่นอนิเมชั่นเรนเจอร์', 'Behaves like the game (from libgame.so) — same rules as the ranger animation player')}
          onChange={v => p(k => {
            k.game = v
            if (!k.fx) return
            if (!v) delete k.fx.game
            else if (canGame && preset?.move) k.fx.game = gameProjectileOf(preset.move)
          })} />
        {rules.game && <div className="muted small">
          {rules.self ? (fx ? L('สกิล Self — เกมตั้งเป้าเป็นตัวผู้ร่ายเอง กระสุนบินกลับมาลงตัวเอง', 'Self skill — the game targets the caster, so the bullet lands on itself')
              : L('สกิล Self — เกมตั้งเป้าเป็นตัวผู้ร่ายเอง', 'Self skill — the game targets the caster'))
            : rules.basis === 'rear' ? L(`ล็อคศัตรูตัวไกลสุดในระยะโจมตี × ${rules.rearMul}`, `Locks the farthest enemy within attack range × ${rules.rearMul}`)
            : L('ล็อคศัตรูตัวใกล้สุดในระยะโจมตี ณ จังหวะปล่อย', 'Locks the nearest enemy in attack range at release')}
          {rules.dashPx > 0 && <> · {L(`พุ่งไปข้างหน้า ${Math.round(rules.dashPx / 2 / (caster?.scale ?? 1))} pt (ข้ามศัตรูได้)`, `Dashes ${Math.round(rules.dashPx / 2 / (caster?.scale ?? 1))} pt forward (jumps over enemies)`)}</>}
          {rules.areaPx > 0 && !rules.buff && <> · {L(`วง Area ±${Math.round(rules.areaPx / 2 / (caster?.scale ?? 1))} pt — ทุกตัวในวงโดน`, `Area ±${Math.round(rules.areaPx / 2 / (caster?.scale ?? 1))} pt — everyone inside is hit`)}</>}
          {rules.buff && <> · {L('บัฟ — ไม่มีศัตรูโดน', 'Buff — no enemy is hit')}</>}
        </div>}
        <Select label={rules.game ? L('เป้าสำรอง (ไม่มีศัตรูในระยะ)', 'Fallback target (no enemy in range)') : L('เป้าหมาย', 'Target')} value={c.targetId ?? ''} options={[{ value: '', label: L('— ไม่มี (ยิงไปข้างหน้า)', '— none (shoot forward)') }, ...targets.map(a => ({ value: a.id, label: `${a.tag === 'enemy' ? L('[ศัตรู]', '[Enemy]') : a.tag === 'ally' ? L('[ฝ่ายเรา]', '[Ally]') : L('[ประกอบ]', '[Prop]')} ${a.name}` }))]}
          onChange={v => p(k => { k.targetId = v || null })} />
        {rules.game && !rules.self && <div className="muted small">
          {locked ? L(`เกมล็อค: ${locked.name}`, `Game locks: ${locked.name}`) : L('ไม่มีศัตรูในระยะ', 'No enemy in range')}
        </div>}
        {(target || (rules.game && !rules.buff)) && <>
          <Toggle label={L('เป้าเล่นท่าโดนตี', 'Target plays hit clip')} value={c.hitReact} onChange={v => p(k => { k.hitReact = v })} />
          {c.hitReact && targetRt?.kind === 'ranger' && <Select label={L('ท่าโดนตี', 'Hit clip')} value={c.hitClip} options={targetRt.clips} onChange={v => p(k => { k.hitClip = v })} />}
          <Toggle label={L('เป้ากะพริบขาวตอนโดน', 'Target flashes white on hit')} value={c.flash} onChange={v => p(k => { k.flash = v })} />
        </>}
      </Section>

      <Section title={L('กระสุน / เอฟเฟกต์', 'Projectile / effect')} accent="#33e1ff" right={
        <Toggle label="" value={!!fx} onChange={v => p(k => {
          k.fx = !v ? null : freshFx() ?? (rt ? fxFromGameData(rt, preset?.set ?? rt.setKeys[0] ?? 'bul', preset?.move ?? null, kind) : defaultFx('bul'))
        })} />
      }>
        {!fx && <div className="muted small">{rules.game && canGame && !gameFx(rt!, kind, preset?.move ?? null)
          ? L(`ท่านี้ไม่มีกระสุนในเกม (${preset?.move?.attackType ?? '—'}) — เป้าโดนตอนช่วงเตรียมจบ`, `No projectile in the game for this move (${preset?.move?.attackType ?? '—'}) — the target is hit when the ready clip ends`)
          : L('ปิดอยู่ — ท่าจะไม่มีเอฟเฟกต์ (เป้าโดนที่เฟรมปล่อย)', 'Off — no effect (target is hit at the release frame)')}</div>}
        {fx && <>
          <Row>
            <Select label={L('ไฟล์กระสุน', 'Bullet file')} value={fx.set} options={(rt?.setKeys.length ? [...new Set([...rt.setKeys, fx.set])] : [fx.set]).map(x => ({ value: x, label: x }))}
              onChange={v => p(k => { k.fx!.set = v; const b = rt?.bullets[v]; if (b) { k.fx!.flight = b.flight; k.fx!.finish = b.finish } })} />
            {rt && <button className="btn small" style={{ alignSelf: 'flex-end' }} title={L('ตั้งค่าทั้งหมดตามข้อมูลเกม (projectile_data)', 'Reset everything from game data (projectile_data)')}
              onClick={() => p(k => { k.fx = { ...(freshFx() ?? fxFromGameData(rt, k.fx!.set, preset?.move ?? null, kind)), scale: k.fx!.scale, blend: k.fx!.blend } })}><Icon name="reset" size={13} /> {L('ข้อมูลเกม', 'Game data')}</button>}
          </Row>
          {rt && !rt.bullets[fx.set] && !rt.pending.has(fx.set) && (fx.game
            ? <div className="muted small">{L(`ไม่มีไฟล์ “${fx.set}” — ในเกมกระสุนนี้มองไม่เห็น แต่ยังบินและโดนตามเวลาบิน`, `No “${fx.set}” file — in the game this bullet is invisible but still flies and hits on time`)}</div>
            : <div className="error-box small">{L(`ไม่พบชุด “${fx.set}” ในเรนเจอร์นี้`, `Set “${fx.set}” not found in this ranger`)}</div>)}

          <Toggle label={L('วิถีแบบเกม (จุดปล่อย · เป้า · เวลาบิน · โค้ง)', 'Game trajectory (muzzle · aim · flight time · curve)')} value={!!fx.game}
            onChange={v => p(k => { if (!v) delete k.fx!.game; else if (preset?.move) k.fx!.game = gameProjectileOf(preset.move) })} />
          {fx.game && <div className="muted small">
            {fx.game.motion === 'CURVE' ? L('โค้ง (CCBezierBy)', 'Curve (CCBezierBy)') : L('เส้นตรง (CCMoveBy)', 'Straight (CCMoveBy)')}
            {' · '}{L('จุดปล่อย', 'muzzle')} ({fx.game.start.x}, {fx.game.start.y})
            {' · '}{fx.game.moveSpeed > 0 ? L(`ความเร็ว ${fx.game.moveSpeed}`, `speed ${fx.game.moveSpeed}`) : L('วาร์ปถึงเป้าทันที', 'warps to the target')}
            {' · '}hitPointRate {fx.game.hitRate}
            {fx.game.motion === 'CURVE' && <> · {L('มุม', 'angle')} {fx.game.angle.start}° → {fx.game.angle.end}°</>}
          </div>}

          {!fx.game && <>
          <div className="field-label">{L('วิธีไปถึงเป้า', 'Delivery')}</div>
          <Seg<FxMode> value={fx.mode} onChange={v => p(k => { k.fx!.mode = v; if (v === 'point' && target) k.fx!.point = { x: target.x, y: target.y - 60 } })} options={[
            { value: 'projectile', label: <><Icon name="arrow" size={13} /> {L('บินไปหา', 'Fly')}</>, title: L('กระสุนบินจากจุดปล่อยไปยังเป้า แล้วระเบิดที่เป้า', 'Flies from the muzzle to the target, then bursts') },
            { value: 'target', label: <><Icon name="target" size={13} /> {L('ที่เป้า', 'At target')}</>, title: L('เกิดที่ตัวเป้าเลย เล่น normal ครบแล้วค่อยระเบิด (ท่าตกจากฟ้า/ทุบพื้น)', 'Spawns on the target, plays normal then finish (sky drops / ground slams)') },
            { value: 'caster', label: <><Icon name="user" size={13} /> {L('ที่ตัวเอง', 'At caster')}</>, title: L('เอฟเฟกต์เกิดรอบตัวผู้ร่าย (บัฟ/ออร่า)', 'Around the caster (buffs/auras)') },
            { value: 'point', label: <><Icon name="pin" size={13} /> {L('จุดกำหนด', 'Point')}</>, title: L('ลากวางตำแหน่งบนเวทีเอง', 'Place it on stage yourself') },
          ]} />
          <Row>
            <Select label={L('คลิปบิน (normal)', 'Flight clip')} value={fx.flight ?? ''} options={[{ value: '', label: '—' }, ...(bullet?.clips ?? []).map(x => ({ value: x, label: x }))]} onChange={v => p(k => { k.fx!.flight = v || null })} />
            <Select label={L('คลิประเบิด (finish)', 'Burst clip')} value={fx.finish ?? ''} options={[{ value: '', label: '—' }, ...(bullet?.clips ?? []).map(x => ({ value: x, label: x }))]} onChange={v => p(k => { k.fx!.finish = v || null })} />
          </Row>
          </>}

          <div className="sub-head">{L('จังหวะปล่อย', 'Release timing')}</div>
          <Row>
            <Toggle label={L('เฟรมปล่อยอัตโนมัติ', 'Auto release frame')} value={fx.releaseFrame == null} onChange={v => p(k => { k.fx!.releaseFrame = v ? null : (st?.autoReleaseFrame ?? 0) })} />
            {fx.releaseFrame == null && st && <span className="muted small">= {st.autoReleaseFrame}</span>}
          </Row>
          {fx.releaseFrame != null && <Row>
            <Num label={L('เฟรม', 'Frame')} step={1} min={0} value={fx.releaseFrame} onChange={(v, h) => p(k => { k.fx!.releaseFrame = Math.round(v) }, h)} title={L('นับจากต้นท่าร่าย', 'Counted from the start of the cast')} />
            <button className="btn small" onClick={() => p(k => { k.fx!.releaseFrame = frameAtPlayhead() })} title={L('ใช้เฟรมที่หัวอ่านอยู่ตอนนี้', 'Use the frame under the playhead')}>{L('ใช้เฟรมหัวอ่าน', 'Use playhead')} ({frameAtPlayhead()})</button>
          </Row>}
          <Row>
            <Num label={L('หน่วงเพิ่ม', 'Extra delay')} unit={s} step={0.01} value={fx.delay} onChange={(v, h) => p(k => { k.fx!.delay = v }, h)} />
            <Num label={L('ลูก', 'Shots')} step={1} min={1} max={30} value={fx.repeat} onChange={(v, h) => p(k => { k.fx!.repeat = Math.round(v) }, h)} width={96} />
          </Row>
          {fx.repeat > 1 && <Num label={L('ห่างกัน', 'Interval')} unit={s} step={0.01} min={0} value={fx.interval} onChange={(v, h) => p(k => { k.fx!.interval = v }, h)} />}

          {!fx.game && fx.mode === 'projectile' && <>
            <div className="sub-head">{L('การบิน', 'Flight')}</div>
            <Slider label={L('ความเร็ว', 'Speed')} value={fx.speed} min={100} max={6000} step={10} onChange={(v, h) => p(k => { k.fx!.speed = v }, h)} fmt={v => v + ' px/s'} />
            {gameSpeed != null && fx.speed !== gameSpeed && <button className="btn tiny" onClick={() => p(k => { k.fx!.speed = gameSpeed })}>{L('ใช้ความเร็วจากข้อมูลเกม', 'Use game-data speed')} ({gameSpeed})</button>}
            <div className="field-label">{L('เส้นทาง', 'Path')}</div>
            <Seg value={fx.arc === 0 ? 'straight' : fx.arc == null ? 'auto' : 'custom'} onChange={v => p(k => { k.fx!.arc = v === 'straight' ? 0 : v === 'auto' ? null : 120 })} options={[
              { value: 'straight', label: L('ตรง', 'Straight') },
              { value: 'auto', label: L('โค้งอัตโนมัติ', 'Auto arc'), title: L('สูง = min(255, ระยะ² ÷ 3800) · ถ้าคลิปลอยโค้งในตัวแล้วจะไม่ซ้อน', 'Height = min(255, dist² ÷ 3800) · skipped if the clip already arcs') },
              { value: 'custom', label: L('โค้งกำหนดเอง', 'Custom arc') },
            ]} />
            {fx.arc != null && fx.arc !== 0 && <Slider label={L('ความสูงโค้ง', 'Arc height')} value={fx.arc} min={-400} max={600} step={5} onChange={(v, h) => p(k => { k.fx!.arc = v }, h)} fmt={v => v + 'px'} />}
            {fx.arc == null && bullet?.selfArc && <div className="muted small">{L('คลิปนี้ลอยโค้งในตัวอยู่แล้ว — ไม่ใส่โค้งซ้อน', 'This clip already arcs on its own — no extra arc')}</div>}
            <Toggle label={L('ยืดคลิปบินให้จบพอดีตอนถึงเป้า', 'Stretch flight clip to land on time')} value={fx.fitFlight} onChange={v => p(k => { k.fx!.fitFlight = v })} />
            <Toggle label={L('เฉียงหัวกระสุนตามทิศบิน', 'Tilt bullet along its path')} value={fx.rotate} onChange={v => p(k => { k.fx!.rotate = v })} />
            {fx.rotate && <>
              <Slider label={L('หมุนเพิ่ม', 'Extra rotation')} value={fx.rotOffset} min={-180} max={180} step={1} onChange={(v, h) => p(k => { k.fx!.rotOffset = v }, h)} fmt={v => v + '°'} />
              <Toggle label={L('ระเบิดเฉียงตามทิศตอนถึงด้วย', 'Tilt the burst too')} value={fx.rotateFinish} onChange={v => p(k => { k.fx!.rotateFinish = v })} />
            </>}
          </>}

          {!fx.game && <>
          <div className="sub-head">{L('ตำแหน่ง', 'Positions')}</div>
          {(fx.mode === 'projectile' || fx.mode === 'target') && <Seg value={fx.aim ?? 'face'} onChange={v => p(k => { k.fx!.aim = v })} options={[
            { value: 'center', label: L('เล็งกลางตัว', 'Aim: body'), title: L('กลางลำตัว (ระดับอก) — ค่าเริ่มต้นของกระสุนบิน', 'Body centre (chest) — default for flying bullets') },
            { value: 'face', label: L('จุดรับดาเมจ', 'Aim: hit point') },
            { value: 'ground', label: L('ลงพื้น', 'Aim: ground'), title: L('จุดยืนของเป้า (hitPointRate = 0)', 'Target feet (hitPointRate = 0)') },
          ]} />}
          <Seg value={fx.anchor ?? 'origin'} onChange={v => p(k => { k.fx!.anchor = v })} options={[
            { value: 'center', label: L('ยึดกลางภาพ', 'Pin: image centre'), title: L('กึ่งกลางภาพเฟรมแรกของช่วงบิน/ระเบิด — แบบตัวเล่นอนิเมชั่น', 'First-frame image centre of flight/burst — like the animation player') },
            { value: 'stand', label: L('ยึดจุดยืน', 'Pin: stand'), title: L('จุดยืนของผู้ร่ายในไฟล์ — ไฟล์บัฟ/ของตกลงพื้น', 'Caster stand point in the file — buffs / ground drops') },
            { value: 'origin', label: L('จุด 0,0', 'Pin: 0,0') },
          ]} />
          <div className="muted small">{L('ลากจุดบนเวทีได้: ● ฟ้า = จุดปล่อย · ◆ ชมพู = จุดกระทบ · ◆ ม่วง = จุดระเบิด · ■ เหลือง = จุดกำหนด', 'Drag on stage: ● cyan = muzzle · ◆ pink = impact · ◆ purple = burst · ■ yellow = point')}</div>
          {(fx.mode === 'projectile' || fx.mode === 'caster') && <Row>
            <Num label={L('ปล่อย X', 'Muzzle X')} value={fx.launch.x} onChange={(v, h) => p(k => { k.fx!.launch.x = v }, h)} />
            <Num label="Y" value={fx.launch.y} onChange={(v, h) => p(k => { k.fx!.launch.y = v }, h)} />
          </Row>}
          {(fx.mode === 'projectile' || fx.mode === 'target') && <Row>
            <Num label={L('กระทบ X', 'Impact X')} value={fx.impact.x} onChange={(v, h) => p(k => { k.fx!.impact.x = v }, h)} />
            <Num label="Y" value={fx.impact.y} onChange={(v, h) => p(k => { k.fx!.impact.y = v }, h)} />
          </Row>}
          {fx.mode === 'point' && <Row>
            <Num label="X" value={fx.point.x} onChange={(v, h) => p(k => { k.fx!.point.x = v }, h)} />
            <Num label="Y" value={fx.point.y} onChange={(v, h) => p(k => { k.fx!.point.y = v }, h)} />
          </Row>}
          {(fx.mode === 'projectile' || fx.mode === 'target') && target && <>
            <Toggle label={L('แยกจุดระเบิดจากปลายทางกระสุน', 'Separate burst point')} value={fx.finishSplit} onChange={v => p(k => { k.fx!.finishSplit = v; if (v) k.fx!.finishOffset = { ...k.fx!.impact } })} />
            {fx.finishSplit && <Row>
              <Num label={L('ระเบิด X', 'Burst X')} value={fx.finishOffset.x} onChange={(v, h) => p(k => { k.fx!.finishOffset.x = v }, h)} />
              <Num label="Y" value={fx.finishOffset.y} onChange={(v, h) => p(k => { k.fx!.finishOffset.y = v }, h)} />
            </Row>}
          </>}
          </>}

          <div className="sub-head">{L('การแสดงผล', 'Look')}</div>
          <Slider label={L('ขนาด', 'Scale')} value={fx.scale} min={0.1} max={4} step={0.01} onChange={(v, h) => p(k => { k.fx!.scale = v }, h)} fmt={v => '×' + v.toFixed(2)} />
          <Select label={L('โหมดผสมสี', 'Blend mode')} value={fx.blend} options={blends()} onChange={v => p(k => { k.fx!.blend = v })} />
        </>}
      </Section>

      <Section title={L('เสียงประกอบสกิล', 'Skill sound')} accent={cueColor.sound} defaultOpen={!!c.sound || (c.gameSounds?.length ?? 0) > 0}>
        {/* เสียงจากเกม — ใส่ให้อัตโนมัติตอนเพิ่มสกิล (ร่าย + โดน) · เปิด/ปิดทีละอันได้ */}
        {(c.gameSounds?.length ?? 0) > 0 && <>
          <div className="sub-head">{L('เสียงจากเกม', 'Game sounds')}</div>
          {c.gameSounds.map((g, i) => {
            const def = scene.assets.find(d => d.id === g.assetId)
            const on = g.enabled !== false
            const title = g.at === 'cast' ? L('เสียงร่าย (preparation)', 'Cast sound (preparation)')
              : g.at === 'impact' ? L('เสียงโดน (underAttack)', 'Hit sound (underAttack)') : L('เสียงตอนปล่อย', 'Release sound')
            return (
              <div key={i} className="game-sound">
                <Row>
                  <Toggle label={title} value={on} onChange={v => p(k => { k.gameSounds[i].enabled = v })}
                    hint={def?.name} />
                  <button className="btn small" style={{ marginLeft: 'auto' }} disabled={!def || !('url' in def)}
                    onClick={() => def && 'url' in def && previewSound(def.url)}><Icon name="play" size={13} /> {L('ฟัง', 'Play')}</button>
                </Row>
                {on && <Slider label={def?.name ?? L('ความดัง', 'Volume')} value={g.volume} min={0} max={2} step={0.01}
                  onChange={(v, h) => p(k => { k.gameSounds[i].volume = v }, h)} fmt={v => Math.round(v * 100) + '%'} />}
              </div>
            )
          })}
          <div className="sub-head">{L('เสียงเพิ่มเติม', 'Extra sound')}</div>
        </>}
        <Row>
          <Select label={L('ไฟล์เสียง', 'Audio file')} value={c.sound?.assetId ?? ''} options={[{ value: '', label: L('— ไม่มีเสียง', '— no sound') }, ...audios.map(d => ({ value: d.id, label: d.name }))]}
            onChange={v => p(k => { k.sound = v ? { assetId: v, at: k.sound?.at ?? 'release', volume: k.sound?.volume ?? 1 } : null })} />
          <button className="btn small" style={{ alignSelf: 'flex-end' }} onClick={() => fileRef.current?.click()}><Icon name="upload" size={13} /> {L('อัปโหลด', 'Upload')}</button>
        </Row>
        <input ref={fileRef} type="file" hidden accept="audio/*" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try { const r = await uploadFile(f); setSkillSound(c.id, r.url, r.name) } catch (err) { toast(String(err instanceof Error ? err.message : err), 'error') }
        }} />
        {c.sound && <>
          <Seg value={c.sound.at} onChange={v => p(k => { k.sound!.at = v })} options={[
            { value: 'cast', label: L('ตอนเริ่มร่าย', 'On cast') }, { value: 'release', label: L('ตอนปล่อย', 'On release') }, { value: 'impact', label: L('ตอนกระทบ', 'On impact') },
          ]} />
          <Slider label={L('ความดัง', 'Volume')} value={c.sound.volume} min={0} max={2} step={0.01} onChange={(v, h) => p(k => { k.sound!.volume = v }, h)} fmt={v => Math.round(v * 100) + '%'} />
        </>}
      </Section>

      <Section title={L('ป้ายชื่อสกิล', 'Skill banner')} accent="#ffd23f" defaultOpen={!!c.banner}>
        <Text label={L('ข้อความกลางจอ (เว้นว่าง = ไม่แสดง)', 'Banner text (empty = hidden)')} value={c.banner} placeholder={L('เช่น ดาบเพลิงพิฆาต!', 'e.g. Blazing Blade!')} onChange={v => p(k => { k.banner = v })} />
      </Section>
    </>
  )
}
