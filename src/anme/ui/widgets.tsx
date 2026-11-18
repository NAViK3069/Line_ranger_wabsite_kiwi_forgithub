// ====================================================
// widgets.tsx — ช่องกรอก/สไลเดอร์/สวิตช์ ที่ใช้ทั้งแอพ
// ป้ายชื่อของช่องตัวเลข "ลากซ้าย-ขวาเพื่อปรับค่า" ได้ (แบบโปรแกรมตัดต่อ)
// ====================================================
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { checkpoint } from '@/anme/engine/store'

/** onChange(value, history) — history=false ระหว่างลาก (เรียก checkpoint ไปแล้วตอนเริ่ม) */
type Change<T> = (v: T, history: boolean) => void

export function Num({ label, value, onChange, step = 1, min, max, unit, width, title, precision }: {
  label?: ReactNode; value: number; onChange: Change<number>; step?: number; min?: number; max?: number
  unit?: string; width?: number; title?: string; precision?: number
}) {
  const [text, setText] = useState<string | null>(null)
  const prec = precision ?? (step >= 1 ? 0 : step >= 0.1 ? 1 : 2)
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10 ** prec) / 10 ** prec) : '0')
  const onLabelDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX, v0 = value
    let moved = false
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      if (!moved && Math.abs(dx) < 2) return
      if (!moved) { checkpoint(); moved = true }
      const mul = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1
      onChange(clampV(+(v0 + Math.round(dx / 2) * step * mul).toFixed(4)), false)
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <label className="num" title={title} style={width ? { width } : undefined}>
      {label != null && <span className="num-label" onPointerDown={onLabelDown}>{label}</span>}
      <input
        type="text" inputMode="decimal"
        value={text ?? fmt(value)}
        onFocus={e => { setText(fmt(value)); requestAnimationFrame(() => e.target.select()) }}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text != null) { const v = parseFloat(text); if (Number.isFinite(v)) onChange(clampV(v), true) } setText(null) }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur() }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const v = clampV(+(value + d).toFixed(4)); onChange(v, true); setText(fmt(v))
          }
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </label>
  )
}

export function Slider({ label, value, onChange, min, max, step = 0.01, fmt }: {
  label: ReactNode; value: number; onChange: Change<number>; min: number; max: number; step?: number; fmt?: (v: number) => string
}) {
  const started = useRef(false)
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onPointerDown={() => { checkpoint(); started.current = true }}
        onPointerUp={() => { started.current = false }}
        onChange={e => onChange(parseFloat(e.target.value), !started.current)}
        style={{ ['--k' as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <span className="slider-val">{fmt ? fmt(value) : value.toFixed(step >= 1 ? 0 : 2)}</span>
    </div>
  )
}

export function Toggle({ label, value, onChange, hint }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button type="button" className={'toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)} title={hint}>
      <span className="toggle-knob" />
      <span>{label}</span>
    </button>
  )
}

export function Select<T extends string>({ label, value, options, onChange, width }: {
  label?: ReactNode; value: T; options: (T | { value: T; label: string })[]; onChange: (v: T) => void; width?: number | string
}) {
  return (
    <label className="fsel" style={width ? { width } : undefined}>
      {label != null && <span className="sel-label">{label}</span>}
      <select value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? o : o.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
    </label>
  )
}

export function Text({ label, value, onChange, placeholder }: { label?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [t, setT] = useState(value)
  useEffect(() => setT(value), [value])
  return (
    <label className="txt">
      {label != null && <span className="sel-label">{label}</span>}
      <input value={t} placeholder={placeholder} onChange={e => setT(e.target.value)}
        onBlur={() => { if (t !== value) onChange(t) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button type="button" key={o.value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Section({ title, children, right, defaultOpen = true, accent }: { title: ReactNode; children: ReactNode; right?: ReactNode; defaultOpen?: boolean; accent?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={'sec' + (open ? ' open' : '')} style={accent ? { ['--accent' as string]: accent } : undefined}>
      <header onClick={() => setOpen(!open)}>
        <span className="sec-caret">▸</span>
        <span className="sec-title">{title}</span>
        <span className="sec-right" onClick={e => e.stopPropagation()}>{right}</span>
      </header>
      {open && <div className="sec-body">{children}</div>}
    </section>
  )
}

export const Row = ({ children, gap = 6 }: { children: ReactNode; gap?: number }) => <div className="row" style={{ gap }}>{children}</div>

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
}

export const ICONS = {
  back: <path d="M15 18l-6-6 6-6" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  first: <><path d="M6 5v14" /><path d="M18 5 9 12l9 7z" fill="currentColor" stroke="none" /></>,
  loop: <><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>,
  save: <><path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8" /><rect x="7" y="13" width="10" height="7" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  upload: <><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  flip: <><path d="M12 3v18" /><path d="M8 7 3 12l5 5V7z" /><path d="M16 7l5 5-5 5V7z" fill="currentColor" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none" />,
  move: <><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></>,
  run: <><circle cx="14" cy="4.5" r="2" /><path d="m7 21 3-6 3 2 1 4M5 12l3-4 5 1 3 3 3-1M10 15l1.5-6" /></>,
  sparkle: <path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" fill="currentColor" stroke="none" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  download: <><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /><path d="M4 20h16" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>,
  wand: <><path d="m15 4 5 5L9 20l-5-5z" /><path d="M14 2v2M20 8h2M18 4l1.5-1.5" /></>,
  focus: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />,
  skull: <><path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z" /><circle cx="9" cy="11.5" r="1.6" fill="currentColor" /><circle cx="15" cy="11.5" r="1.6" fill="currentColor" /><path d="M10 20v-2M14 20v-2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></>,
  arrow: <><path d="M4 12h14" /><path d="m13 6 6 6-6 6" /></>,
  pin: <><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  volumeOff: <><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" /><path d="m16 9 5 6M21 9l-5 6" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" /></>,
  burst: <path d="M12 2l1.8 5.2L19 5l-2.2 5.2L22 12l-5.2 1.8L19 19l-5.2-2.2L12 22l-1.8-5.2L5 19l2.2-5.2L2 12l5.2-1.8L5 5l5.2 2.2z" fill="currentColor" stroke="none" />,
}
