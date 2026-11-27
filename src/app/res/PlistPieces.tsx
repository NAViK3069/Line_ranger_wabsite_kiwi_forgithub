'use client'

// ====================================================
// PlistPieces — แตกรูป spritesheet (.png) ออกเป็นชิ้นตาม .plist ที่คู่กัน แล้วให้โหลดทีละชิ้นได้
// ใช้ในหน้า /res: แถว .png ที่มี .plist ชื่อเดียวกัน จะมีปุ่ม "ชิ้นส่วน" กดแล้วแผงนี้กางลงมา
//
// • อ่าน .plist ได้ทั้ง format 0–3 ของ TexturePacker/Cocos (frame / textureRect, rotated / textureRotated)
// • เลขทศนิยมใน rect ({{98.0,322.0},...}) อ่านได้ (บั๊กเดียวกับที่เคยแก้ใน samRenderer)
// • ชิ้นที่หมุนเก็บใน atlas (rotated) หมุนกลับให้ก่อนแสดง/โหลด
// • ชื่อซ้ำจาก aliases ไม่โชว์ซ้ำ (เป็นรูปเดียวกัน)
// รูปต้องโหลดแบบ CORS (corsImage) ไม่งั้น canvas ถูก taint แล้วเซฟชิ้นส่วนไม่ได้
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { corsImage } from '@/lib/staticApi'
import { parsePlist } from '@/lib/animation/plistParser'
import { useLanguage } from '@/contexts/LanguageContext'

export interface Piece { name: string; x: number; y: number; w: number; h: number; rotated: boolean }

/** ดึงตัวเลขจาก rect ทั้งแบบ string "{{x,y},{w,h}}" และแบบ dict {x,y,width,height} (format 0) */
function rectOf(info: Record<string, unknown>): [number, number, number, number] | null {
  const str = (info.textureRect ?? info.frame) as unknown
  if (typeof str === 'string') {
    const n = str.match(/-?\d+(?:\.\d+)?/g)?.map(v => Math.round(Number(v)))
    return n && n.length >= 4 ? [n[0], n[1], n[2], n[3]] : null
  }
  if (typeof info.x === 'number' && typeof info.width === 'number') {
    return [Math.round(info.x as number), Math.round(info.y as number), Math.round(info.width as number), Math.round(info.height as number)]
  }
  return null
}

export function piecesFromPlist(data: unknown): Piece[] {
  const frames = ((data ?? {}) as { frames?: Record<string, Record<string, unknown>> }).frames ?? {}
  const out: Piece[] = []
  for (const [name, info] of Object.entries(frames)) {
    const r = rectOf(info ?? {})
    if (!r || r[2] <= 0 || r[3] <= 0) continue
    out.push({ name, x: r[0], y: r[1], w: r[2], h: r[3], rotated: !!(info.textureRotated ?? info.rotated) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

/** วาดชิ้นหนึ่งลง canvas ขนาดจริง (หมุนกลับถ้าเก็บแบบหมุนไว้ใน atlas — สูตรเดียวกับ samRenderer) */
export function drawPiece(atlas: HTMLImageElement, p: Piece): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = p.w; cv.height = p.h
  const ctx = cv.getContext('2d')!
  if (p.rotated) {
    ctx.translate(p.w, 0); ctx.rotate(Math.PI / 2)
    ctx.drawImage(atlas, p.x, p.y, p.h, p.w, 0, 0, p.h, p.w)
  } else {
    ctx.drawImage(atlas, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h)
  }
  return cv
}

/** โหลดไฟล์จาก URL ข้ามโดเมนให้เป็นไฟล์จริง (<a download> ใช้ไม่ได้กับไฟล์ข้ามโดเมน — มันจะเปิดรูปแทน) */
export async function downloadUrl(url: string, filename: string) {
  const blob = await fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
  saveBlob(blob, filename)
}
function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const CHECKER = { background: 'repeating-conic-gradient(#242433 0% 25%, #1b1b28 0% 50%) 50% / 8px 8px' }

/** รูปตัวอย่างของชิ้น — วาดย่อจาก atlas ที่โหลดไว้แล้ว (ไม่ต้องโหลดไฟล์ใหม่ต่อชิ้น) */
function PieceThumb({ atlas, piece }: { atlas: HTMLImageElement; piece: Piece }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const S = 96, dpr = Math.min(2, window.devicePixelRatio || 1)
    const k = Math.min(1, S / Math.max(piece.w, piece.h))
    cv.width = Math.max(1, Math.round(piece.w * k * dpr)); cv.height = Math.max(1, Math.round(piece.h * k * dpr))
    cv.style.width = `${Math.round(piece.w * k)}px`; cv.style.height = `${Math.round(piece.h * k)}px`
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(drawPiece(atlas, piece), 0, 0, cv.width, cv.height)
  }, [atlas, piece])
  return <canvas ref={ref} className="max-w-full max-h-full" />
}

type Zoom = 'fit' | 1 | 2

/**
 * ดูชิ้นส่วนขนาดเต็ม (ป๊อปอัป): พื้นตาราง (เห็นส่วนโปร่งใส) · ขนาดพอดีจอ / 1× / 2× · ดาวน์โหลด
 * ← → หรือปุ่มลูกศร = ชิ้นก่อน/ถัดไป · Esc หรือแตะข้างนอก = ปิด
 */
function PieceViewer({ atlas, pieces, index, onIndex, onClose, onSave, T }: {
  atlas: HTMLImageElement; pieces: Piece[]; index: number; onIndex: (i: number) => void; onClose: () => void
  onSave: (p: Piece) => void; T: (th: string, en: string) => string
}) {
  const p = pieces[index]
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Zoom>('fit')
  useEffect(() => {
    let live = true, made: string | null = null
    setUrl(null)
    drawPiece(atlas, p).toBlob(b => {
      if (!b || !live) return
      made = URL.createObjectURL(b)
      setUrl(made)
    }, 'image/png')
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [atlas, p])
  const go = (d: number) => onIndex((index + d + pieces.length) % pieces.length)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev }
  })
  // พอดีจอ = ย่อชิ้นใหญ่ให้พอดี แต่ไม่ขยายชิ้นเล็ก (ชิ้นเล็กกด 2× เอง)
  const imgStyle: React.CSSProperties = zoom === 'fit'
    ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }
    : { width: p.w * zoom, height: p.h * zoom, maxWidth: 'none', maxHeight: 'none' }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="relative flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141420] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* หัว: ชื่อ ขนาด ลำดับ + ปุ่ม */}
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" title={p.name}>{p.name}</p>
            <p className="text-[11px] text-gray-400">{p.w}×{p.h}px{p.rotated ? T(' · หมุนใน atlas', ' · rotated in atlas') : ''} · {index + 1}/{pieces.length}</p>
          </div>
          <div className="flex items-center rounded-lg bg-black/30 p-0.5 ring-1 ring-white/10 text-xs">
            {(['fit', 1, 2] as Zoom[]).map(z => (
              <button key={String(z)} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z}
                className={`h-7 rounded-md px-2 ${zoom === z ? 'bg-cyan-500/30 text-white' : 'text-gray-400 hover:text-white'}`}>
                {z === 'fit' ? T('พอดี', 'Fit') : `${z}×`}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onSave(p)} title={T('ดาวน์โหลดชิ้นนี้', 'Download this piece')} aria-label={T('ดาวน์โหลด', 'Download')}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-cyan-300 hover:bg-white/10">
            <span className="material-icons-round text-[20px]">download</span>
          </button>
          <button type="button" onClick={onClose} aria-label={T('ปิด', 'Close')}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10">
            <span className="material-icons-round text-[20px]">close</span>
          </button>
        </div>
        {/* รูป */}
        <div className={`relative flex-1 overflow-auto ${zoom === 'fit' ? 'flex items-center justify-center' : ''}`} style={CHECKER}>
          <div className={zoom === 'fit' ? 'flex h-full w-full items-center justify-center p-4' : 'inline-block p-4'}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url ? <img src={url} alt={p.name} style={{ ...imgStyle, imageRendering: zoom === 2 ? 'pixelated' : 'auto' }} className="block object-contain" draggable={false} />
              : <span className="material-icons-round animate-spin text-gray-400">autorenew</span>}
          </div>
        </div>
        {/* ก่อน / ถัดไป */}
        {pieces.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={T('ชิ้นก่อนหน้า', 'Previous piece')}
              className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/55 text-white ring-1 ring-white/15 hover:bg-black/75 flex items-center justify-center">
              <span className="material-icons-round">chevron_left</span>
            </button>
            <button type="button" onClick={() => go(1)} aria-label={T('ชิ้นถัดไป', 'Next piece')}
              className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/55 text-white ring-1 ring-white/15 hover:bg-black/75 flex items-center justify-center">
              <span className="material-icons-round">chevron_right</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function PlistPieces({ pngUrl, plistUrl, baseName }: { pngUrl: string; plistUrl: string; baseName: string }) {
  const { lang } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)
  const [atlas, setAtlas] = useState<HTMLImageElement | null>(null)
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  /** ชิ้นที่เปิดดูขนาดเต็ม (ลำดับใน shown) */
  const [viewing, setViewing] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    corsImage(img, pngUrl)
    const imgP = new Promise<HTMLImageElement>((res, rej) => { img.onload = () => res(img); img.onerror = () => rej(new Error('png')); img.src = pngUrl })
    const plP = fetch(plistUrl).then(r => { if (!r.ok) throw new Error('plist ' + r.status); return r.arrayBuffer() })
    Promise.all([imgP, plP]).then(([im, buf]) => {
      if (!alive) return
      const list = piecesFromPlist(parsePlist(buf))
      // ชื่อใน aliases ไม่อยู่ใน frames อยู่แล้ว → ไม่ซ้ำ · ชิ้นที่ rect เดียวกันเป๊ะก็นับเป็นชิ้นเดียว
      const seen = new Set<string>()
      setPieces(list.filter(p => { const k = `${p.x},${p.y},${p.w},${p.h},${p.rotated}`; return seen.has(k) ? false : (seen.add(k), true) }))
      setAtlas(im)
    }).catch(e => alive && setError(e instanceof Error ? e.message : 'error'))
    return () => { alive = false }
  }, [pngUrl, plistUrl])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return !pieces ? [] : s ? pieces.filter(p => p.name.toLowerCase().includes(s)) : pieces
  }, [pieces, q])

  const savePiece = (p: Piece) => {
    if (!atlas) return
    drawPiece(atlas, p).toBlob(b => { if (b) saveBlob(b, /\.png$/i.test(p.name) ? p.name : `${p.name}.png`) }, 'image/png')
  }

  if (error) return <p className="px-3 py-3 text-xs text-red-400">{T('อ่านชิ้นส่วนไม่ได้', 'Could not read the pieces')}: {error}</p>
  if (!pieces || !atlas) {
    return (
      <p className="px-3 py-4 text-xs text-gray-400 flex items-center gap-2">
        <span className="material-icons-round text-sm animate-spin">autorenew</span>{T('กำลังแยกชิ้นส่วน...', 'Splitting pieces...')}
      </p>
    )
  }

  return (
    <div className="px-3 pb-3">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="text-xs text-gray-400">
          {T(`${pieces.length} ชิ้นจาก ${baseName}.plist`, `${pieces.length} pieces from ${baseName}.plist`)}
          {q && ` · ${T('แสดง', 'showing')} ${shown.length}`}
        </span>
        {pieces.length > 12 && (
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder={T('ค้นชื่อชิ้นส่วน', 'Search pieces')}
            className="ml-auto h-8 w-full sm:w-56 rounded-lg bg-black/30 border border-white/10 px-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-400/50"
          />
        )}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {shown.map(p => (
          <li key={p.name} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
            <button type="button" onClick={() => setViewing(shown.indexOf(p))} title={T('ดูขนาดเต็ม', 'View full size')}
              aria-label={T(`ดูขนาดเต็ม ${p.name}`, `View ${p.name} full size`)}
              className="h-28 flex items-center justify-center p-1.5 cursor-zoom-in transition-opacity hover:opacity-90" style={CHECKER}>
              <PieceThumb atlas={atlas} piece={p} />
            </button>
            <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-200 truncate" title={p.name}>{p.name}</p>
                <p className="text-[10px] text-gray-500">{p.w}×{p.h}</p>
              </div>
              <button
                type="button" onClick={() => savePiece(p)}
                title={T('ดาวน์โหลดชิ้นนี้', 'Download this piece')} aria-label={T('ดาวน์โหลด', 'Download')}
                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-cyan-300 hover:bg-white/10 transition-colors"
              >
                <span className="material-icons-round text-[18px]">download</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      {viewing != null && shown[viewing] && (
        <PieceViewer atlas={atlas} pieces={shown} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} onSave={savePiece} T={T} />
      )}
    </div>
  )
}
