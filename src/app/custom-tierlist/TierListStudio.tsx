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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RangerPicker, { PICKER_VIEW_DEFAULT, type PickerView } from '../lobby/RangerPicker'
import { useLanguage } from '@/contexts/LanguageContext'
import { apiFetch, proxyFile } from '@/lib/staticApi'
import { adminFetch } from '@/lib/adminApi'
import GachaRangerDetailPopup from '@/components/GachaRangerDetailPopup'

// ── ข้อมูล ──────────────────────────────────────────────

interface Tier { id: string; label: string; bg: string; fg: string; items: string[] }
/**
 * meta    = ชุดเรนเจอร์แนะนำ (Meta PVP) ล่าสุดที่บอร์ดนี้ซิงก์ไว้ — ใช้เทียบว่า Meta วันนี้เปลี่ยนไหม
 * removed = ตัวแนะนำที่ผู้เล่นลบทิ้งเอง (ซิงก์รายวันจะไม่เอากลับมา จนกว่าจะกด Reset)
 * metaOff = กด Delete all แล้ว → หยุดซิงก์ตัวแนะนำ จนกว่าจะกด Reset
 */
interface Board {
  title: string; tiers: Tier[]; pool: string[]; meta?: string[]; removed?: string[]; metaOff?: boolean
  /** updatedAt ของเทียร์ลิสต์แอดมินที่บอร์ดนี้สร้างมาจาก (null = ไม่มีของแอดมิน) */
  base?: string | null
  /** ผู้ใช้แก้บอร์ดเองแล้ว — false = ยังเป็นของแอดมินล้วน จะตามของแอดมินที่อัปเดตใหม่ให้เอง */
  edited?: boolean
}

/** เทียร์ลิสต์ที่แอดมินจัด (content/tierlist.json → /data/tierlist.json) */
interface PublishedTierList { title?: string; tiers?: { label: string; bg: string; fg: string; items: string[] }[]; updatedAt?: string | null }
const DEFAULT_TITLE = 'Line Rangers Tier List'

// ── สีไล่ระดับของป้ายเทียร์ (สร้างจากสีที่ผู้ใช้เลือก — ใช้ทั้งหน้าเว็บและตอนวาด PNG) ──
function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 127, 127]
}
function rgbHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l * 100]
  const d = mx - mn, sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, sat * 100, l * 100]
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const hsl = (h: number, sat: number, l: number) => `hsl(${(((h % 360) + 360) % 360).toFixed(1)}, ${clamp(sat, 0, 100).toFixed(1)}%, ${clamp(l, 0, 100).toFixed(1)}%)`
/**
 * 3 จุดสีสดๆ จากสีที่เลือก: [บนซ้าย สว่าง+ขยับเฉดไปข้างหนึ่ง, สีหลักอิ่มขึ้น, ล่างขวา เข้มนิดๆ+ขยับเฉดอีกข้าง]
 * (ไม่ผสมดำเหมือนเดิม — เดิมเหลืองกลายเป็นน้ำตาล ดูหม่น)
 * สีเทา/ขาว/ดำ (ไม่มีเฉด) ไม่เร่งความอิ่ม
 */
export function labelStops(bg: string): [string, string, string] {
  const [h, sat, l] = rgbHsl(hexRgb(bg))
  const boost = sat < 8 ? 0 : 1
  const s1 = sat + 28 * boost
  return [
    hsl(h - 14 * boost, s1 + 6, l + 12),
    hsl(h, s1, l - 2),
    hsl(h + 22 * boost, s1 + 10, l - 16),
  ]
}
export const labelGradient = (bg: string) => {
  const [a, b, c] = labelStops(bg)
  return `linear-gradient(150deg, ${a} 0%, ${b} 52%, ${c} 100%)`
}
/** ตัวหนังสือสีเข้ม → เงาขาวจาง · ตัวหนังสือสีอ่อน → เงาดำ (อ่านง่ายบนพื้นไล่สี) */
export function labelTextShadow(fg: string): string {
  const [r, g, b] = hexRgb(fg)
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)'
}

/** ตัดข้อความเป็นบรรทัดตามความกว้าง (ภาษาไทยตัดตามคำด้วย Intl.Segmenter) · เกิน maxLines → ใส่ "…" ท้ายบรรทัดสุดท้าย */
function wrapLabel(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  type Seg = { segment: string }
  const Segmenter = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(t: string): Iterable<Seg> } }).Segmenter
  const words: string[] = Segmenter ? [...new Segmenter('th', { granularity: 'word' }).segment(text)].map(x => x.segment) : text.split(/(\s+)/)
  const lines: string[] = []
  let cur = ''
  const push = () => { lines.push(cur.trimEnd()); cur = '' }
  for (const w of words) {
    if (!cur && /^\s+$/.test(w)) continue
    if (ctx.measureText(cur + w).width <= maxW) { cur += w; continue }
    if (cur) push()
    // คำเดียวยาวเกินบรรทัด → ตัดทีละตัวอักษร
    let piece = ''
    for (const ch of w.trimStart()) {
      if (ctx.measureText(piece + ch).width > maxW && piece) { lines.push(piece); piece = '' }
      piece += ch
    }
    cur = piece
  }
  if (cur.trim()) push()
  if (lines.length <= maxLines) return lines
  const out = lines.slice(0, maxLines)
  let last = out[maxLines - 1]
  while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
  out[maxLines - 1] = last.trimEnd() + '…'
  return out
}

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
/** แถวของแอดมิน (withItems = เอาเรนเจอร์มาด้วย) — ไม่มีของแอดมินก็ใช้ S A B C D */
function tiersFrom(pub: PublishedTierList | null, withItems: boolean): Tier[] {
  if (!pub?.tiers?.length) return freshTiers()
  return pub.tiers.map(t => ({
    id: uid(), label: String(t.label ?? ''), bg: t.bg || '#ff7f7f', fg: t.fg || '#1a1a1a',
    items: withItems && Array.isArray(t.items) ? [...new Set(t.items.filter(x => typeof x === 'string'))] : [],
  }))
}
// ── ไฟล์ .txt (นำเข้า / ส่งออก) ─────────────────────────
// อ่าน/แก้ด้วยมือได้:
//   Line Ranger Kiwi Tier List v1
//   title: ชื่อตาราง
//   tier: S | #ff7f7f | #1a1a1a      ← ชื่อแถว | สีพื้น | สีตัวหนังสือ
//   u1646e-jessica   # ชื่อเรนเจอร์ (หลัง # คือหมายเหตุ ไม่ถูกอ่าน)
//   pool:                              ← เรนเจอร์ในคลัง (ไม่ใส่ก็ได้)
// รับไฟล์ JSON {title, tiers:[{label,bg,fg,items}], pool} ด้วย
const TXT_HEADER = 'Line Ranger Kiwi Tier List v1'
/** รหัสเรนเจอร์ เช่น u1646e-jessica / g999-labirinth (ต้องมี - เสมอ กันคำอื่นหลุดเข้ามา) */
const ID_RE = /^[a-z0-9]+-[\w-]{1,80}$/i
const COLOR_RE = /^#[0-9a-f]{3,8}$/i
interface ParsedTierList { title?: string; tiers: { label: string; bg: string; fg: string; items: string[] }[]; pool: string[] }

function boardToText(b: Board, nameOf: (id: string) => string): string {
  const line = (id: string) => { const n = nameOf(id); return n && n !== id ? `${id}   # ${n}` : id }
  const out = [TXT_HEADER, '# https://ranger-kiwi.com/custom-tierlist', `title: ${b.title}`, '']
  for (const t of b.tiers) {
    out.push(`tier: ${t.label.replace(/[|\r\n]+/g, ' ')} | ${t.bg} | ${t.fg}`, ...t.items.map(line), '')
  }
  if (b.pool.length) out.push('pool:', ...b.pool.map(line), '')
  return out.join('\n')
}

function parseTierText(raw: string): ParsedTierList | null {
  const text = raw.replace(/^\uFEFF/, '').trim()
  const seen = new Set<string>()
  const take = (id: unknown) => (typeof id === 'string' && ID_RE.test(id) && !seen.has(id) ? (seen.add(id), true) : false)
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text) as { title?: unknown; tiers?: unknown; pool?: unknown }
      const tiers = (Array.isArray(j.tiers) ? j.tiers : []).map(t => {
        const r = (t ?? {}) as Record<string, unknown>
        return {
          label: String(r.label ?? '').slice(0, 40),
          bg: COLOR_RE.test(String(r.bg)) ? String(r.bg) : '#ff7f7f',
          fg: COLOR_RE.test(String(r.fg)) ? String(r.fg) : '#1a1a1a',
          items: (Array.isArray(r.items) ? r.items : []).filter(take) as string[],
        }
      })
      const pool = (Array.isArray(j.pool) ? j.pool : []).filter(take) as string[]
      return tiers.length ? { title: typeof j.title === 'string' ? j.title.slice(0, 60) : undefined, tiers, pool } : null
    } catch { return null }
  }
  const res: ParsedTierList = { tiers: [], pool: [] }
  let cur: string[] | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const ln = rawLine.trim()
    if (!ln || ln.startsWith('#') || ln === TXT_HEADER) continue
    let m = ln.match(/^title\s*:\s*(.*)$/i)
    if (m) { res.title = m[1].trim().slice(0, 60); continue }
    m = ln.match(/^tier\s*:\s*(.*)$/i)
    if (m) {
      const parts = m[1].split('|').map(x => x.trim())
      const fg = parts.length >= 3 && COLOR_RE.test(parts[parts.length - 1]) ? parts.pop()! : '#1a1a1a'
      const bg = parts.length >= 2 && COLOR_RE.test(parts[parts.length - 1]) ? parts.pop()! : '#ff7f7f'
      const tier = { label: parts.join(' | ').slice(0, 40), bg, fg, items: [] as string[] }
      res.tiers.push(tier)
      cur = tier.items
      continue
    }
    if (/^pool\s*:?$/i.test(ln)) { cur = res.pool; continue }
    const id = ln.split(/\s+/)[0]
    if (take(id)) (cur ?? res.pool).push(id)
  }
  return res.tiers.length ? res : null
}

/** บอร์ดเริ่มต้น = แถวที่แอดมินจัด + คลังจาก Meta (ตัดตัวที่แอดมินวางไว้แล้วออก) */
function buildDefault(pub: PublishedTierList | null, metaPool: string[]): Board {
  const tiers = tiersFrom(pub, true)
  const placed = new Set<string>()
  for (const t of tiers) t.items = t.items.filter(id => (placed.has(id) ? false : (placed.add(id), true)))
  return {
    title: pub?.title || DEFAULT_TITLE, tiers, pool: metaPool.filter(id => !placed.has(id)),
    meta: metaPool, removed: [], metaOff: false, base: pub?.updatedAt ?? null, edited: false,
  }
}

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

export default function TierListStudio({ mode = 'public' }: { mode?: 'public' | 'admin' }) {
  /** admin = หน้าจัดเทียร์ลิสต์เริ่มต้นในหลังบ้าน (ไม่เก็บลงเครื่อง · มีปุ่มเผยแพร่) */
  const isAdmin = mode === 'admin'
  const { lang, tRanger } = useLanguage()
  const T = useCallback((th: string, en: string) => (lang === 'th' ? th : en), [lang])
  const [board, setBoard] = useState<Board | null>(null)
  const [book, setBook] = useState<Record<string, RangerInfo>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  /** เรนเจอร์ที่เปิดดูรายละเอียด (ป๊อปอัปเดียวกับ Ranger Book) */
  const [detailId, setDetailId] = useState<string | null>(null)
  /** PC = อุปกรณ์ที่มีเมาส์ → คลิกเรนเจอร์ = เมนูลอยข้างเมาส์ · มือถือ/แท็บเล็ต = แตะแล้วขึ้นแถบล่าง */
  const [isPC, setIsPC] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const on = () => setIsPC(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  /** เมนูลอยข้างเมาส์ (PC: คลิกซ้ายหรือคลิกขวา) · x/y = ตำแหน่งที่คลิก */
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  // ดันเมนูให้อยู่ในจอเสมอ (วัดขนาดจริงหลัง render แล้วค่อยวาง)
  useLayoutEffect(() => {
    const el = ctxRef.current
    if (!ctx || !el) return
    // offsetWidth/Height = ขนาดจริงไม่โดน scale ของแอนิเมชันตอนเปิด (getBoundingClientRect จะได้เล็กกว่า)
    const m = 8, w = el.offsetWidth, h = el.offsetHeight
    const left = Math.max(m, Math.min(ctx.x + 4, window.innerWidth - w - m))
    const top = ctx.y + 4 + h > window.innerHeight - m ? Math.max(m, ctx.y - h - 4) : ctx.y + 4
    el.style.left = `${left}px`; el.style.top = `${top}px`
    el.style.transformOrigin = `${ctx.x - left}px ${ctx.y - top}px`
    el.style.visibility = 'visible'
  }, [ctx])
  // ปิดเมนูเมื่อคลิกที่อื่น / กด Esc / เลื่อนหน้า / ย่อขยายจอ
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (ctxRef.current?.contains(t)) return
      if (t.closest?.(`[data-item="${CSS.escape(ctx.id)}"]`)) return // คลิกตัวเดิม → ให้ onItemClick ปิดเมนูเอง
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [ctx])
  /** คลิกขวาที่เรนเจอร์: เปิดเมนูลอยเฉพาะอุปกรณ์ที่มีเมาส์ (มือถือกดค้าง = ลาก ไม่เปิดเมนู) */
  /** เปิดเมนูลอยที่ตำแหน่งเมาส์ (กดด้วยคีย์บอร์ด = กลางรูป) */
  const openCtx = (e: React.MouseEvent, id: string) => {
    let x = e.clientX, y = e.clientY
    if (e.detail === 0 && !x && !y) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2 }
    setSelected(null)
    setCtx({ id, x, y })
  }
  /** คลิกขวาที่เรนเจอร์: PC เปิดเมนูลอย · มือถือไม่ทำอะไร (กดค้าง = ลาก) */
  const onItemContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    if (isPC) openCtx(e, id)
  }
  const [pickerView, setPickerView] = useState<PickerView>(PICKER_VIEW_DEFAULT)
  const [confirm, setConfirm] = useState<null | 'clear' | 'tiers' | 'delete' | 'reset' | 'import'>(null)
  /** ไฟล์ที่เลือกนำเข้า (รอยืนยัน) */
  const pendingImport = useRef<{ data: ParsedTierList; name: string } | null>(null)
  /** เมนูรวมปุ่ม: file = นำเข้า/ส่งออก .txt · manage = ล้าง/รีเซ็ต/ลบ */
  const [menu, setMenu] = useState<null | 'file' | 'manage'>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? null : t)), 2200) }, [])

  // ── โหลด / บันทึก ──
  /** เทียร์ลิสต์ของแอดมินที่โหลดมาล่าสุด (ใช้ตอน Reset / Reset table) */
  const pubRef = useRef<PublishedTierList | null>(null)
  const [published, setPublished] = useState<PublishedTierList | null>(null)
  const [publishing, setPublishing] = useState(false)
  // แอดมินอ่านไฟล์ล่าสุดจาก GitHub (ของที่ deploy อาจยังเก่า) · ผู้ใช้อ่านไฟล์ที่ build ไว้
  const loadPublished = useCallback(async (): Promise<PublishedTierList | null> => {
    try {
      const r = isAdmin ? await adminFetch('/api/admin/tierlist') : await apiFetch('/api/tierlist')
      const d = r.ok ? await r.json() as PublishedTierList : null
      pubRef.current = d; setPublished(d)
      return d
    } catch { return null }
  }, [isAdmin])
  const resetBoard = useCallback(async () => {
    setLoading(true)
    const [pool, pub] = await Promise.all([defaultPool().catch(() => [] as string[]), loadPublished()])
    setBoard(buildDefault(pub, pool))
    setSelected(null)
    setLoading(false)
  }, [loadPublished])
  useEffect(() => {
    if (isAdmin) { resetBoard(); return }
    const saved = loadBoard()
    if (!saved) { resetBoard(); return }
    setBoard(saved); setLoading(false)
    loadPublished().then(pub => {
      // ยังไม่ได้แก้เอง + แอดมินเผยแพร่ฉบับใหม่ → เปลี่ยนเป็นฉบับใหม่ให้เลย
      // (บอร์ดรุ่นเก่าที่ไม่มี edited ถือว่าแก้เองแล้ว ไม่ไปทับ)
      if (saved.edited === false && (pub?.updatedAt ?? null) !== (saved.base ?? null)) { resetBoard(); return }
      // Meta อัปเดตทุกวัน → เทียบชุดแนะนำล่าสุดแล้วซิงก์คลังให้เอง
      if (!saved.metaOff) defaultPool().then(fresh => setBoard(b => (b ? syncMeta(b, fresh) : b))).catch(() => {})
    })
  }, [resetBoard, loadPublished, isAdmin])
  useEffect(() => { if (board && !isAdmin) try { localStorage.setItem(STORE_KEY, JSON.stringify(board)) } catch { /* เต็ม */ } }, [board, isAdmin])
  // แอดมินแก้แล้วยังไม่เผยแพร่ → เตือนก่อนปิดหน้า
  useEffect(() => {
    if (!isAdmin || !board?.edited) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isAdmin, board?.edited])
  /** เผยแพร่เป็นเทียร์ลิสต์เริ่มต้นของทุกคน (commit content/tierlist.json → build เว็บใหม่) */
  const publish = async () => {
    if (!board) return
    setPublishing(true)
    try {
      const r = await adminFetch('/api/admin/tierlist', {
        method: 'PUT',
        body: JSON.stringify({ title: board.title, tiers: board.tiers.map(({ label, bg, fg, items }) => ({ label, bg, fg, items })) }),
      })
      const d = await r.json() as PublishedTierList & { error?: string }
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      pubRef.current = d; setPublished(d)
      setBoard(b => (b ? { ...b, edited: false, base: d.updatedAt ?? null } : b))
      flash(T('เผยแพร่แล้ว — หน้าเว็บจะอัปเดตใน 2–5 นาที', 'Published — the site updates in 2–5 minutes'))
    } catch (err) {
      flash(T('เผยแพร่ไม่สำเร็จ: ', 'Publish failed: ') + (err instanceof Error ? err.message : ''))
    } finally { setPublishing(false) }
  }

  // ชื่อเรนเจอร์ (ใช้ใน title / แถบเลือก) — จาก ranger-book ชุดเดียวกับตัวเลือก
  useEffect(() => {
    apiFetch('/api/ranger-book').then(r => r.json()).then((d: { rangers?: ({ id: string } & RangerInfo)[] }) => {
      setBook(Object.fromEntries((d.rangers ?? []).map(r => [r.id, { name: r.name, element: r.element, grade: r.grade, evolution: r.evolution, type: r.type }])))
    }).catch(() => {})
  }, [])
  const nameOf = (id: string) => tRanger(id, book[id]?.name ?? id)

  // ── แก้บอร์ด ──
  // ทุกการแก้ของผู้ใช้ผ่านตรงนี้ → ติดธง edited (ซิงก์ Meta / โหลดของแอดมินใช้ setBoard ตรงๆ ไม่ติดธง)
  const update = (fn: (b: Board) => Board) => setBoard(b => (b ? { ...fn(structuredClone(b)), edited: true } : b))
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
    // PC ไม่มีแถบล่าง → ไม่ต้องเลือกค้างไว้ (คลิกที่ตัวเรนเจอร์เพื่อเปิดเมนูเอง)
    if (z) { if (!isPC) setSelected(id); flash(T('มีเรนเจอร์ตัวนี้อยู่แล้ว', 'Already on the board')); return }
    update(b => { b.pool.unshift(id); b.removed = (b.removed ?? []).filter(x => x !== id); return b })
    if (isPC) { flash(T('เพิ่มลงคลังแล้ว — คลิกที่ตัวเรนเจอร์เพื่อจัดเทียร์', 'Added to the pool — click it to place it')); return }
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

  const onItemClick = (e: React.MouseEvent, id: string) => {
    if (suppressClick.current) return
    if (isPC) { if (ctx?.id === id) setCtx(null); else openCtx(e, id); return }
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

  /** ส่งออกเป็นไฟล์ .txt (แถว + เรนเจอร์ในแถว + คลัง) */
  const exportTxt = () => {
    if (!board) return
    const blob = new Blob(['\uFEFF' + boardToText(board, nameOf)], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(board.title || 'tier-list').replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim() || 'tier-list'}.txt`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    flash(T('ส่งออกไฟล์แล้ว', 'File exported'))
  }
  /** เลือกไฟล์ → อ่าน → ถามยืนยันก่อนแทนที่ตาราง */
  const onImportFile = async (file: File | undefined) => {
    if (importInput.current) importInput.current.value = ''
    if (!file) return
    if (file.size > 512 * 1024) { flash(T('ไฟล์ใหญ่เกินไป', 'The file is too large')); return }
    const parsed = parseTierText(await file.text())
    // ตัดรหัสที่ไม่มีใน Ranger Book (พิมพ์ผิด / ไฟล์เก่า) — ถ้ายังโหลดรายชื่อไม่เสร็จก็รับไว้ก่อน
    const known = (id: string) => !Object.keys(book).length || !!book[id]
    const data: ParsedTierList | null = parsed && { ...parsed, tiers: parsed.tiers.map(t => ({ ...t, items: t.items.filter(known) })), pool: parsed.pool.filter(known) }
    if (!data) { flash(T('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ที่ส่งออกจากหน้านี้', 'Could not read the file — use a file exported from this page')); return }
    pendingImport.current = { data, name: file.name }
    setConfirm('import')
  }
  const applyImport = () => {
    const p = pendingImport.current?.data
    if (!p) return
    update(b => {
      const before = [...b.tiers.flatMap(t => t.items), ...b.pool]
      const tiers = p.tiers.map(t => ({ id: uid(), label: t.label, bg: t.bg, fg: t.fg, items: [...t.items] }))
      const placed = new Set(tiers.flatMap(t => t.items))
      b.tiers = tiers
      if (p.title) b.title = p.title
      // คลัง = ของในไฟล์ + ของเดิมทั้งหมด (ตัวที่ไม่ได้อยู่ในแถวใหม่กลับมาที่คลัง) — ไม่มีตัวไหนหาย
      b.pool = [...new Set([...p.pool, ...before])].filter(id => !placed.has(id))
      b.removed = (b.removed ?? []).filter(id => !placed.has(id) && !p.pool.includes(id))
      return b
    })
    const n = p.tiers.reduce((k, t) => k + t.items.length, 0)
    flash(T(`นำเข้าแล้ว: ${p.tiers.length} แถว · ${n} เรนเจอร์`, `Imported: ${p.tiers.length} rows · ${n} rangers`))
    pendingImport.current = null
  }

  const doConfirm = () => {
    if (confirm === 'clear') update(b => { b.pool = [...b.tiers.flatMap(t => t.items), ...b.pool]; b.tiers.forEach(t => { t.items = [] }); return b })
    // รีเซ็ตตาราง = แถว/ชื่อ/สี/ชื่อตารางกลับเป็นค่าเริ่มต้น · เรนเจอร์ในตารางกลับคลังทั้งหมด (คลังไม่ถูกโหลดใหม่)
    if (confirm === 'tiers') update(b => {
      b.pool = [...b.tiers.flatMap(t => t.items), ...b.pool]
      // ผู้ใช้: กลับเป็นแถว/สี/ชื่อของแอดมิน (ว่าง) · แอดมิน: กลับเป็น S A B C D
      b.tiers = isAdmin ? freshTiers() : tiersFrom(pubRef.current, false)
      b.title = (!isAdmin && pubRef.current?.title) || DEFAULT_TITLE
      return b
    })
    if (confirm === 'delete') update(b => { b.pool = []; b.tiers.forEach(t => { t.items = [] }); b.metaOff = true; return b })
    if (confirm === 'reset') resetBoard()
    if (confirm === 'import') applyImport()
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
      className={'tl-item' + (selected === id || ctx?.id === id ? ' sel' : '') + (drag?.id === id ? ' ghosted' : '')}
      style={{ background: frameCss(frameOf(book[id])) }}
      title={nameOf(id)}
      onPointerDown={e => onItemPointerDown(e, id)}
      onTouchStart={e => onItemTouchStart(e, id)}
      onClick={e => onItemClick(e, id)}
      onContextMenu={e => onItemContextMenu(e, id)}
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
        {/* ปุ่มหลักเหลือ 3 ปุ่ม (+ เผยแพร่ในหลังบ้าน) — ไฟล์ / ล้าง-รีเซ็ต กดแล้วค่อยเลือกในเมนู */}
        <div className="tl-actions">
          <button className="tl-btn accent" onClick={exportPng} disabled={exporting}>
            <span className={'material-icons-round' + (exporting ? ' animate-spin' : '')}>{exporting ? 'autorenew' : 'download'}</span>{T('บันทึกเป็นรูป', 'Save image')}
          </button>
          <button className="tl-btn" onClick={() => setMenu('file')} aria-haspopup="dialog">
            <span className="material-icons-round">import_export</span>{T('ไฟล์ .txt', 'File .txt')}
          </button>
          <input ref={importInput} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={e => onImportFile(e.target.files?.[0])} />
          <button className="tl-btn" onClick={() => setMenu('manage')} aria-haspopup="dialog">
            <span className="material-icons-round">restart_alt</span>{T('ล้าง / รีเซ็ต', 'Clear / Reset')}
          </button>
          {isAdmin && (
            <button className="tl-btn publish" onClick={publish} disabled={publishing}>
              <span className={'material-icons-round' + (publishing ? ' animate-spin' : '')}>{publishing ? 'autorenew' : 'publish'}</span>
              {publishing ? T('กำลังเผยแพร่...', 'Publishing...') : T('เผยแพร่', 'Publish')}
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className={'tl-admin-bar' + (board.edited ? ' dirty' : '')}>
          <span className="material-icons-round">{board.edited ? 'edit_note' : 'check_circle'}</span>
          <div>
            <b>{board.edited ? T('มีการแก้ไขที่ยังไม่เผยแพร่', 'Unpublished changes') : T('ตรงกับฉบับที่เผยแพร่อยู่', 'Matches the published version')}</b>
            <span>
              {published?.updatedAt
                ? T('เผยแพร่ล่าสุด ', 'Last published ') + new Date(published.updatedAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')
                : T('ยังไม่เคยเผยแพร่ — ผู้ใช้จะเห็นแถว S A B C D ว่าง', 'Never published — visitors see empty S A B C D rows')}
            </span>
          </div>
        </div>
      )}

      {/* ตารางเทียร์ */}
      <div className="tl-board">
        {board.tiers.map((t, i) => (
          <div key={t.id} className={'tl-row' + (drag?.zone === t.id ? ' over' : '') + (selected && selZone !== t.id ? ' can-drop' : '')}>
            <button className="tl-label" style={{ background: labelGradient(t.bg), color: t.fg, textShadow: `0 1px 0 ${labelTextShadow(t.fg)}` }} onClick={() => setEditing(t.id)} title={T('แก้ไขเทียร์', 'Edit tier')}>
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
        <button className="tl-btn primary tl-pool-add" onClick={() => setPicking(true)}>
          <span className="material-icons-round">person_add</span>{T('เพิ่มเรนเจอร์', 'Add ranger')}
        </button>
      </div>
      <div className={'tl-pool' + (drag?.zone === POOL ? ' over' : '')} data-zone={POOL} onClick={e => onZoneClick(e, POOL)}>
        {loading && <div className="tl-empty"><span className="material-icons-round animate-spin">autorenew</span></div>}
        {!loading && board.pool.length === 0 && !drag && (
          <div className="tl-empty">{T('ไม่มีเรนเจอร์ในคลัง — กด "เพิ่มเรนเจอร์" หรือ "รีเซ็ต"', 'No rangers left — press "Add ranger" or "Reset"')}</div>
        )}
        {renderZone(POOL, board.pool)}
      </div>
      <p className="tl-tip">
        <span className="material-icons-round">{isPC ? 'mouse' : 'touch_app'}</span>
        {isPC
          ? T('คลิกเรนเจอร์เพื่อเปิดเมนู (ย้ายเทียร์ · ดูรายละเอียด · กลับคลัง · ลบ) · ลากวางเพื่อย้ายได้เลย', 'Click a ranger for its menu (move tier · info · pool · remove) · drag & drop to move')
          : T('แตะเรนเจอร์เพื่อเลือก แล้วกดเทียร์ด้านล่าง · กดค้างแล้วลากเพื่อย้าย', 'Tap a ranger, then a tier below · long-press and drag to move')}
      </p>

      {/* แถบล่าง: ตัวที่เลือก → ย้ายไปเทียร์ */}
      {selected && !detailId && !isPC && (
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

      {/* เมนูคลิกขวา (PC) */}
      {ctx && createPortal(
        <div ref={ctxRef} className="tl-ctx" style={{ left: ctx.x, top: ctx.y, visibility: 'hidden' }} role="menu" onContextMenu={e => e.preventDefault()}>
          <div className="tl-ctx-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(ctx.id)} alt="" />
            <b>{nameOf(ctx.id)}</b>
          </div>
          <div className="tl-ctx-tiers">
            {board.tiers.map(t => (
              <button key={t.id} role="menuitem" className={zoneOf(board, ctx.id) === t.id ? 'here' : ''} style={{ background: t.bg, color: t.fg }}
                title={T(`ย้ายไป ${t.label}`, `Move to ${t.label}`)} onClick={() => { moveItem(ctx.id, t.id); setCtx(null) }}>{t.label || '·'}</button>
            ))}
          </div>
          <button role="menuitem" className="tl-ctx-item" onClick={() => { setDetailId(ctx.id); setCtx(null) }}>
            <span className="material-icons-round">visibility</span>{T('ดูรายละเอียด', 'Info')}
          </button>
          <button role="menuitem" className="tl-ctx-item" disabled={zoneOf(board, ctx.id) === POOL} onClick={() => { moveItem(ctx.id, POOL, 0); setCtx(null) }}>
            <span className="material-icons-round">inventory_2</span>{T('กลับคลัง', 'Pool')}
          </button>
          <button role="menuitem" className="tl-ctx-item danger" onClick={() => { removeItem(ctx.id); setCtx(null) }}>
            <span className="material-icons-round">delete</span>{T('ลบ', 'Remove')}
          </button>
        </div>,
        document.body,
      )}

      {/* ป๊อปอัปรายละเอียด — portal ไป body โดยไม่ห่อชั้น z-index (ห่อแล้วป๊อปอัปเลือกเกียร์ z-70 จะไปอยู่ข้างหลัง)
          ซ้อนแบบเดียวกับ Ranger Book · ซ่อนแถบล่าง (.tl-dock z 60) ระหว่างเปิด ไม่ให้ทับป๊อปอัป (z 50) */}
      {detailId && createPortal(
        <GachaRangerDetailPopup
          rangerId={detailId}
          rangerName={book[detailId]?.name ?? detailId}
          rangerImageUrl={thumb(detailId)}
          mode="book"
          onClose={() => setDetailId(null)}
        />,
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

      {/* เมนูไฟล์ .txt */}
      {menu === 'file' && (
        <Sheet title={T('ไฟล์เทียร์ลิสต์ (.txt)', 'Tier list file (.txt)')} onClose={() => setMenu(null)}>
          <div className="tl-menu">
            <button className="tl-menu-item" onClick={() => { setMenu(null); exportTxt() }}>
              <span className="tl-menu-ico"><span className="material-icons-round">file_download</span></span>
              <span><b>{T('ส่งออก .txt', 'Export .txt')}</b><small>{T('บันทึกตารางเป็นไฟล์ เก็บไว้หรือส่งให้เพื่อน', 'Save the table as a file to keep or share')}</small></span>
            </button>
            <button className="tl-menu-item" onClick={() => { setMenu(null); importInput.current?.click() }}>
              <span className="tl-menu-ico"><span className="material-icons-round">upload_file</span></span>
              <span><b>{T('นำเข้า .txt', 'Import .txt')}</b><small>{T('เปิดไฟล์ที่ส่งออกจากหน้านี้ (ถามยืนยันก่อนแทนที่)', 'Open a file exported from this page (asks before replacing)')}</small></span>
            </button>
          </div>
        </Sheet>
      )}

      {/* เมนูล้าง / รีเซ็ต / ลบ */}
      {menu === 'manage' && (
        <Sheet title={T('ล้าง / รีเซ็ต', 'Clear / Reset')} onClose={() => setMenu(null)}>
          <div className="tl-menu">
            <button className="tl-menu-item" disabled={placedCount === 0} onClick={() => { setMenu(null); setConfirm('clear') }}>
              <span className="tl-menu-ico"><span className="material-icons-round">move_down</span></span>
              <span><b>{T('ล้างตาราง', 'Clear tiers')}</b><small>{T('ย้ายเรนเจอร์ในตารางกลับคลัง แถวและสีอยู่เหมือนเดิม', 'Move every placed ranger back to the pool, rows stay')}</small></span>
            </button>
            <button className="tl-menu-item" onClick={() => { setMenu(null); setConfirm('tiers') }}>
              <span className="tl-menu-ico"><span className="material-icons-round">format_color_reset</span></span>
              <span><b>{T('รีเซ็ตตาราง', 'Reset table')}</b><small>{isAdmin ? T('แถวกลับเป็น S A B C D สีเดิม', 'Rows go back to S A B C D') : T('แถว ชื่อ สี กลับเป็นแบบที่แอดมินตั้งไว้', 'Rows, labels and colours go back to the admin\'s')}</small></span>
            </button>
            {!isAdmin && (
              <button className="tl-menu-item" onClick={() => { setMenu(null); setConfirm('reset') }}>
                <span className="tl-menu-ico"><span className="material-icons-round">restart_alt</span></span>
                <span><b>{T('รีเซ็ตทั้งหมด', 'Reset everything')}</b><small>{T('กลับเป็นเทียร์ลิสต์ของแอดมิน + ตัวแนะนำจาก Meta ล่าสุด', 'Back to the admin tier list and the latest Meta picks')}</small></span>
              </button>
            )}
            {isAdmin && (
              <button className="tl-menu-item" onClick={() => { setMenu(null); setConfirm('reset') }}>
                <span className="tl-menu-ico"><span className="material-icons-round">cloud_download</span></span>
                <span><b>{T('โหลดฉบับที่เผยแพร่', 'Load published')}</b><small>{T('ทิ้งที่แก้ไว้ แล้วกลับไปฉบับที่เผยแพร่อยู่', 'Discard changes and go back to the published version')}</small></span>
              </button>
            )}
            {!isAdmin && (
              <button className="tl-menu-item danger" onClick={() => { setMenu(null); setConfirm('delete') }}>
                <span className="tl-menu-ico"><span className="material-icons-round">delete_sweep</span></span>
                <span><b>{T('ลบทั้งหมด', 'Delete all')}</b><small>{T('ลบเรนเจอร์ทุกตัวทั้งในตารางและคลัง', 'Remove every ranger from the tiers and the pool')}</small></span>
              </button>
            )}
          </div>
        </Sheet>
      )}

      {/* ยืนยัน */}
      {confirm && (
        <Sheet title={confirm === 'import' ? T('นำเข้าเทียร์ลิสต์?', 'Import this tier list?') : confirm === 'clear' ? T('ล้างตาราง?', 'Clear all tiers?') : confirm === 'tiers' ? T('รีเซ็ตตั้งค่าตาราง?', 'Reset the table settings?') : confirm === 'delete' ? T('ลบเรนเจอร์ทั้งหมด?', 'Delete every ranger?') : isAdmin ? T('โหลดฉบับที่เผยแพร่?', 'Load the published version?') : T('รีเซ็ตทั้งหมด?', 'Reset everything?')} onClose={() => setConfirm(null)}>
          <p className="tl-confirm-text">
            {confirm === 'import' && pendingImport.current && (() => {
              const d = pendingImport.current.data
              const n = d.tiers.reduce((k, t) => k + t.items.length, 0)
              return T(
                `ไฟล์ ${pendingImport.current.name}: ${d.tiers.length} แถว · ${n} เรนเจอร์ — แทนที่แถวในตารางตอนนี้ เรนเจอร์เดิมที่ไม่อยู่ในไฟล์จะกลับไปที่คลัง`,
                `${pendingImport.current.name}: ${d.tiers.length} rows · ${n} rangers — replaces the current rows. Rangers not in the file go back to the pool`,
              )
            })()}
            {confirm === 'clear' && T('ย้ายเรนเจอร์ทุกตัวในตารางกลับไปที่คลัง (แถวและสีเทียร์ยังอยู่)', 'Moves every ranger in the tiers back to the pool (rows and colours stay)')}
            {confirm === 'tiers' && (isAdmin
              ? T('ตารางกลับเป็นแถว S A B C D สีเดิม และชื่อตารางเริ่มต้น เรนเจอร์ในตารางกลับไปที่คลัง', 'The table goes back to S A B C D rows, default colours and the default title. Placed rangers go back to the pool')
              : T('ตารางกลับเป็นแถว ชื่อ และสีตามที่แอดมินตั้งไว้ (แถวว่าง) เรนเจอร์ในตารางกลับไปที่คลัง (เรนเจอร์ที่เพิ่มเองไม่หาย)', 'The table goes back to the rows, labels and colours set by the admin (empty). Placed rangers go back to the pool (rangers you added are kept)'))}
            {confirm === 'delete' && T('ลบเรนเจอร์ทั้งหมดทั้งในตารางและคลัง เหลือตารางเปล่าให้เพิ่มเองทีละตัว', 'Removes every ranger from the tiers and the pool, leaving an empty board to fill yourself')}
            {confirm === 'delete' && <><br />{T('ตัวแนะนำจาก Meta จะไม่กลับมาเองอีก จนกว่าจะกดรีเซ็ต', 'Meta recommendations stop coming back until you press Reset')}</>}
            {confirm === 'reset' && (isAdmin
              ? T('ทิ้งที่แก้ไว้ แล้วโหลดเทียร์ลิสต์ที่เผยแพร่อยู่ตอนนี้กลับมา', 'Discard your changes and load the tier list that is published now')
              : T('กลับไปเป็นค่าเริ่มต้น: เทียร์ลิสต์ที่แอดมินจัดไว้ และเรนเจอร์จาก Meta PVP ลีค Legend ล่าสุด', 'Back to the defaults: the tier list arranged by the admin and the latest Meta PVP Legend rangers'))}
          </p>
          <div className="tl-confirm-btns">
            <button className="tl-btn" onClick={() => setConfirm(null)}>{T('ยกเลิก', 'Cancel')}</button>
            <button className={'tl-btn ' + (confirm === 'clear' || confirm === 'tiers' || confirm === 'import' ? 'primary' : 'danger')} onClick={doConfirm}>{T('ยืนยัน', 'Confirm')}</button>
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
    // ป้ายเทียร์: ไล่สี (สว่างบนซ้าย → เข้มล่างขวา) + เงาวาวครึ่งบน + แถบแสงเฉียง (หน้าตาเดียวกับหน้าเว็บ)
    const [la, lb, lc] = labelStops(t.bg)
    const lg = ctx.createLinearGradient(PAD, y, PAD + LABEL, y + h)
    lg.addColorStop(0, la); lg.addColorStop(0.5, lb); lg.addColorStop(1, lc)
    ctx.fillStyle = lg; ctx.fillRect(PAD, y, LABEL, h)
    const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.55)
    gl.addColorStop(0, 'rgba(255,255,255,0.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gl; ctx.fillRect(PAD, y, LABEL, h * 0.55)
    ctx.save(); ctx.beginPath(); ctx.rect(PAD, y, LABEL, h); ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath()
    ctx.moveTo(PAD + LABEL * 0.55, y); ctx.lineTo(PAD + LABEL * 0.8, y); ctx.lineTo(PAD + LABEL * 0.25, y + h); ctx.lineTo(PAD, y + h); ctx.closePath(); ctx.fill()
    ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(PAD, y + h - 3, LABEL, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(PAD, y, LABEL, 2)
    // ข้อความ: ขนาดคงที่ · ยาว = ขึ้นบรรทัดใหม่ · เกินพื้นที่ = "…"
    const FS = 40, LH = Math.round(FS * 1.12)
    ctx.font = font(800, FS); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const maxLines = Math.max(1, Math.min(3, Math.floor((h - 12) / LH)))
    const lines = wrapLabel(ctx, t.label, LABEL - 16, maxLines)
    ctx.shadowColor = labelTextShadow(t.fg); ctx.shadowOffsetY = 1.5; ctx.shadowBlur = 0
    ctx.fillStyle = t.fg
    lines.forEach((ln, k) => ctx.fillText(ln, PAD + LABEL / 2, y + h / 2 + (k - (lines.length - 1) / 2) * LH))
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
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
