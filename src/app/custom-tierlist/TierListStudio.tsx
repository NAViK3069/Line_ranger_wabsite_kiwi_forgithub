'use client'

// ====================================================
// TierListStudio — จัดเทียร์ลิสต์เรนเจอร์ (เมนู Custom → Tier List)
//
//   ตารางเทียร์ (บน)   แถวละ 1 เทียร์ · ป้ายแก้ข้อความ/สีพื้น/สีตัวอักษรได้ (⚙) · ▲▼ ย้ายแถว · เพิ่ม/ลบแถว
//   คลังเรนเจอร์ (ล่าง)  ค่าเริ่มต้น = Meta PVP ลีค Legend ที่ Users ≥ 2 เรียงตาม Rangers มาก→น้อย
//                      ร่างอื่นของตัวเดียวกัน (สายวิวัฒนาการเดียวกัน) เก็บไว้แค่ร่างที่ Rangers สูงสุด
//
//   จัดวาง: คอม = ลากวาง · มือถือ = แตะเลือกแล้วกดเทียร์ในแถบล่าง หรือกดค้างแล้วลาก
//   บันทึกอัตโนมัติในเบราว์เซอร์ (localStorage) · ดาวน์โหลดเป็นรูป PNG (วาดลง canvas เอง)
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RangerPicker, { PICKER_VIEW_DEFAULT, type PickerView } from '../lobby/RangerPicker'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch, proxyFile } from '@/lib/staticApi'

// ── ข้อมูล ──────────────────────────────────────────────

interface Tier { id: string; label: string; bg: string; fg: string; items: string[] }
interface Board { title: string; tiers: Tier[]; pool: string[] }

const STORE_KEY = 'lr:tierlist:v1'
const POOL = 'pool'

const DEFAULT_TIERS: Omit<Tier, 'id' | 'items'>[] = [
  { label: 'S', bg: '#ff7f7f', fg: '#1a1a1a' },
  { label: 'A', bg: '#ffbf7f', fg: '#1a1a1a' },
  { label: 'B', bg: '#ffdf7f', fg: '#1a1a1a' },
  { label: 'C', bg: '#bfff7f', fg: '#1a1a1a' },
  { label: 'D', bg: '#7fbfff', fg: '#1a1a1a' },
]
const BG_SWATCHES = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#7f7fff', '#ff7fff', '#bf7fbf', '#3b3b3b', '#a30000', '#a35200', '#7a6a00', '#4f8a00', '#ffffff', '#111111']
const FG_SWATCHES = ['#1a1a1a', '#ffffff', '#ffd700', '#ff4d4d', '#22d3ee', '#a855f7']

const uid = () => Math.random().toString(36).slice(2, 9)
const thumb = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`
const freshTiers = (): Tier[] => DEFAULT_TIERS.map(t => ({ ...t, id: uid(), items: [] }))

interface MetaRanger { id: string; name: string; count: number; totalCount: number }

/** คลังเริ่มต้น: Legend · Users (count) ≥ 2 · เรียง Rangers (totalCount) มาก→น้อย · ร่างเดียวกันเก็บตัวที่สูงสุด */
async function defaultPool(): Promise<string[]> {
  const d = await apiFetch('/api/meta/rangers?league=0').then(r => r.json()) as { rangers?: MetaRanger[] }
  const list = (d.rangers ?? []).filter(r => r.count >= 2).sort((a, b) => b.totalCount - a.totalCount)
  // สายวิวัฒนาการ: ร่างทุกร่างในสายเดียวกันได้ key เดียวกัน (ร่างแรกของสาย)
  const chainKey = new Map<string, string>()
  await Promise.all(list.map(async r => {
    try {
      const e = await apiFetch(`/api/ranger/evolve/${encodeURIComponent(r.id)}`).then(x => x.json()) as { chain?: { id: string }[] }
      chainKey.set(r.id, e.chain && e.chain.length > 1 ? e.chain[0].id : r.id)
    } catch { chainKey.set(r.id, r.id) }
  }))
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of list) {
    const k = chainKey.get(r.id) ?? r.id
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r.id)
  }
  return out
}

function loadBoard(): Board | null {
  try {
    const b = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Board | null
    return b && Array.isArray(b.tiers) && Array.isArray(b.pool) ? b : null
  } catch { return null }
}

// ── หน้าหลัก ────────────────────────────────────────────

export default function TierListStudio() {
  const { lang, tRanger } = useLanguage()
  const T = useCallback((th: string, en: string) => (lang === 'th' ? th : en), [lang])
  const [board, setBoard] = useState<Board | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pickerView, setPickerView] = useState<PickerView>(PICKER_VIEW_DEFAULT)
  const [confirm, setConfirm] = useState<null | 'clear' | 'tiers' | 'delete' | 'reset'>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? null : t)), 2200) }, [])

  // ── โหลด / บันทึก ──
  const resetBoard = useCallback(async () => {
    setLoading(true)
    const pool = await defaultPool().catch(() => [] as string[])
    setBoard({ title: 'Line Rangers Tier List', tiers: freshTiers(), pool })
    setSelected(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    const saved = loadBoard()
    if (saved) { setBoard(saved); setLoading(false) } else resetBoard()
  }, [resetBoard])
  useEffect(() => { if (board) try { localStorage.setItem(STORE_KEY, JSON.stringify(board)) } catch { /* เต็ม */ } }, [board])

  // ชื่อเรนเจอร์ (ใช้ใน title / แถบเลือก) — จาก ranger-book ชุดเดียวกับตัวเลือก
  useEffect(() => {
    apiFetch('/api/ranger-book').then(r => r.json()).then((d: { rangers?: { id: string; name: string }[] }) => {
      setNames(Object.fromEntries((d.rangers ?? []).map(r => [r.id, r.name])))
    }).catch(() => {})
  }, [])
  const nameOf = (id: string) => tRanger(id, names[id] ?? id)

  // ── แก้บอร์ด ──
  const update = (fn: (b: Board) => Board) => setBoard(b => (b ? fn(structuredClone(b)) : b))
  const zoneOf = (b: Board, id: string) => (b.pool.includes(id) ? POOL : b.tiers.find(t => t.items.includes(id))?.id ?? null)

  /** ย้ายเรนเจอร์ไปโซน (เทียร์ / คลัง) ที่ตำแหน่ง index (ไม่ใส่ = ท้ายสุด) */
  const moveItem = useCallback((id: string, zone: string, index?: number) => {
    update(b => {
      const from = zoneOf(b, id)
      const list = (z: string) => (z === POOL ? b.pool : b.tiers.find(t => t.id === z)!.items)
      // index (จาก hitTest หรือไม่ใส่ = ท้ายสุด) นับในรายการที่เอาตัวนี้ออกแล้ว
      if (from) { const l = list(from); l.splice(l.indexOf(id), 1) }
      const to = list(zone)
      const at = index ?? to.length
      to.splice(Math.max(0, Math.min(at, to.length)), 0, id)
      return b
    })
  }, [])

  const removeItem = (id: string) => {
    update(b => { b.pool = b.pool.filter(x => x !== id); b.tiers.forEach(t => { t.items = t.items.filter(x => x !== id) }); return b })
    setSelected(null)
  }

  const addRanger = (id: string) => {
    if (!board) return
    const z = zoneOf(board, id)
    if (z) { setSelected(id); flash(T('มีเรนเจอร์ตัวนี้อยู่แล้ว', 'Already on the board')); return }
    update(b => { b.pool.unshift(id); return b })
    setSelected(id)
    flash(T('เพิ่มลงคลังแล้ว — แตะเทียร์ด้านล่างเพื่อจัด', 'Added — tap a tier below to place it'))
  }

  const moveTier = (i: number, d: -1 | 1) => update(b => {
    const j = i + d
    if (j < 0 || j >= b.tiers.length) return b
    ;[b.tiers[i], b.tiers[j]] = [b.tiers[j], b.tiers[i]]
    return b
  })

  // ── ลาก (เมาส์ = ลากได้ทันที · นิ้ว = กดค้าง 0.25 วิ แล้วลาก) ──
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; zone: string | null; index: number } | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  const suppressClick = useRef(false)

  const hitTest = (x: number, y: number): { zone: string | null; index: number } => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const zoneEl = el?.closest<HTMLElement>('[data-zone]')
    if (!zoneEl) return { zone: null, index: 0 }
    const items = [...zoneEl.querySelectorAll<HTMLElement>('[data-item]')].filter(n => n.dataset.item !== dragRef.current?.id)
    let index = items.length
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (y < r.top) { index = i; break }
      if (y <= r.bottom && x < r.left + r.width / 2) { index = i; break }
    }
    return { zone: zoneEl.dataset.zone!, index }
  }

  const startDrag = (id: string, x: number, y: number) => {
    setSelected(null)
    setDrag({ id, x, y, ...hitTest(x, y) })
    suppressClick.current = true
    navigator.vibrate?.(8)
  }
  const moveDrag = (x: number, y: number) => {
    if (!dragRef.current) return
    setDrag(d => (d ? { ...d, x, y, ...hitTest(x, y) } : d))
    // เลื่อนหน้าเองเมื่อลากไปใกล้ขอบบน/ล่าง (มือถือจอเตี้ย คลังกับตารางอยู่คนละช่วง)
    const edge = 70
    if (y < edge) window.scrollBy(0, -12)
    else if (y > window.innerHeight - edge) window.scrollBy(0, 12)
  }
  const endDrag = () => {
    const d = dragRef.current
    if (d?.zone) moveItem(d.id, d.zone, d.index)
    setDrag(null)
    window.setTimeout(() => { suppressClick.current = false }, 50)
  }

  const onItemPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const x0 = e.clientX, y0 = e.clientY
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; started = true; startDrag(id, ev.clientX, ev.clientY) }
      moveDrag(ev.clientX, ev.clientY)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (started) endDrag() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onItemTouchStart = (e: React.TouchEvent, id: string) => {
    if (e.touches.length !== 1) return
    const t0 = e.touches[0]
    const x0 = t0.clientX, y0 = t0.clientY
    let started = false
    let cancelled = false
    const timer = window.setTimeout(() => { if (!cancelled) { started = true; startDrag(id, x0, y0) } }, 250)
    const move = (ev: TouchEvent) => {
      const t = ev.touches[0]
      if (!started) { if (Math.hypot(t.clientX - x0, t.clientY - y0) > 10) { cancelled = true; cleanup() } return }
      ev.preventDefault()   // กำลังลาก → ไม่ให้หน้าเลื่อน
      moveDrag(t.clientX, t.clientY)
    }
    const end = () => { cleanup(); if (started) endDrag() }
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
  }

  const onItemClick = (id: string) => {
    if (suppressClick.current) return
    setSelected(s => (s === id ? null : id))
  }
  /** มีตัวที่เลือกอยู่ แล้วแตะพื้นที่ของเทียร์/คลัง = ย้ายไปที่นั่น */
  const onZoneClick = (e: React.MouseEvent, zone: string) => {
    if (!selected || (e.target as HTMLElement).closest('[data-item]')) return
    moveItem(selected, zone)
    setSelected(null)
  }

  // ── ดาวน์โหลดเป็นรูป ──
  const exportPng = async () => {
    if (!board) return
    setExporting(true)
    try {
      const blob = await renderBoard(board)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(board.title || 'tier-list').replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim() || 'tier-list'}.png`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      flash(T('บันทึกรูปแล้ว', 'Image saved'))
    } catch {
      flash(T('บันทึกรูปไม่สำเร็จ', 'Could not save the image'))
    } finally { setExporting(false) }
  }

  const doConfirm = () => {
    if (confirm === 'clear') update(b => { b.pool = [...b.tiers.flatMap(t => t.items), ...b.pool]; b.tiers.forEach(t => { t.items = [] }); return b })
    // รีเซ็ตตาราง = แถว/ชื่อ/สี/ชื่อตารางกลับเป็นค่าเริ่มต้น · เรนเจอร์ในตารางกลับคลังทั้งหมด (คลังไม่ถูกโหลดใหม่)
    if (confirm === 'tiers') update(b => {
      b.pool = [...b.tiers.flatMap(t => t.items), ...b.pool]
      b.tiers = freshTiers()
      b.title = 'Line Rangers Tier List'
      return b
    })
    if (confirm === 'delete') update(b => { b.pool = []; b.tiers.forEach(t => { t.items = [] }); return b })
    if (confirm === 'reset') resetBoard()
    setConfirm(null)
    setSelected(null)
  }

  const placedCount = useMemo(() => board?.tiers.reduce((n, t) => n + t.items.length, 0) ?? 0, [board])
  const selZone = board && selected ? zoneOf(board, selected) : null
  const editingTier = board?.tiers.find(t => t.id === editing) ?? null

  if (!board) {
    return <div className="tl-page"><div className="tl-loading"><span className="material-icons-round animate-spin">autorenew</span>{T('กำลังโหลดเรนเจอร์จาก Meta PVP...', 'Loading rangers from Meta PVP...')}</div></div>
  }

  const renderItem = (id: string) => (
    <button
      key={id}
      type="button"
      data-item={id}
      className={'tl-item' + (selected === id ? ' sel' : '') + (drag?.id === id ? ' ghosted' : '')}
      title={nameOf(id)}
      onPointerDown={e => onItemPointerDown(e, id)}
      onTouchStart={e => onItemTouchStart(e, id)}
      onClick={() => onItemClick(id)}
      onContextMenu={e => e.preventDefault()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb(id)} alt={nameOf(id)} draggable={false} loading="lazy" />
    </button>
  )
  const marker = (zone: string, i: number) => drag?.zone === zone && drag.index === i ? <span key={`m-${zone}-${i}`} className="tl-marker" /> : null
  /** รายการในโซน + เส้นบอกจุดวาง — นับตำแหน่งโดยไม่รวมตัวที่กำลังลาก (ตรงกับ hitTest) */
  const renderZone = (zone: string, items: string[]) => {
    const out: React.ReactNode[] = []
    let k = 0
    for (const id of items) {
      if (id !== drag?.id) { out.push(marker(zone, k)); k++ }
      out.push(renderItem(id))
    }
    out.push(marker(zone, k))
    return out
  }

  return (
    <div className="tl-page" data-dragging={drag ? '' : undefined}>
      {/* ชื่อเทียร์ลิสต์ + ปุ่มหลัก */}
      <div className="tl-head">
        <input className="tl-title" value={board.title} maxLength={60} placeholder={T('ชื่อเทียร์ลิสต์', 'Tier list title')}
          onChange={e => { const v = e.target.value; update(b => { b.title = v; return b }) }} />
        <div className="tl-actions">
          <button className="tl-btn primary" onClick={() => setPicking(true)}>
            <span className="material-icons-round">person_add</span>{T('เพิ่มเรนเจอร์', 'Add ranger')}
          </button>
          <button className="tl-btn accent" onClick={exportPng} disabled={exporting}>
            <span className={'material-icons-round' + (exporting ? ' animate-spin' : '')}>{exporting ? 'autorenew' : 'download'}</span>{T('บันทึกเป็นรูป', 'Save image')}
          </button>
          <button className="tl-btn" onClick={() => setConfirm('clear')} disabled={placedCount === 0}>
            <span className="material-icons-round">move_down</span>{T('ล้างตาราง', 'Clear tiers')}
          </button>
          <button className="tl-btn" onClick={() => setConfirm('tiers')}>
            <span className="material-icons-round">format_color_reset</span>{T('รีเซ็ตตาราง', 'Reset table')}
          </button>
          <button className="tl-btn danger" onClick={() => setConfirm('delete')}>
            <span className="material-icons-round">delete_sweep</span>{T('ลบทั้งหมด', 'Delete all')}
          </button>
          <button className="tl-btn" onClick={() => setConfirm('reset')}>
            <span className="material-icons-round">restart_alt</span>{T('รีเซ็ต', 'Reset')}
          </button>
        </div>
      </div>

      {/* ตารางเทียร์ */}
      <div className="tl-board">
        {board.tiers.map((t, i) => (
          <div key={t.id} className={'tl-row' + (drag?.zone === t.id ? ' over' : '') + (selected && selZone !== t.id ? ' can-drop' : '')}>
            <button className="tl-label" style={{ background: t.bg, color: t.fg }} onClick={() => setEditing(t.id)} title={T('แก้ไขเทียร์', 'Edit tier')}>
              <span>{t.label || ' '}</span>
            </button>
            <div className="tl-items" data-zone={t.id} onClick={e => onZoneClick(e, t.id)}>
              {renderZone(t.id, t.items)}
              {t.items.length === 0 && !drag && <span className="tl-hint">{selected ? T('แตะเพื่อวางที่นี่', 'Tap to place here') : ''}</span>}
            </div>
            <div className="tl-ctrl">
              <button onClick={() => setEditing(t.id)} aria-label={T('ตั้งค่า', 'Settings')}><span className="material-icons-round">settings</span></button>
              <button onClick={() => moveTier(i, -1)} disabled={i === 0} aria-label={T('เลื่อนขึ้น', 'Move up')}><span className="material-icons-round">keyboard_arrow_up</span></button>
              <button onClick={() => moveTier(i, 1)} disabled={i === board.tiers.length - 1} aria-label={T('เลื่อนลง', 'Move down')}><span className="material-icons-round">keyboard_arrow_down</span></button>
            </div>
          </div>
        ))}
        <button className="tl-add-row" onClick={() => update(b => { b.tiers.push({ id: uid(), label: String.fromCharCode(69 + Math.max(0, b.tiers.length - 5)), bg: BG_SWATCHES[(b.tiers.length * 3) % 11], fg: '#1a1a1a', items: [] }); return b })}>
          <span className="material-icons-round">add</span>{T('เพิ่มแถว', 'Add tier')}
        </button>
      </div>

      {/* คลังเรนเจอร์ */}
      <div className="tl-pool-head">
        <span className="material-icons-round">inventory_2</span>
        <b>{T('เรนเจอร์', 'Rangers')}</b>
        <span className="tl-count">{board.pool.length}</span>
        <span className="tl-sub">{T('จาก Meta PVP · Legend · Users ≥ 2', 'from Meta PVP · Legend · Users ≥ 2')}</span>
      </div>
      <div className={'tl-pool' + (drag?.zone === POOL ? ' over' : '')} data-zone={POOL} onClick={e => onZoneClick(e, POOL)}>
        {loading && <div className="tl-empty"><span className="material-icons-round animate-spin">autorenew</span></div>}
        {!loading && board.pool.length === 0 && !drag && (
          <div className="tl-empty">{T('ไม่มีเรนเจอร์ในคลัง — กด "เพิ่มเรนเจอร์" หรือ "รีเซ็ต"', 'No rangers left — press "Add ranger" or "Reset"')}</div>
        )}
        {renderZone(POOL, board.pool)}
      </div>
      <p className="tl-tip">
        <span className="material-icons-round">touch_app</span>
        {T('แตะเรนเจอร์เพื่อเลือก แล้วกดเทียร์ด้านล่าง · คอมลากวางได้เลย · มือถือกดค้างแล้วลาก', 'Tap a ranger, then a tier below · drag & drop on desktop · long-press to drag on phones')}
      </p>

      {/* แถบล่าง: ตัวที่เลือก → ย้ายไปเทียร์ */}
      {selected && (
        <div className="tl-dock">
          <div className="tl-dock-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(selected)} alt="" />
            <b>{nameOf(selected)}</b>
            <button className="tl-dock-x" onClick={() => setSelected(null)} aria-label={T('ยกเลิก', 'Cancel')}><span className="material-icons-round">close</span></button>
          </div>
          <div className="tl-dock-row">
            {board.tiers.map(t => (
              <button key={t.id} className={'tl-dock-tier' + (selZone === t.id ? ' here' : '')} style={{ background: t.bg, color: t.fg }}
                onClick={() => { moveItem(selected, t.id); setSelected(null) }}>{t.label || '·'}</button>
            ))}
            <button className={'tl-dock-btn' + (selZone === POOL ? ' here' : '')} onClick={() => { moveItem(selected, POOL, 0); setSelected(null) }}>
              <span className="material-icons-round">inventory_2</span>{T('คลัง', 'Pool')}
            </button>
            <button className="tl-dock-btn danger" onClick={() => removeItem(selected)}>
              <span className="material-icons-round">delete</span>{T('ลบ', 'Remove')}
            </button>
          </div>
        </div>
      )}

      {/* ภาพที่กำลังลาก */}
      {drag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tl-ghost" src={thumb(drag.id)} alt="" style={{ left: drag.x, top: drag.y }} />
      )}

      {/* ตั้งค่าเทียร์ */}
      {editingTier && (
        <Sheet title={T('แก้ไขเทียร์', 'Edit tier')} onClose={() => setEditing(null)}>
          <div className="tl-edit-preview" style={{ background: editingTier.bg, color: editingTier.fg }}>{editingTier.label || ' '}</div>
          <label className="tl-field">
            <span>{T('ข้อความ', 'Label')}</span>
            <input value={editingTier.label} maxLength={24} autoFocus
              onChange={e => { const v = e.target.value; update(b => { b.tiers.find(x => x.id === editingTier.id)!.label = v; return b }) }} />
          </label>
          <ColorField label={T('สีพื้นหลัง', 'Background')} value={editingTier.bg} swatches={BG_SWATCHES}
            onChange={v => update(b => { b.tiers.find(x => x.id === editingTier.id)!.bg = v; return b })} />
          <ColorField label={T('สีตัวอักษร', 'Text colour')} value={editingTier.fg} swatches={FG_SWATCHES}
            onChange={v => update(b => { b.tiers.find(x => x.id === editingTier.id)!.fg = v; return b })} />
          <div className="tl-edit-actions">
            <button className="tl-btn" onClick={() => update(b => { const i = b.tiers.findIndex(x => x.id === editingTier.id); b.tiers.splice(i, 0, { id: uid(), label: 'New', bg: '#bfbfbf', fg: '#1a1a1a', items: [] }); return b })}>
              <span className="material-icons-round">vertical_align_top</span>{T('เพิ่มแถวด้านบน', 'Add row above')}
            </button>
            <button className="tl-btn" onClick={() => update(b => { const i = b.tiers.findIndex(x => x.id === editingTier.id); b.tiers.splice(i + 1, 0, { id: uid(), label: 'New', bg: '#bfbfbf', fg: '#1a1a1a', items: [] }); return b })}>
              <span className="material-icons-round">vertical_align_bottom</span>{T('เพิ่มแถวด้านล่าง', 'Add row below')}
            </button>
            <button className="tl-btn" disabled={editingTier.items.length === 0}
              onClick={() => update(b => { const t = b.tiers.find(x => x.id === editingTier.id)!; b.pool = [...t.items, ...b.pool]; t.items = []; return b })}>
              <span className="material-icons-round">move_down</span>{T('ย้ายทุกตัวกลับคลัง', 'Send all back to pool')}
            </button>
            <button className="tl-btn danger" disabled={board.tiers.length <= 1}
              onClick={() => { update(b => { const t = b.tiers.find(x => x.id === editingTier.id)!; b.pool = [...t.items, ...b.pool]; b.tiers = b.tiers.filter(x => x.id !== t.id); return b }); setEditing(null) }}>
              <span className="material-icons-round">delete</span>{T('ลบแถวนี้', 'Delete this row')}
            </button>
          </div>
        </Sheet>
      )}

      {/* ยืนยัน */}
      {confirm && (
        <Sheet title={confirm === 'clear' ? T('ล้างตาราง?', 'Clear all tiers?') : confirm === 'tiers' ? T('รีเซ็ตตั้งค่าตาราง?', 'Reset the table settings?') : confirm === 'delete' ? T('ลบเรนเจอร์ทั้งหมด?', 'Delete every ranger?') : T('รีเซ็ตทั้งหมด?', 'Reset everything?')} onClose={() => setConfirm(null)}>
          <p className="tl-confirm-text">
            {confirm === 'clear' && T('ย้ายเรนเจอร์ทุกตัวในตารางกลับไปที่คลัง (แถวและสีเทียร์ยังอยู่)', 'Moves every ranger in the tiers back to the pool (rows and colours stay)')}
            {confirm === 'tiers' && T('ตารางกลับเป็นแถว S A B C D สีเดิม และชื่อตารางเริ่มต้น เรนเจอร์ในตารางกลับไปที่คลัง (เรนเจอร์ที่เพิ่มเองไม่หาย)', 'The table goes back to S A B C D rows, default colours and the default title. Placed rangers go back to the pool (rangers you added are kept)')}
            {confirm === 'delete' && T('ลบเรนเจอร์ทั้งหมดทั้งในตารางและคลัง เหลือตารางเปล่าให้เพิ่มเองทีละตัว', 'Removes every ranger from the tiers and the pool, leaving an empty board to fill yourself')}
            {confirm === 'reset' && T('กลับไปเป็นค่าเริ่มต้น: แถว S A B C D และเรนเจอร์จาก Meta PVP ลีค Legend ล่าสุด', 'Back to the defaults: S A B C D rows and the latest Meta PVP Legend rangers')}
          </p>
          <div className="tl-confirm-btns">
            <button className="tl-btn" onClick={() => setConfirm(null)}>{T('ยกเลิก', 'Cancel')}</button>
            <button className={'tl-btn ' + (confirm === 'clear' || confirm === 'tiers' ? 'primary' : 'danger')} onClick={doConfirm}>{T('ยืนยัน', 'Confirm')}</button>
          </div>
        </Sheet>
      )}

      {picking && createPortal(
        <RangerPicker
          title={T('เพิ่มเรนเจอร์', 'Add a ranger')}
          allowAll
          view={pickerView}
          onViewChange={next => setPickerView(v => ({ ...v, ...next }))}
          onPick={r => { setPicking(false); addRanger(r.id) }}
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}

      {toast && <div className="tl-toast">{toast}</div>}
    </div>
  )
}

// ── ส่วนประกอบย่อย ────────────────────────────────────────

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="tl-sheet-back" onPointerDown={onClose}>
      <div className="tl-sheet" onPointerDown={e => e.stopPropagation()}>
        <div className="tl-sheet-head">
          <i className="tl-grab" />
          <b>{title}</b>
          <button onClick={onClose} aria-label="close"><span className="material-icons-round">close</span></button>
        </div>
        <div className="tl-sheet-body">{children}</div>
      </div>
    </div>
  )
}

function ColorField({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange: (v: string) => void }) {
  return (
    <div className="tl-field">
      <span>{label}</span>
      <div className="tl-swatches">
        {swatches.map(c => (
          <button key={c} className={'tl-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
        <label className="tl-swatch custom" title="custom">
          <input type="color" value={value} onChange={e => onChange(e.target.value)} />
          <span className="material-icons-round">colorize</span>
        </label>
      </div>
    </div>
  )
}

// ── วาดเทียร์ลิสต์ลง canvas → PNG ───────────────────────────

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

async function renderBoard(b: Board): Promise<Blob> {
  const W = 1200, PAD = 24, LABEL = 130, CELL = 96, GAP = 6, TITLE_H = b.title.trim() ? 70 : 0
  const perRow = Math.floor((W - PAD * 2 - LABEL - GAP * 2) / (CELL + GAP))
  const heights = b.tiers.map(t => Math.max(1, Math.ceil(t.items.length / perRow)) * (CELL + GAP) + GAP)
  const H = PAD + TITLE_H + heights.reduce((a, h) => a + h + 4, 0) + PAD + 22
  const dpr = 2
  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = H * dpr
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#17181d'; ctx.fillRect(0, 0, W, H)
  const font = (w: number, px: number) => `${w} ${px}px "LINE Seed Sans TH", "Kanit", system-ui, sans-serif`

  if (TITLE_H) {
    ctx.fillStyle = '#ffffff'; ctx.font = font(800, 34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(b.title.trim(), W / 2, PAD + TITLE_H / 2 - 6)
  }

  const ids = [...new Set(b.tiers.flatMap(t => t.items))]
  const imgs = new Map(await Promise.all(ids.map(async id => [id, await loadImage(proxyFile(thumb(id)))] as const)))

  let y = PAD + TITLE_H
  b.tiers.forEach((t, i) => {
    const h = heights[i]
    ctx.fillStyle = '#22242b'; ctx.fillRect(PAD, y, W - PAD * 2, h)
    ctx.fillStyle = t.bg; ctx.fillRect(PAD, y, LABEL, h)
    ctx.fillStyle = t.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let size = 40
    ctx.font = font(800, size)
    while (ctx.measureText(t.label).width > LABEL - 16 && size > 14) { size -= 2; ctx.font = font(800, size) }
    ctx.fillText(t.label, PAD + LABEL / 2, y + h / 2)
    t.items.forEach((id, k) => {
      const cx = PAD + LABEL + GAP + (k % perRow) * (CELL + GAP)
      const cy = y + GAP + Math.floor(k / perRow) * (CELL + GAP)
      const img = imgs.get(id)
      ctx.save()
      ctx.beginPath(); ctx.roundRect(cx, cy, CELL, CELL, 10); ctx.clip()
      ctx.fillStyle = '#2d3039'; ctx.fillRect(cx, cy, CELL, CELL)
      if (img) {
        const k2 = Math.min(CELL / img.width, CELL / img.height)
        const iw = img.width * k2, ih = img.height * k2
        ctx.drawImage(img, cx + (CELL - iw) / 2, cy + (CELL - ih) / 2, iw, ih)
      }
      ctx.restore()
    })
    y += h + 4
  })

  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = font(500, 14); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('Line Ranger Kiwi · Tier List', W - PAD, H - PAD + 6)

  return new Promise((res, rej) => cv.toBlob(bl => (bl ? res(bl) : rej(new Error('toBlob'))), 'image/png'))
}
