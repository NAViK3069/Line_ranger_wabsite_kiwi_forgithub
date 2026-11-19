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
import GachaRangerDetailPopup from '@/components/GachaRangerDetailPopup'

// ── ข้อมูล ──────────────────────────────────────────────

interface Tier { id: string; label: string; bg: string; fg: string; items: string[] }
/**
 * meta    = ชุดเรนเจอร์แนะนำ (Meta PVP) ล่าสุดที่บอร์ดนี้ซิงก์ไว้ — ใช้เทียบว่า Meta วันนี้เปลี่ยนไหม
 * removed = ตัวแนะนำที่ผู้เล่นลบทิ้งเอง (ซิงก์รายวันจะไม่เอากลับมา จนกว่าจะกด Reset)
 * metaOff = กด Delete all แล้ว → หยุดซิงก์ตัวแนะนำ จนกว่าจะกด Reset
 */
interface Board { title: string; tiers: Tier[]; pool: string[]; meta?: string[]; removed?: string[]; metaOff?: boolean }

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

// ── การ์ดเรนเจอร์: พื้นหลังธาตุ + กรอบตามร่าง/ดาว + วงกลมธาตุมุมซ้ายล่าง + ดาวบนขอบบน ──

interface RangerInfo { name: string; element?: string; grade?: number; evolution?: string; type?: string }
const ELEMENTS = ['water', 'wood', 'fire', 'light', 'dark']
const hasElement = (e?: string): e is string => !!e && ELEMENTS.includes(e)
const bgSrc = (e: string) => `/tierlist/bg-${e}.png`
const elSrc = (e: string) => `/tierlist/el-${e}.png`
/** ชนิดเรนเจอร์ (มุมขวาล่าง) — รูปชุดเดียวกับตัวกรองในหน้าอื่น */
const TYPE_SRC: Record<string, string> = { STR: '/gacha/images/Str.png', AGI: '/gacha/images/Agi.png', INT: '/gacha/images/Int.png' }
const typeSrc = (t?: string) => (t && TYPE_SRC[t.toUpperCase()]) || null
/** ขนาดวงกลมธาตุ / ไอคอนชนิด เทียบกับการ์ด (ต้องตรงกับ .tl-el / .tl-type ใน tierlist.css) */
const EL_BADGE = 0.31, TYPE_BADGE = 0.27

type FrameKind = 'gold' | 'hyper' | 'ultra' | 'brown'
/** 4 ดาวลงมา = น้ำตาล · ไฮเปอร์ = ชมพู · อัลตร้า = ฟ้าเขียว · ร่างธรรมดา/9 ดาว = ทอง */
function frameOf(info?: RangerInfo): FrameKind {
  if (info?.grade && info.grade <= 4) return 'brown'
  if (info?.evolution === 'hyper') return 'hyper'
  if (info?.evolution === 'ultra') return 'ultra'
  return 'gold'
}
/**
 * ธีมสีตามกรอบของเกม (ใช้ทั้ง CSS และตอนวาดรูป PNG)
 * frame = จุดสีกรอบ (ไล่เฉียง 135°) · dark = พื้นหลังมืดของตัวที่ไม่มีธาตุ (บน → ล่าง)
 */
const THEMES: Record<FrameKind, { frame: string[]; dark: [string, string] }> = {
  gold: { frame: ['#ffe36e', '#ffb300', '#f39800', '#ffd84d', '#e48a00'], dark: ['#3b3b3e', '#141416'] },
  ultra: { frame: ['#b0fff9', '#1fe6e2', '#08bfcc', '#74f3ee', '#07a2b2'], dark: ['#2c2f72', '#0c0d2c'] },
  hyper: { frame: ['#ffb8ef', '#ff30ca', '#de12a0', '#ff7fe0', '#bd0c87'], dark: ['#521046', '#1a0517'] },
  brown: { frame: ['#8b5529', '#8b5529'], dark: ['#5f3a1b', '#2f1b0b'] },
}
const stopsCss = (stops: string[]) => stops.map((c, i, a) => `${c} ${Math.round((i / (a.length - 1)) * 100)}%`).join(', ')
const frameCss = (k: FrameKind) => `linear-gradient(135deg, ${stopsCss(THEMES[k].frame)})`
/** แสงเงาเฉียงบนพื้นมืด (เหมือนกระจกในกรอบตัวอย่าง) */
const SHEEN = 'linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0) 64%)'
const darkCss = (k: FrameKind) => `${SHEEN}, linear-gradient(180deg, ${THEMES[k].dark[0]}, ${THEMES[k].dark[1]})`
/** รูปดาวชุดเดียวกับหน้ากาชา: ธรรมดา = ทอง · ไฮเปอร์ = # (ชมพู) · อัลตร้า = + (ฟ้า) · 9 ดาวมีแบบเดียว */
function starSrc(info?: RangerInfo): string | null {
  const g = Math.max(0, Math.min(9, info?.grade ?? 0))
  if (!g) return null
  const mark = g >= 9 ? '' : info?.evolution === 'hyper' ? '#' : info?.evolution === 'ultra' ? '+' : ''
  return `/gacha/images/${encodeURIComponent(`${g}${mark}star`)}.png`
}

function CardFace({ id, info, alt }: { id: string; info?: RangerInfo; alt: string }) {
  const el = hasElement(info?.element) ? info!.element! : null
  const stars = starSrc(info)
  return (
    <>
      <span className={'tl-card' + (el ? ' has-el' : '')} style={{ backgroundImage: el ? `url(${bgSrc(el)})` : darkCss(frameOf(info)) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb(id)} alt={alt} draggable={false} loading="lazy" />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {el && <img className="tl-el" src={elSrc(el)} alt="" draggable={false} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {typeSrc(info?.type) && <img className="tl-type" src={typeSrc(info?.type)!} alt={info?.type} draggable={false} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {stars && <img className="tl-stars" src={stars} alt={`${info?.grade ?? ''}★`} draggable={false} />}
    </>
  )
}
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

/**
 * ซิงก์ตัวแนะนำกับ Meta ล่าสุด (ข้อมูล Meta อัปเดตวันละครั้ง) — ผู้เล่นกดรีเองไม่ได้
 * - ตัวที่จัดลงเทียร์แล้ว: อยู่ที่เดิม
 * - คลัง: ตัวแนะนำชุดใหม่ (เรียงตาม Meta) ตามด้วยตัวที่ผู้เล่นเพิ่มเอง · ตัวที่หลุด Meta ออกจากคลัง
 */
function syncMeta(b: Board, fresh: string[]): Board {
  if (b.metaOff || !fresh.length) return b
  if (b.meta && b.meta.join() === fresh.join()) return b
  const oldMeta = new Set(b.meta ?? b.pool) // บอร์ดเก่าที่ยังไม่มี meta: ถือว่าคลังทั้งหมดคือตัวแนะนำ
  const freshSet = new Set(fresh)
  const placed = new Set(b.tiers.flatMap(t => t.items))
  const removed = new Set(b.removed ?? [])
  const userAdded = b.pool.filter(id => !oldMeta.has(id) && !freshSet.has(id))
  const pool = [...fresh.filter(id => !placed.has(id) && !removed.has(id)), ...userAdded]
  return { ...b, pool, meta: fresh }
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
  const [book, setBook] = useState<Record<string, RangerInfo>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  /** เรนเจอร์ที่เปิดดูรายละเอียด (ป๊อปอัปเดียวกับ Ranger Book) */
  const [detailId, setDetailId] = useState<string | null>(null)
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
    setBoard({ title: 'Line Rangers Tier List', tiers: freshTiers(), pool, meta: pool, removed: [], metaOff: false })
    setSelected(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    const saved = loadBoard()
    if (!saved) { resetBoard(); return }
    setBoard(saved); setLoading(false)
    // Meta อัปเดตทุกวัน → เทียบชุดแนะนำล่าสุดแล้วซิงก์คลังให้เอง
    if (!saved.metaOff) defaultPool().then(fresh => setBoard(b => (b ? syncMeta(b, fresh) : b))).catch(() => {})
  }, [resetBoard])
  useEffect(() => { if (board) try { localStorage.setItem(STORE_KEY, JSON.stringify(board)) } catch { /* เต็ม */ } }, [board])

  // ชื่อเรนเจอร์ (ใช้ใน title / แถบเลือก) — จาก ranger-book ชุดเดียวกับตัวเลือก
  useEffect(() => {
    apiFetch('/api/ranger-book').then(r => r.json()).then((d: { rangers?: ({ id: string } & RangerInfo)[] }) => {
      setBook(Object.fromEntries((d.rangers ?? []).map(r => [r.id, { name: r.name, element: r.element, grade: r.grade, evolution: r.evolution, type: r.type }])))
    }).catch(() => {})
  }, [])
  const nameOf = (id: string) => tRanger(id, book[id]?.name ?? id)

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
    update(b => {
      b.pool = b.pool.filter(x => x !== id); b.tiers.forEach(t => { t.items = t.items.filter(x => x !== id) })
      if (b.meta?.includes(id)) b.removed = [...new Set([...(b.removed ?? []), id])]
      return b
    })
    setSelected(null)
  }

  const addRanger = (id: string) => {
    if (!board) return
    const z = zoneOf(board, id)
    if (z) { setSelected(id); flash(T('มีเรนเจอร์ตัวนี้อยู่แล้ว', 'Already on the board')); return }
    update(b => { b.pool.unshift(id); b.removed = (b.removed ?? []).filter(x => x !== id); return b })
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
      const blob = await renderBoard(board, book)
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
    if (confirm === 'delete') update(b => { b.pool = []; b.tiers.forEach(t => { t.items = [] }); b.metaOff = true; return b })
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
      style={{ background: frameCss(frameOf(book[id])) }}
      title={nameOf(id)}
      onPointerDown={e => onItemPointerDown(e, id)}
      onTouchStart={e => onItemTouchStart(e, id)}
      onClick={() => onItemClick(id)}
      onContextMenu={e => e.preventDefault()}
    >
      <CardFace id={id} info={book[id]} alt={nameOf(id)} />
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
        <span className="tl-sub">{board.metaOff ? T('ปิดตัวแนะนำอยู่ · กดรีเซ็ตเพื่อเอากลับมา', 'Recommendations off · Reset to bring them back') : T('จาก Meta PVP · Legend · Users ≥ 2 · อัปเดตทุกวัน', 'from Meta PVP · Legend · Users ≥ 2 · updates daily')}</span>
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
            <button className="tl-dock-btn" onClick={() => setDetailId(selected)} aria-label={T('ดูรายละเอียด', 'View details')} title={T('ดูรายละเอียด', 'View details')}>
              <span className="material-icons-round">visibility</span>{T('ดู', 'Info')}
            </button>
            <button className={'tl-dock-btn' + (selZone === POOL ? ' here' : '')} onClick={() => { moveItem(selected, POOL, 0); setSelected(null) }}>
              <span className="material-icons-round">inventory_2</span>{T('คลัง', 'Pool')}
            </button>
            <button className="tl-dock-btn danger" onClick={() => removeItem(selected)}>
              <span className="material-icons-round">delete</span>{T('ลบ', 'Remove')}
            </button>
          </div>
        </div>
      )}

      {/* ป๊อปอัปรายละเอียด — portal ไป body + ชั้นสูงกว่าแถบล่าง (.tl-dock z 60) */}
      {detailId && createPortal(
        <div style={{ position: 'relative', zIndex: 80 }}>
          <GachaRangerDetailPopup
            rangerId={detailId}
            rangerName={book[detailId]?.name ?? detailId}
            rangerImageUrl={thumb(detailId)}
            mode="book"
            onClose={() => setDetailId(null)}
          />
        </div>,
        document.body,
      )}

      {/* ภาพที่กำลังลาก */}
      {drag && (
        <div className="tl-item tl-ghost" style={{ left: drag.x, top: drag.y, background: frameCss(frameOf(book[drag.id])) }}>
          <CardFace id={drag.id} info={book[drag.id]} alt="" />
        </div>
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
            {confirm === 'delete' && <><br />{T('ตัวแนะนำจาก Meta จะไม่กลับมาเองอีก จนกว่าจะกดรีเซ็ต', 'Meta recommendations stop coming back until you press Reset')}</>}
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

/** ขนาดรูปดาวเทียบกับการ์ด (ต้องตรงกับ .tl-stars ใน tierlist.css) */
const STAR_W = 0.84, STAR_LIFT = 0.06
/** ความมืดที่ทับพื้นหลังธาตุ (ต้องตรงกับ .tl-card::before ใน tierlist.css) */
const BG_DIM = 0.2

/** กรอบ + พื้นหลังธาตุ + รูป + วงกลมธาตุ + ดาว ลงแคนวาส (หน้าตาเดียวกับการ์ดบนหน้าเว็บ) */
function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, info: RangerInfo | undefined,
  img: HTMLImageElement | null, bg: HTMLImageElement | null, badge: HTMLImageElement | null, starImg: HTMLImageElement | null,
  typeImg: HTMLImageElement | null) {
  const kind = frameOf(info), F = Math.round(S * 0.07), R = S * 0.14
  // กรอบ
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, S, S, R); ctx.clip()
  const fg = ctx.createLinearGradient(x, y, x + S, y + S)
  THEMES[kind].frame.forEach((c, i, a) => fg.addColorStop(i / (a.length - 1), c))
  ctx.fillStyle = fg
  ctx.fillRect(x, y, S, S)
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(x + 0.75, y + 0.75, S - 1.5, S - 1.5, R); ctx.stroke()
  ctx.restore()
  // ด้านใน: พื้นหลังธาตุ + รูปเรนเจอร์
  const ix = x + F, iy = y + F, IS = S - F * 2
  ctx.save()
  ctx.beginPath(); ctx.roundRect(ix, iy, IS, IS, Math.max(2, R - F)); ctx.clip()
  if (bg) {
    ctx.drawImage(bg, ix - IS * 0.04, iy - IS * 0.04, IS * 1.08, IS * 1.08)
    ctx.fillStyle = `rgba(0,0,0,${BG_DIM})`; ctx.fillRect(ix, iy, IS, IS) // พื้นหลังมืดลงนิดหน่อย
  } else {
    // ไม่มีธาตุ: พื้นมืดตามธีมกรอบ + แสงเฉียง (ตรงกับ darkCss)
    const dg = ctx.createLinearGradient(ix, iy, ix, iy + IS)
    dg.addColorStop(0, THEMES[kind].dark[0]); dg.addColorStop(1, THEMES[kind].dark[1])
    ctx.fillStyle = dg; ctx.fillRect(ix, iy, IS, IS)
    const a = (115 - 90) * Math.PI / 180, cx = ix + IS / 2, cy = iy + IS / 2, half = IS * 0.75
    const sg = ctx.createLinearGradient(cx - Math.cos(a) * half, cy - Math.sin(a) * half, cx + Math.cos(a) * half, cy + Math.sin(a) * half)
    sg.addColorStop(0.4, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.09)'); sg.addColorStop(0.64, 'rgba(255,255,255,0)')
    ctx.fillStyle = sg; ctx.fillRect(ix, iy, IS, IS)
  }
  if (img) {
    const k = Math.min(IS / img.width, IS / img.height)
    const w = img.width * k, h = img.height * k
    // เงาอ่อนๆ ใต้ตัวเรนเจอร์ (ตรงกับ drop-shadow ของ .tl-card img)
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = S * 0.035 * 2; ctx.shadowOffsetY = S * 0.02
    ctx.drawImage(img, ix + (IS - w) / 2, iy + (IS - h) / 2, w, h)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  }
  ctx.restore()
  // วงกลมธาตุ มุมซ้ายล่าง
  const EB = S * EL_BADGE, TB = S * TYPE_BADGE
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1
  if (badge) ctx.drawImage(badge, x, y + S - EB, EB, EB)
  // ชนิดเรนเจอร์ มุมขวาล่าง
  if (typeImg) ctx.drawImage(typeImg, x + S - TB, y + S - TB, TB, TB)
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  // ดาว บนขอบบน
  if (starImg) {
    const w = S * STAR_W, h = w * (starImg.height / starImg.width)
    ctx.drawImage(starImg, x + (S - w) / 2, y - S * STAR_LIFT, w, h)
  }
}

async function renderBoard(b: Board, book: Record<string, RangerInfo>): Promise<Blob> {
  const W = 1200, PAD = 24, LABEL = 130, CELL = 96, GAP = 8, TITLE_H = b.title.trim() ? 70 : 0
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
  const els = [...new Set(ids.map(id => book[id]?.element).filter(hasElement))]
  const bgs = new Map(await Promise.all(els.map(async e => [e, await loadImage(bgSrc(e))] as const)))
  const badges = new Map(await Promise.all(els.map(async e => [e, await loadImage(elSrc(e))] as const)))
  const starFiles = [...new Set(ids.map(id => starSrc(book[id])).filter((x): x is string => !!x))]
  const starImgs = new Map(await Promise.all(starFiles.map(async f => [f, await loadImage(f)] as const)))
  const typeImgs = new Map(await Promise.all(Object.entries(TYPE_SRC).map(async ([k, f]) => [k, await loadImage(f)] as const)))

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
      const info = book[id], e = info?.element ?? ''
      drawCard(ctx, cx, cy, CELL, info, imgs.get(id) ?? null, bgs.get(e) ?? null, badges.get(e) ?? null, starImgs.get(starSrc(info) ?? '') ?? null, typeImgs.get((info?.type ?? '').toUpperCase()) ?? null)
    })
    y += h + 4
  })

  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = font(500, 14); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('Line Ranger Kiwi · Tier List', W - PAD, H - PAD + 6)

  return new Promise((res, rej) => cv.toBlob(bl => (bl ? res(bl) : rej(new Error('toBlob'))), 'image/png'))
}
