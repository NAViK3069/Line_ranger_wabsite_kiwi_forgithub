import { useEffect, useRef, useState } from 'react'
import { L } from '@/anme/engine/i18n'
import { Icon } from './widgets'
import { deleteSelection, duplicateSelection, patchActor } from '@/anme/engine/actions'
import { getState, redo, setState, setTime, undo, useStore } from '@/anme/engine/store'
import { Inspector } from './Inspector'
import { Library } from './Library'
import { StageView } from './StageView'
import { Timeline, usePlayback } from './Timeline'
import { TopBar } from './TopBar'

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const st = getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (k === ' ') { e.preventDefault(); setState({ playing: !st.playing }) }
      else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      else if (mod && k === 'd') { e.preventDefault(); duplicateSelection() }
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

// มือถือ (จอ ≤ 760px): แสดงทีละแผง สลับด้วยแถบแท็บใต้แถบบน — จอกว้างเห็นครบ 3 แผงเหมือนเดิม (CSS จัดการ)
type MobilePanel = 'library' | 'stage' | 'inspector'

function useMobilePanel() {
  const [panel, setPanel] = useState<MobilePanel>('stage')
  // เพิ่มตัวละคร/สื่อลงฉากจากแท็บคลัง → พากลับไปดูบนเวทีเอง (บนมือถือไม่งั้นมองไม่เห็นว่าเพิ่มแล้ว)
  const actorCount = useStore(s => s.scene.actors.length)
  const prev = useRef(actorCount)
  useEffect(() => {
    if (actorCount > prev.current) setPanel(p => (p === 'library' ? 'stage' : p))
    prev.current = actorCount
  }, [actorCount])
  return [panel, setPanel] as const
}

export function App() {
  // เปลี่ยนภาษา → render ใหม่ทั้งแอพ
  useStore(s => s.lang)
  usePlayback()
  useShortcuts()
  const [panel, setPanel] = useMobilePanel()
  const tabs: { id: MobilePanel; icon: 'sparkle' | 'film' | 'layers'; label: string }[] = [
    { id: 'library', icon: 'sparkle', label: L('คลัง', 'Library') },
    { id: 'stage', icon: 'film', label: L('เวที', 'Stage') },
    { id: 'inspector', icon: 'layers', label: L('ตั้งค่า', 'Settings') },
  ]
  return (
    <div className="app">
      <TopBar />
      <nav className="m-tabs">
        {tabs.map(t => (
          <button key={t.id} className={panel === t.id ? 'on' : ''} onClick={() => setPanel(t.id)}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </nav>
      <div className={`main m-${panel}`}>
        <Library />
        <main className="center"><StageView /></main>
        <Inspector />
      </div>
      <Timeline />
      <Toasts />
    </div>
  )
}
