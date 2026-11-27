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

/**
 * ดูชิ้นส่วนขนาดเต็ม — หน้าตาเดียวกับป๊อปอัปดูรูปเดิมของหน้า /res (รูปใหญ่กลางจอ + แถบชื่อ/ปุ่มด้านล่าง)
 * ชิ้นเล็กขยายให้ใหญ่ (สูงสุด 5 เท่า ไม่เกิน 80% ของความสูงจอ) · ← → หรือปุ่มลูกศร = ชิ้นก่อน/ถัดไป · Esc / แตะข้างนอก = ปิด
 */
function PieceViewer({ atlas, pieces, index, onIndex, onClose, onSave, T }: {
  atlas: HTMLImageElement; pieces: Piece[]; index: number; onIndex: (i: number) => void; onClose: () => void
  onSave: (p: Piece) => void; T: (th: string, en: string) => string
}) {
  const p = pieces[index]
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true, made: string | null = null
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
    return () => removeEventListener('keydown', k)
  })
  // ขยายชิ้นเล็กให้เห็นชัด (ไม่เกิน 5 เท่า) — ความกว้าง/สูงถูกจำกัดด้วย max-w/max-h อีกชั้น
  const scale = Math.max(1, Math.min(5, 640 / Math.max(p.w, p.h)))
  const btn = 'h-7 px-2 rounded border border-slate-700 bg-slate-800 text-gray-200 text-xs inline-flex items-center gap-1 hover:bg-slate-700'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="max-w-full max-h-full flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt={p.name} draggable={false}
            className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
            style={{ width: p.w * scale, aspectRatio: `${p.w} / ${p.h}`, imageRendering: scale >= 3 ? 'pixelated' : 'auto',
              background: 'repeating-conic-gradient(#2a2a3a 0% 25%, #1e1e2c 0% 50%) 50% / 20px 20px' }} />}
          {pieces.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={T('ชิ้นก่อนหน้า', 'Previous piece')}
                className="absolute -left-3 sm:-left-14 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/60 text-white ring-1 ring-white/15 hover:bg-black/80 flex items-center justify-center">
                <span className="material-icons-round">chevron_left</span>
              </button>
              <button type="button" onClick={() => go(1)} aria-label={T('ชิ้นถัดไป', 'Next piece')}
                className="absolute -right-3 sm:-right-14 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/60 text-white ring-1 ring-white/15 hover:bg-black/80 flex items-center justify-center">
                <span className="material-icons-round">chevron_right</span>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 truncate max-w-[60vw]" title={p.name}>
            {p.name} <span className="text-gray-500">· {p.w}×{p.h} · {index + 1}/{pieces.length}</span>
          </span>
          <button type="button" onClick={() => onSave(p)} className={btn}>
            <span className="material-icons-round text-[14px]">download</span>{T('ดาวน์โหลด', 'Download')}
          </button>
          <button type="button" onClick={onClose} className={btn}>{T('ปิด', 'Close')}</button>
        </div>
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
