// ====================================================
// Library.tsx — แผงซ้าย: เรนเจอร์ (ค้นด้วย ID/ชื่อ · อัปโหลด SAM) · สื่อ (ภาพ/GIF/WebP/วิดีโอ) · ฉาก/แผนที่
// + BackgroundInspector (ใช้ในแผงขวา)
// ====================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RangerPicker, { PICKER_VIEW_DEFAULT, type PickerView } from '@/app/lobby/RangerPicker'
import { UPCOMING_RANGERS } from '@/lib/upcomingRangers'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  addLericoRanger, addMediaActor, addSoundCue, addUploadedRanger, loadNames, uploadAudio, uploadMedia, uploadSequence, type RangerName,
} from '@/anme/engine/actions'
import { previewSound } from '@/anme/engine/audio'
import { api, appUrl, importFromUrl, listUploads, recentRangers, type UploadItem, anmeFetch } from '@/anme/engine/storage'
import { L, getLang } from '@/anme/engine/i18n'
import { assets, fetchRangerListing, isAudioName, isVideoName, thumbUrl } from '@/anme/engine/assets'
import { uid } from '@/anme/engine/scene'
import { select, setState, toast, updateScene, useStore } from '@/anme/engine/store'
import type { ActorTag, BgFit } from '@/anme/engine/types'
import { useAssetsVersion } from './StageView'
import { Icon, Num, Row, Section, Seg, Select, Slider } from './widgets'

type Tab = 'rangers' | 'media' | 'maps'

export function Library() {
  const [tab, setTab] = useState<Tab>('rangers')
  useStore(s => s.lang)
  return (
    <aside className="library">
      <div className="lib-tabs">
        <button className={tab === 'rangers' ? 'on' : ''} onClick={() => setTab('rangers')}><Icon name="sparkle" size={14} /> {L('เรนเจอร์', 'Rangers')}</button>
        <button className={tab === 'media' ? 'on' : ''} onClick={() => setTab('media')}><Icon name="image" size={14} /> {L('สื่อ', 'Media')}</button>
        <button className={tab === 'maps' ? 'on' : ''} onClick={() => setTab('maps')}><Icon name="layers" size={14} /> {L('ฉาก', 'Maps')}</button>
      </div>
      <div className="lib-body">
        {tab === 'rangers' && <RangersTab />}
        {tab === 'media' && <MediaTab />}
        {tab === 'maps' && <MapsTab />}
      </div>
    </aside>
  )
}

// ── เรนเจอร์ ──
/** "โหลดแล้ว" = แคชบนดิสก์ (ตอนรันในเครื่อง) + ประวัติในเบราว์เซอร์ (ตอนออนไลน์) */
async function loadRecent(): Promise<RangerName[]> {
  const disk: RangerName[] = await anmeFetch(api('/api/library')).then(r => r.json()).then(d => d.rangers ?? []).catch(() => [])
  const names = await loadNames().catch(() => [] as RangerName[])
  const byId = new Map(names.map(n => [n.id, n]))
  const seen = new Set(disk.map(d => d.id))
  const local = recentRangers().filter(id => !seen.has(id)).map(id => byId.get(id) ?? { id, en: null, th: null })
  return [...local, ...disk]
}

// ตัวเลือกเรนเจอร์ — ใช้ RangerPicker ตัวเดียวกับหน้า /custom-gacha-ranger และ /lobby
// (ฟิลเตอร์ดาว/ร่าง/ชนิด/บทบาท/ธาตุ + ค้นชื่อ/ID) แต่เปิด allowAll = เลือกได้ทุกตัวในตาราง ไม่จำกัดดาว
// สิ่งที่ค้นค้างไว้เก็บระดับโมดูล → สลับแท็บไปมาแล้วกลับมาเจอที่เดิม
let pickerViewMemo: PickerView = PICKER_VIEW_DEFAULT

export function RangersTab() {
  const [recent, setRecent] = useState<RangerName[]>([])
  const [tag, setTag] = useState<ActorTag>('ally')
  const [form, setForm] = useState<'body' | 'e-body'>('body')
  const [picking, setPicking] = useState(false)
  const [pickerView, setPickerView] = useState<PickerView>(pickerViewMemo)
  const fileRef = useRef<HTMLInputElement>(null)
  const { tStat } = useLanguage()

  useEffect(() => {
    loadRecent().then(setRecent)
  }, [])
  useEffect(() => { pickerViewMemo = pickerView }, [pickerView])

  const add = async (id: string) => {
    const listing = await fetchRangerListing(id).catch(() => null)
    const f = form === 'e-body' && listing?.sets['e-body'] ? 'e-body' : 'body'
    if (form === 'e-body' && listing && !listing.sets['e-body']) toast(L('ตัวนี้ไม่มีร่าง e-body ใช้ร่างปกติแทน', 'No e-body form — using the base form'))
    await addLericoRanger(id, { tag, form: f })
    loadRecent().then(setRecent)
  }

  return (
    <>
      <div className="lib-opts">
        <Seg<ActorTag> value={tag} onChange={setTag} options={[{ value: 'ally', label: <><Icon name="shield" size={13} /> {L('ฝ่ายเรา', 'Ally')}</> }, { value: 'enemy', label: <><Icon name="skull" size={13} /> {L('ศัตรู', 'Enemy')}</> }]} />
        <Seg value={form} onChange={setForm} options={[{ value: 'body', label: L('ร่างปกติ', 'Base form') }, { value: 'e-body', label: L('ร่าง e', 'e form') }]} />
      </div>
      <button className="btn primary wide big" onClick={() => setPicking(true)}>
        <Icon name="search" /> {L('เลือกเรนเจอร์', 'Pick a ranger')}
      </button>
      <div className="muted small pad">{L('ค้นด้วยชื่อหรือ ID และกรองดาว / ร่าง / ชนิด / บทบาท / ธาตุ ได้ — เลือกได้ทุกตัว', 'Search by name or ID and filter by stars / evolution / type / role / element — every ranger is available')}</div>
      <div className="lib-subtitle">{L('ใช้ล่าสุด', 'Recently used')}</div>
      {recent.length ? <RangerGrid items={recent} onPick={add} /> : <div className="muted small pad">{L('ยังไม่มี — กด "เลือกเรนเจอร์" ด้านบนเพื่อเพิ่มลงฉาก', 'None yet — press "Pick a ranger" above to add one to the scene')}</div>}
      {/* portal ออกไปนอก .anme-root — ตัวเลือกใช้ Tailwind ของเว็บ ไม่ให้ CSS ของ ANME ไปยุ่ง */}
      {picking && typeof document !== 'undefined' && createPortal(
        <RangerPicker
          title={tStat('Pick a ranger')}
          allowAll
          extraRows={UPCOMING_RANGERS}
          view={pickerView}
          onViewChange={next => setPickerView(v => ({ ...v, ...next }))}
          onPick={r => { setPicking(false); add(r.id) }}
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}
      <div className="lib-subtitle">{L('อัปโหลดไฟล์อนิเมชั่นเอง', 'Upload your own animation')}</div>
      <button className="btn wide" onClick={() => fileRef.current?.click()}><Icon name="upload" /> {L('อัปโหลดชุด .sam + .plist + .png', 'Upload .sam + .plist + .png set')}</button>
      <input ref={fileRef} type="file" multiple hidden accept=".sam,.plist,.png" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) addUploadedRanger(f, tag) }} />
      <div className="muted small pad">{L('เลือกทุกไฟล์พร้อมกัน (ตัวละคร body + กระสุน bul/bul2/bul3) ระบบจะจับคู่ตามชื่อไฟล์ให้เอง · ลากไฟล์มาวางบนเวทีก็ได้', 'Select all files at once (body + bul/bul2/bul3) — they are paired by file name · you can also drop them on the stage')}</div>
    </>
  )
}

function RangerGrid({ items, onPick }: { items: RangerName[]; onPick: (id: string) => void }) {
  return (
    <div className="ranger-grid">
      {items.map(n => (
        <button key={n.id} className="ranger-card" onClick={() => onPick(n.id)} title={`${n.th ?? ''}\n${n.en ?? ''}\n${n.id}`}>
          <img loading="lazy" src={thumbUrl(n.id)} alt="" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
          <span className="rc-name">{(getLang() === 'en' ? n.en || n.th : n.th || n.en) || n.id}</span>
          <span className="rc-id">{n.id}</span>
        </button>
      ))}
    </div>
  )
}

// ── สื่อ ──

export function MediaTab() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [fps, setFps] = useState(24)
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef<HTMLInputElement>(null)
  const sceneAssets = useStore(s => s.scene.assets)
  const [sounds, setSounds] = useState<UploadItem[]>([])
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const refresh = () => listUploads().then(all => {
    setItems(all.filter(f => /^(image|video)\//.test(f.mime)))
    setSounds(all.filter(f => /^audio\//.test(f.mime)))
  }).catch(() => {})
  useEffect(() => { refresh() }, [sceneAssets.length])

  const onFiles = async (files: File[]) => {
    const audio = files.filter(f => f.type.startsWith('audio/') || isAudioName(f.name))
    const media = files.filter(f => !audio.includes(f))
    if (audio.length) await uploadAudio(audio)
    if (media.length) await uploadMedia(media)
    refresh()
  }
  const importUrl = async () => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) { toast(L('ใส่ URL ที่ขึ้นต้นด้วย http(s)://', 'Enter a URL starting with http(s)://'), 'error'); return }
    setState({ busy: L('กำลังดาวน์โหลด…', 'Downloading…') })
    try {
      const r = await importFromUrl(u)
      addMediaActor(r.url, r.name, { mime: r.mime })
      setUrl(''); refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : L('ดาวน์โหลดไม่ได้', 'Download failed'), 'error', 5000)
    } finally { setState({ busy: null }) }
  }

  return (
    <>
      <div className="drop-zone" onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); onFiles([...e.dataTransfer.files]) }}>
        <Icon name="upload" size={28} />
        <b>{L('อัปโหลดภาพ / GIF / WebP / วิดีโอ / เสียง', 'Upload image / GIF / WebP / video / audio')}</b>
        <span>{L('PNG · JPG · GIF · WebP (เคลื่อนไหวได้) · APNG · MP4 · WebM · MP3 · WAV', 'PNG · JPG · GIF · WebP (animated) · APNG · MP4 · WebM · MP3 · WAV')}</span>
      </div>
      <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,audio/*,.apng" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; onFiles(f) }} />
      <div className="lib-subtitle">{L('ภาพต่อเนื่อง (เฟรมแอนิเมชัน)', 'Image sequence (frames)')}</div>
      <Row>
        <button className="btn grow" onClick={() => seqRef.current?.click()}><Icon name="film" /> {L('เลือกหลายภาพ', 'Pick images')}</button>
        <Num label="FPS" value={fps} min={1} max={60} onChange={v => setFps(v)} width={96} />
      </Row>
      <input ref={seqRef} type="file" multiple hidden accept="image/png,image/jpeg,image/webp" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; uploadSequence(f, fps) }} />
      <div className="lib-subtitle">{L('นำเข้าจากลิงก์', 'Import from link')}</div>
      <Row>
        <input className="inp grow" placeholder="https://…/effect.gif" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && importUrl()} />
        <button className="btn" onClick={importUrl}>{L('นำเข้า', 'Import')}</button>
      </Row>
      <div className="lib-subtitle">{L('ภาพและวิดีโอ', 'Images & video')} <span className="muted">· {L('คลิก = วางบนเวที', 'click = place on stage')}</span></div>
      <div className="media-grid">
        {items.map(it => (
          <div key={it.file} className="media-card" title={it.name}>
            <button className="media-thumb" onClick={() => addMediaActor(it.url, it.name, { mime: it.mime })}>
              {isVideoName(it.name) || it.mime.startsWith('video/') ? <video src={it.src + '#t=0.1'} muted preload="metadata" /> : <img src={it.src} alt="" loading="lazy" />}
              {it.mime.startsWith('video/') && <span className="badge">VIDEO</span>}
              {/gif|webp|apng/.test(it.mime) && <span className="badge">{it.mime.split('/')[1].toUpperCase()}</span>}
            </button>
            <div className="media-meta">
              <span>{it.name}</span>
              <button className="ibtn tiny" title={L('ใช้เป็นพื้นหลัง', 'Use as background')} onClick={() => addMediaActor(it.url, it.name, { asBackground: true, mime: it.mime })}><Icon name="layers" size={12} /></button>
            </div>
          </div>
        ))}
        {!items.length && <div className="muted small pad">{L('ยังไม่มีไฟล์', 'No files yet')}</div>}
      </div>
      <div className="lib-subtitle">{L('เสียง', 'Sounds')} <span className="muted">· {L('คลิก + = ใส่ลงแทร็กเสียง ณ หัวอ่าน', 'click + = add to sound track at playhead')}</span></div>
      <div className="sound-list">
        {sounds.map(it => (
          <div key={it.file} className="sound-item">
            <button className={'ibtn tiny' + (playingUrl === it.url ? ' on' : '')} title={L('ฟังตัวอย่าง', 'Preview')}
              onClick={() => setPlayingUrl(previewSound(it.url) ? it.url : null)}><Icon name={playingUrl === it.url ? 'stop' : 'play'} size={12} /></button>
            <Icon name="music" size={13} />
            <span className="sound-name" title={it.name}>{it.name}</span>
            <button className="ibtn tiny" title={L('ใส่ลงแทร็กเสียง', 'Add to sound track')} onClick={() => addSoundCue(it.url, it.name)}><Icon name="plus" size={13} /></button>
          </div>
        ))}
        {!sounds.length && <div className="muted small pad">{L('ยังไม่มีไฟล์เสียง — อัปโหลด MP3 / WAV / OGG ด้านบน', 'No sounds yet — upload MP3 / WAV / OGG above')}</div>}
      </div>
    </>
  )
}

// ── ฉาก / แผนที่ ──
export const BATTLE_STAGES = [
  'battle00', 'battle01', 'battle01-2', 'battle02', 'battle02-2', 'battle03', 'battle03-2',
  'battle04', 'battle04-2', 'battle05', 'battle05-2', 'battle06', 'battle06-2', 'battle07',
  'battle07-3', 'battle08-2', 'battle08-3', 'battle09', 'battle09-2', 'battle09-3',
  'battle10', 'battle10-2', 'battle11', 'battle12', 'battle12-2', 'battle13', 'battle13-2',
  'battle14', 'battle14-2', 'battle15', 'battle16', 'battle17', 'battle18', 'battle19',
  'battle20', 'battle21', 'battle22', 'battle23', 'battle24', 'battle25', 'battle26',
  'battle28', 'battle30', 'battle31', 'battle32', 'battle33', 'battle34', 'battle35',
  'battle36', 'battle37', 'battle38',
]
const presetMaps = () => [{ url: '/maps/map1.jpg', name: L('แผนที่โลก', 'World map') }, { url: '/maps/map1_full.jpg', name: L('แผนที่โลก (เต็ม)', 'World map (full)') }]
const COLORS = ['#00b140', '#0047ff', '#000000', '#ffffff', '#0b1020', '#ff2d55']
const GRADS: [string, string][] = [['#1b2550', '#06070d'], ['#ff8a3d', '#3a0b4f'], ['#53e0ff', '#0b2a66'], ['#2b0a3d', '#000000'], ['#ffe08a', '#ff5f6d']]

export function MapsTab() {
  const bg = useStore(s => s.scene.background)
  const bgAsset = useStore(s => s.scene.assets.find(a => a.id === s.scene.background.assetId))
  const fileRef = useRef<HTMLInputElement>(null)
  const setStage = (stage: string) => { updateScene(s => { s.background = { ...s.background, kind: 'stage', stage, fit: 'height', scale: 1, offsetX: 0, offsetY: 0 } }); select({ kind: 'background' }) }
  const setPreset = (url: string, name: string) => {
    updateScene(s => {
      let def = s.assets.find(d => d.type === 'image' && d.url === url)
      if (!def) { def = { id: uid('m'), type: 'image', name, url }; s.assets.push(def) }
      s.background = { ...s.background, kind: 'asset', assetId: def.id, fit: 'cover', scale: 1, offsetX: 0, offsetY: 0 }
    })
    select({ kind: 'background' })
  }
  return (
    <>
      <button className="btn wide" onClick={() => select({ kind: 'background' })}><Icon name="wand" /> {L('ปรับแต่งพื้นหลังปัจจุบัน', 'Adjust current background')}</button>
      <div className="lib-subtitle">{L('สีพื้น / กรีนสกรีน', 'Solid / green screen')}</div>
      <div className="swatches">
        {COLORS.map(c => <button key={c} className={'swatch' + (bg.kind === 'color' && bg.color === c ? ' on' : '')} style={{ background: c }} onClick={() => updateScene(s => { s.background = { ...s.background, kind: 'color', color: c } })} title={c} />)}
        <label className="swatch custom" title={L('เลือกสีเอง', 'Pick a color')}><input type="color" value={bg.color} onChange={e => { const v = e.target.value; updateScene(s => { s.background = { ...s.background, kind: 'color', color: v } }, false) }} />+</label>
      </div>
      <div className="swatches">
        {GRADS.map(g => <button key={g.join()} className={'swatch' + (bg.kind === 'gradient' && bg.gradient.join() === g.join() ? ' on' : '')} style={{ background: `linear-gradient(${g[0]}, ${g[1]})` }} onClick={() => updateScene(s => { s.background = { ...s.background, kind: 'gradient', gradient: g } })} />)}
      </div>
      <div className="lib-subtitle">{L('แผนที่', 'Maps')}</div>
      <div className="map-grid">
        {presetMaps().map(m => (
          <button key={m.url} className={'map-card' + (bg.kind === 'asset' && bgAsset && 'url' in bgAsset && bgAsset.url === m.url ? ' on' : '')} onClick={() => setPreset(m.url, m.name)}>
            <img src={appUrl(m.url)} alt="" loading="lazy" /><span>{m.name}</span>
          </button>
        ))}
        <button className="map-card upload" onClick={() => fileRef.current?.click()}><Icon name="upload" size={22} /><span>{L('อัปโหลดภาพ/วิดีโอ', 'Upload image/video')}</span></button>
      </div>
      <input ref={fileRef} type="file" hidden accept="image/*,video/*" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) uploadMedia(f, { asBackground: true }) }} />
      <div className="lib-subtitle">{L('ด่านในเกม', 'Game stages')} ({BATTLE_STAGES.length})</div>
      <div className="map-grid">
        {BATTLE_STAGES.map(s => (
          <button key={s} className={'map-card' + (bg.kind === 'stage' && bg.stage === s ? ' on' : '')} onClick={() => setStage(s)}>
            <img src={appUrl(`/api/res/${s}/bg.png`)} alt="" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15' }} />
            <span>{s.replace('battle', L('ด่าน ', 'Stage '))}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ── แผงขวา: ปรับพื้นหลัง ──
export function BackgroundInspector() {
  const bg = useStore(s => s.scene.background)
  const def = useStore(s => s.scene.assets.find(a => a.id === s.scene.background.assetId))
  useAssetsVersion()
  const set = (p: Partial<typeof bg>, h = true) => updateScene(s => { s.background = { ...s.background, ...p } }, h)
  const failed = bg.kind === 'stage' && assets.stageFailed(bg.stage)
  const title = bg.kind === 'stage' ? bg.stage : bg.kind === 'asset' ? def?.name ?? L('สื่อ', 'Media') : bg.kind === 'color' ? L('สีพื้น', 'Solid color') : L('ไล่สี', 'Gradient')
  return (
    <>
      <div className="insp-head" style={{ ['--accent' as string]: '#3fd68f' }}>
        <div><div className="insp-title">{L('พื้นหลัง', 'Background')}</div><div className="insp-sub">{title}</div></div>
      </div>
      {failed && <div className="error-box">{L('โหลดฉากไม่ได้', 'Failed to load stage')} {bg.stage}</div>}
      <Section title={L('ชนิด', 'Type')}>
        <Seg value={bg.kind} onChange={v => set({ kind: v })} options={[
          { value: 'stage', label: L('ด่านเกม', 'Stage') }, { value: 'asset', label: L('ภาพ/วิดีโอ', 'Image/video') }, { value: 'color', label: L('สี', 'Color') }, { value: 'gradient', label: L('ไล่สี', 'Gradient') },
        ]} />
        {bg.kind === 'stage' && <Select label={L('ด่าน', 'Stage')} value={bg.stage} options={BATTLE_STAGES} onChange={v => set({ stage: v })} />}
        {bg.kind === 'color' && <label className="fsel"><span className="sel-label">{L('สี', 'Color')}</span><input type="color" value={bg.color} onChange={e => set({ color: e.target.value }, false)} /></label>}
        {bg.kind === 'gradient' && <Row>
          <label className="fsel"><span className="sel-label">{L('บน', 'Top')}</span><input type="color" value={bg.gradient[0]} onChange={e => set({ gradient: [e.target.value, bg.gradient[1]] }, false)} /></label>
          <label className="fsel"><span className="sel-label">{L('ล่าง', 'Bottom')}</span><input type="color" value={bg.gradient[1]} onChange={e => set({ gradient: [bg.gradient[0], e.target.value] }, false)} /></label>
        </Row>}
        {bg.kind === 'asset' && !def && <div className="muted small">{L('ยังไม่ได้เลือก — ไปที่แท็บ “ฉาก” หรือ “สื่อ” ทางซ้าย', 'Nothing selected — use the “Maps” or “Media” tab on the left')}</div>}
      </Section>
      {(bg.kind === 'stage' || bg.kind === 'asset') && (
        <Section title={L('ตำแหน่ง & ขนาด', 'Position & size')}>
          {bg.kind === 'asset' && <Select<BgFit> label={L('การวาง', 'Fit')} value={bg.fit} onChange={v => set({ fit: v })} options={[
            { value: 'cover', label: L('เต็มจอ (ครอบ)', 'Cover') }, { value: 'contain', label: L('พอดีจอ', 'Contain') }, { value: 'stretch', label: L('ยืดเต็ม', 'Stretch') }, { value: 'height', label: L('สูงเท่าจอ', 'Fit height') },
          ]} />}
          <Slider label={L('ขนาด', 'Scale')} value={bg.scale} min={0.3} max={4} step={0.01} onChange={(v, h) => set({ scale: v }, h)} fmt={v => '×' + v.toFixed(2)} />
          <Row>
            <Num label={L('เลื่อน X', 'Offset X')} value={bg.offsetX} onChange={(v, h) => set({ offsetX: v }, h)} />
            <Num label={L('เลื่อน Y', 'Offset Y')} value={bg.offsetY} onChange={(v, h) => set({ offsetY: v }, h)} />
          </Row>
          <Slider label={L('เลื่อนอัตโนมัติ', 'Auto scroll')} value={bg.scrollX} min={-600} max={600} step={5} onChange={(v, h) => set({ scrollX: v }, h)} fmt={v => v ? v + ' px/s' : L('ปิด', 'off')} />
          {bg.kind === 'stage' && <div className="muted small">{L('ฉากด่านจัดให้ “ถนน” ตรงกับเส้นพื้นของฉากอัตโนมัติ (ปรับเส้นพื้นได้ที่ตั้งค่าฉาก)', 'Stage backgrounds align their road with the scene ground line (adjust it in Scene settings)')}</div>}
        </Section>
      )}
      <Section title={L('บรรยากาศ', 'Mood')}>
        <Slider label={L('มืดลง', 'Darken')} value={bg.dim} min={0} max={0.9} onChange={(v, h) => set({ dim: v }, h)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label={L('เบลอ', 'Blur')} value={bg.blur} min={0} max={20} step={0.5} onChange={(v, h) => set({ blur: v }, h)} fmt={v => v + 'px'} />
      </Section>
    </>
  )
}
