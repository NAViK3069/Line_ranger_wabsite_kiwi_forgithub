import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MobileApp } from './MobileApp'
import { copySelection, deleteSelection, duplicateSelection, pasteClipboard, patchActor } from '@/anme/engine/actions'
import { getState, redo, setState, setTime, undo, useStore } from '@/anme/engine/store'
import { L } from '@/anme/engine/i18n'
import { Inspector } from './Inspector'
import { useCardLanguage } from './LayerPanels'
import { Library } from './Library'
import { StageView } from './StageView'
import { Timeline, usePlayback } from './Timeline'
import { TopBar } from './TopBar'

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      // ช่องตัวเลข/ข้อความบรรทัดเดียว/ตัวเลือก ที่ยังโฟกัสค้างหลังแก้ค่า → Ctrl+Z/Y ย้อนการแก้ของสตูดิโอ
      // (ปล่อยโฟกัสก่อนให้ค่าที่พิมพ์ถูกบันทึก แล้วค่อยย้อน) · ช่องข้อความหลายบรรทัดใช้ย้อนของเบราว์เซอร์ตามปกติ
      if (mod && (k === 'z' || k === 'y') && el && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
        e.preventDefault()
        el.blur()
        setTimeout(() => (k === 'y' || e.shiftKey ? redo() : undo()), 0)
        return
      }
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const st = getState()
      if (k === ' ') { e.preventDefault(); setState({ playing: !st.playing }) }
      else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      else if (mod && k === 'd') { e.preventDefault(); duplicateSelection() }
      // คัดลอก/วางบล็อกบนไทม์ไลน์ (ไม่มีบล็อกที่เลือก/ไม่มีของในคลิปบอร์ด = ปล่อยให้เบราว์เซอร์ทำตามปกติ)
      else if (mod && k === 'c' && !window.getSelection()?.toString()) { if (copySelection()) e.preventDefault() }
      else if (mod && k === 'v') { if (pasteClipboard()) e.preventDefault() }
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection() }
      else if (k === 'home') { setState({ playing: false }); setTime(0) }
      else if (k === ',' || k === '.') { setState({ playing: false }); setTime(st.time + (k === ',' ? -1 : 1) / st.scene.fps) }
      else if (k.startsWith('arrow') && st.sel.kind === 'actor') {
        const a = st.scene.actors.find(x => x.id === (st.sel as { id: string }).id)
        if (!a) return
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        patchActor(a.id, { x: a.x + (k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0), y: a.y + (k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0) })
      }
      else if (k === 'escape') setState({ sel: { kind: 'none' } })
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

function Toasts() {
  const toasts = useStore(s => s.toasts)
  const busy = useStore(s => s.busy)
  return (
    <div className="toasts">
      {busy && busy !== 'export' && <div className="toast busy"><span className="spinner" />{busy}</div>}
      {toasts.map(t => <div key={t.id} className={'toast ' + t.tone}>{t.text}</div>)}
    </div>
  )
}

// มือถือ (จอ ≤ 760px) ใช้หน้าตาแบบแอปตัดต่อบนมือถือ (MobileApp) — จอกว้างกว่านั้นใช้ 3 แผงเดิมของ ANME
const MOBILE_QUERY = '(max-width: 760px)'
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

// ── ขนาดแผงบนจอคอม (ลากเส้นแบ่งได้แบบโปรแกรมตัดต่อ) ──
// เก็บเฉพาะค่าที่ผู้ใช้ลากเอง · ไม่มีค่า = ใช้ค่าเริ่มต้นตามความกว้างจอใน CSS
type PaneKey = 'lib' | 'insp' | 'tl'
type Layout = Partial<Record<PaneKey, number>>
const LAYOUT_KEY = 'anme.layout.v1'
const COLLAPSE = 120   // ลากแผงข้างให้แคบกว่านี้ = พับเก็บ (กว้าง 0) · ลากเส้นออกมาใหม่ได้
function loadLayout(): Layout {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Layout } catch { return {} }
}
function useLayout() {
  const [layout, setLayout] = useState<Layout>(loadLayout)
  useEffect(() => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* เก็บไม่ได้ก็ใช้ได้ปกติ */ } }, [layout])
  return [layout, setLayout] as const
}

function Splitters({ appRef, setLayout }: { appRef: React.RefObject<HTMLDivElement | null>; setLayout: React.Dispatch<React.SetStateAction<Layout>> }) {
  const [active, setActive] = useState<PaneKey | null>(null)
  const start = (key: PaneKey) => (e: React.PointerEvent) => {
    e.preventDefault()
    const app = appRef.current
    if (!app) return
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch { /* ลากต่อได้ตามปกติ */ }
    setActive(key)
    app.classList.add('resizing', key === 'tl' ? 'h' : 'v')
    const move = (ev: PointerEvent) => {
      const r = app.getBoundingClientRect()
      let v: number
      if (key === 'lib') v = ev.clientX - r.left
      else if (key === 'insp') v = r.right - ev.clientX
      else v = r.bottom - ev.clientY
      if (key === 'tl') v = Math.min(r.height - 54 - 140, Math.max(90, v))   // เหลือที่ให้เวทีเสมอ
      else {
        v = Math.min(r.width * 0.45, v)
        if (v < COLLAPSE) v = 0
      }
      setLayout(l => ({ ...l, [key]: Math.round(v) }))
    }
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      setActive(null)
      app.classList.remove('resizing', 'h', 'v')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const reset = (key: PaneKey) => () => setLayout(l => { const n = { ...l }; delete n[key]; return n })
  const tip = L('ลากเพื่อปรับขนาด · ดับเบิลคลิก = ค่าเริ่มต้น', 'Drag to resize · double-click to reset')
  return (
    <>
      <div className={'split v l' + (active === 'lib' ? ' on' : '')} title={tip} onPointerDown={start('lib')} onDoubleClick={reset('lib')} />
      <div className={'split v r' + (active === 'insp' ? ' on' : '')} title={tip} onPointerDown={start('insp')} onDoubleClick={reset('insp')} />
      <div className={'split h' + (active === 'tl' ? ' on' : '')} title={tip} onPointerDown={start('tl')} onDoubleClick={reset('tl')} />
    </>
  )
}

export function App() {
  // เปลี่ยนภาษา → render ใหม่ทั้งแอพ
  useStore(s => s.lang)
  usePlayback()
  useShortcuts()
  useCardLanguage()   // การ์ดคำอธิบายสกิลเปลี่ยนภาษาตามภาษาที่เลือก
  const mobile = useIsMobile()
  const [layout, setLayout] = useLayout()
  const appRef = useRef<HTMLDivElement>(null)
  if (mobile) return <><MobileApp /><Toasts /></>
  const vars: Record<string, string> = {}
  if (layout.lib != null) vars['--lib-w'] = layout.lib + 'px'
  if (layout.insp != null) vars['--insp-w'] = layout.insp + 'px'
  if (layout.tl != null) vars['--tl-h'] = layout.tl + 'px'
  return (
    <div className="app" ref={appRef} style={vars as CSSProperties}>
      <TopBar />
      <div className="main">
        <Library />
        <main className="center"><StageView /></main>
        <Inspector />
      </div>
      <Timeline />
      <Splitters appRef={appRef} setLayout={setLayout} />
      <Toasts />
    </div>
  )
}
