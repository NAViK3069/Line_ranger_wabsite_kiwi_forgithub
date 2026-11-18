'use client'

// ====================================================
// Top 40 Legend — Pure Canvas rendering
// วาดทุกอย่างลง Canvas โดยตรง ไม่ใช้ html2canvas/dom-to-image
// ====================================================

import { adminFetch } from '@/lib/adminApi'
import { lericoProxy } from '@/lib/staticApi'
import { useRef, useState, useCallback, useEffect } from 'react'

interface RangerStat {
  id: string
  name: string
  imageUrl: string
  count: number
  totalCount: number
  minRank: number
}

function todayLabel() {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function proxyUrl(url: string) {
  return lericoProxy(url)
}

async function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ── Canvas renderer ──────────────────────────────────────────────────────────
async function drawTop40Canvas(canvas: HTMLCanvasElement, rangers: RangerStat[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const SC = 2   // scale factor (export 2x)

  // ── Layout (logical px) ──
  const W = 960

  // Left section: 2 large column sets — แบ่ง 3 คอลั่มเท่ากัน
  const LR = 82, LI = 81, LC = 81          // rank | image | count widths
  const LCOL = LR + LI + LC                 // 244 per set
  const LTOTAL = LCOL * 2                   // 488

  // Left row heights
  const LHDR = 30                           // header height
  const LROW = 90                           // large row height
  const TABLE_H = LHDR + LROW * 5          // 480

  // Right section: 3 small column sets
  const RTOTAL = W - LTOTAL                 // 472
  const RCOL = Math.floor(RTOTAL / 3)       // 157
  const RR = 52, RI = 52
  const RC = RCOL - RR - RI                 // 53
  const RROW = TABLE_H / 10                 // 48

  // Colors
  const THICK = '#6b7280'
  const THIN  = '#9ca3af'
  const WHITE = '#ffffff'
  const BLACK = '#111111'

  // ── Load LineBold font ──
  try {
    const ff = new FontFace('LineBold', 'url(/fonts/linebold.ttf)')
    await ff.load()
    document.fonts.add(ff)
  } catch { /* fallback to Arial */ }

  // ── Load images ──
  const [bannerImg, ...rangerImgs] = await Promise.all([
    loadImg('/gacha/images/40Top-Legend.png'),
    ...rangers.slice(0, 40).map(r => loadImg(proxyUrl(r.imageUrl))),
  ])

  const bannerH = bannerImg
    ? Math.round((bannerImg.height / bannerImg.width) * W)
    : 90

  const TOTAL_H = bannerH + TABLE_H

  // ── Canvas size ──
  canvas.width  = W * SC
  canvas.height = TOTAL_H * SC
  ctx.scale(SC, SC)

  // ── Background ──
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, W, TOTAL_H)

  // ── Banner ──
  if (bannerImg) {
    ctx.drawImage(bannerImg, 0, 0, W, bannerH)
  } else {
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, W, bannerH)
  }

  // ── @NAViK3069 date text (LineBold, ชิดขวา) ──
  const dateText = `@NAViK3069 : ${todayLabel()}`
  ctx.font = '16px LineBold, Arial, sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'right'
  ctx.shadowColor = '#000000'
  ctx.shadowBlur = 6
  ctx.fillStyle = WHITE
  ctx.fillText(dateText, W - 18, 14)
  ctx.shadowBlur = 0
  ctx.fillText(dateText, W - 18, 14)
  ctx.shadowBlur = 0
  ctx.textBaseline = 'middle'

  // ── Helpers ──
  const TY = bannerH   // table Y start

  const hLine = (x1: number, x2: number, y: number, color: string, lw: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
  }
  const vLine = (x: number, y1: number, y2: number, color: string, lw: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke()
  }
  const fillCell = (x: number, y: number, w: number, h: number, bg: string) => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h)
  }
  const centerText = (text: string, cx: number, cy: number, font: string, color: string) => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'
    ctx.fillText(text, cx, cy)
  }

  // ── Table top border ──
  hLine(0, W, TY, THICK, 2)

  // ── Left headers ──
  const drawLHeader = (sx: number) => {
    const cols = [
      { label: 'TOP', w: LR },
      { label: 'Ranger', w: LI },
      { label: 'จำนวน', w: LC },
    ]
    let x = sx
    for (let i = 0; i < cols.length; i++) {
      fillCell(x, TY, cols[i].w, LHDR, WHITE)
      centerText(cols[i].label, x + cols[i].w / 2, TY + LHDR / 2, 'bold 16px Arial, sans-serif', BLACK)
      if (i < cols.length - 1) vLine(x + cols[i].w, TY, TY + LHDR, THIN, 1)
      x += cols[i].w
    }
    hLine(sx, sx + LCOL, TY + LHDR, THICK, 2)
  }
  drawLHeader(0)
  drawLHeader(LCOL)

  // ── Large rows (TOP 1-10) ──
  const drawLargeRow = (
    sx: number, sy: number,
    ranger: RangerStat, rank: number,
    img: HTMLImageElement | null,
  ) => {
    const rankBg = rank === 1 ? '#facc15' : rank === 2 ? '#d1d5db' : rank === 3 ? '#cd7f32' : WHITE

    // Rank cell
    fillCell(sx, sy, LR, LROW, rankBg)
    centerText(`TOP_${rank}`, sx + LR / 2, sy + LROW / 2, 'bold 17px Arial, sans-serif', BLACK)
    vLine(sx + LR, sy, sy + LROW, THIN, 1)

    // Image cell
    fillCell(sx + LR, sy, LI, LROW, WHITE)
    if (img) {
      const maxH = LROW - 8, maxW = LI - 10
      const s = Math.min(maxW / img.width, maxH / img.height)
      const dw = img.width * s, dh = img.height * s
      ctx.drawImage(img,
        sx + LR + (LI - dw) / 2,
        sy + (LROW - dh) / 2,
        dw, dh,
      )
    }
    vLine(sx + LR + LI, sy, sy + LROW, THIN, 1)

    // Count cell
    fillCell(sx + LR + LI, sy, LC, LROW, WHITE)
    centerText(String(ranger.totalCount), sx + LR + LI + LC / 2, sy + LROW / 2, '22px Arial, sans-serif', BLACK)

    // Bottom border
    hLine(sx, sx + LCOL, sy + LROW, THIN, 1)
  }

  for (let i = 0; i < 5; i++) {
    drawLargeRow(0,    TY + LHDR + i * LROW, rangers[i],     i + 1, rangerImgs[i]     ?? null)
    drawLargeRow(LCOL, TY + LHDR + i * LROW, rangers[5 + i], i + 6, rangerImgs[5 + i] ?? null)
  }

  // ── Small rows (TOP 11-40) ──
  const drawSmallRow = (
    sx: number, sy: number,
    ranger: RangerStat, rank: number,
    img: HTMLImageElement | null,
  ) => {
    // Rank cell
    fillCell(sx, sy, RR, RROW, WHITE)
    centerText(`TOP_${rank}`, sx + RR / 2, sy + RROW / 2, 'bold 11px Arial, sans-serif', BLACK)
    vLine(sx + RR, sy, sy + RROW, THIN, 1)

    // Image cell
    fillCell(sx + RR, sy, RI, RROW, WHITE)
    if (img) {
      const maxH = RROW - 4, maxW = RI - 4
      const s = Math.min(maxW / img.width, maxH / img.height)
      const dw = img.width * s, dh = img.height * s
      ctx.drawImage(img,
        sx + RR + (RI - dw) / 2,
        sy + (RROW - dh) / 2,
        dw, dh,
      )
    }
    vLine(sx + RR + RI, sy, sy + RROW, THIN, 1)

    // Count cell
    fillCell(sx + RR + RI, sy, RC, RROW, WHITE)
    centerText(String(ranger.totalCount), sx + RR + RI + RC / 2, sy + RROW / 2, '14px Arial, sans-serif', BLACK)

    // Bottom border
    hLine(sx, sx + RCOL, sy + RROW, THIN, 1)
  }

  for (let col = 0; col < 3; col++) {
    const colX = LTOTAL + col * RCOL
    for (let row = 0; row < 10; row++) {
      const idx = col * 10 + row
      const ranger = rangers[10 + idx]
      if (!ranger) continue
      drawSmallRow(colX, TY + row * RROW, ranger, idx + 11, rangerImgs[10 + idx] ?? null)
    }
  }

  // ── Thick section dividers (วาดหลังสุด ไม่ถูกทับ) ──
  vLine(LCOL,          TY, TY + TABLE_H, THICK, 3)
  vLine(LTOTAL,        TY, TY + TABLE_H, THICK, 3)
  vLine(LTOTAL + RCOL, TY, TY + TABLE_H, THICK, 3)
  vLine(LTOTAL + RCOL * 2, TY, TY + TABLE_H, THICK, 3)

  // ── Outer border ──
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, TOTAL_H - 2)
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Top40LegendPage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const [rangers,    setRangers]    = useState<RangerStat[]>([])
  const [loading,    setLoading]    = useState(false)
  const [rendering,  setRendering]  = useState(false)
  const [copying,    setCopying]    = useState(false)
  const [toast,      setToast]      = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [fetchedAt,  setFetchedAt]  = useState<string | null>(null)

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // วาด canvas ทุกครั้งที่ rangers เปลี่ยน
  useEffect(() => {
    if (rangers.length === 0 || !canvasRef.current) return
    setRendering(true)
    drawTop40Canvas(canvasRef.current, rangers).finally(() => setRendering(false))
  }, [rangers])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // ใช้ admin fresh endpoint — ดึง lerico สดๆ ทุกครั้ง (ไม่ผ่าน cache)
      // admin ต้องการรูปสดใหม่เพื่อ generate Top40 ภาพ
      const res = await adminFetch('/api/admin/top40-legend/fresh', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'โหลดไม่สำเร็จ')
      const top40: RangerStat[] = (data.rangers as RangerStat[]).slice(0, 40)
      setRangers(top40)
      setFetchedAt(new Date(data.fetchedAt).toLocaleString('th-TH'))
      showToast('success', `โหลดสำเร็จ ${top40.length} อันดับ (สดจาก lerico)`)
    } catch (e) {
      showToast('error', String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  function handleDownload() {
    if (!canvasRef.current || !rangers.length) return
    const link = document.createElement('a')
    link.download = `top40-legend-${todayLabel().replace(/\//g, '-')}.jpg`
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.95)
    link.click()
  }

  async function handleCopy() {
    if (!canvasRef.current || !rangers.length) return
    setCopying(true)
    try {
      const blob = await new Promise<Blob | null>(res =>
        canvasRef.current!.toBlob(res, 'image/png')
      )
      if (!blob) throw new Error('blob null')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('success', 'คัดลอกรูปแล้ว!')
    } catch {
      showToast('error', 'คัดลอกไม่สำเร็จ (browser อาจไม่รองรับ)')
    } finally {
      setCopying(false)
    }
  }

  const busy = loading || rendering

  return (
    <div>
      {/* Title + Toast inline */}
      <div className="flex items-center gap-4 mb-1 flex-wrap">
        <h1 className="text-2xl font-black text-white">Top 40 Legend</h1>
        {toast && (
          <span className={`px-3 py-1 rounded-lg text-xs font-medium border ${
            toast.type === 'success'
              ? 'text-green-400 border-green-500/40 bg-green-500/10'
              : 'text-red-400 border-red-500/40 bg-red-500/10'
          }`}>
            {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
          </span>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-6">ดึงอันดับเรนเจอร์ Legend League จาก PVP Tracker อัตโนมัติ</p>

      {/* Controls */}
      <div className="card-glass rounded-2xl p-6 mb-6 flex flex-wrap items-center gap-4">
        <button onClick={fetchData} disabled={busy}
          className="px-6 py-2 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2">
          <span className="material-icons-round text-sm">
            {busy ? 'hourglass_empty' : 'refresh'}
          </span>
          {loading ? 'กำลังโหลด...' : rendering ? 'กำลังสร้างภาพ...' : 'ดึงข้อมูล Legend League'}
        </button>

        {rangers.length > 0 && (
          <>
            <button onClick={handleDownload} disabled={rendering}
              className="px-5 py-2 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2">
              <span className="material-icons-round text-sm">download</span>
              ดาวน์โหลด .jpg
            </button>
            <button onClick={handleCopy} disabled={copying || rendering}
              className="px-5 py-2 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2">
              <span className="material-icons-round text-sm">content_copy</span>
              {copying ? 'กำลังคัดลอก...' : 'คัดลอกรูป'}
            </button>
          </>
        )}

        {fetchedAt && (
          <span className="text-gray-500 text-xs ml-auto">อัพเดตล่าสุด: {fetchedAt}</span>
        )}
      </div>

      {/* Preview */}
      {rangers.length === 0 ? (
        <div className="card-glass rounded-2xl p-12 text-center text-gray-400">
          <span className="material-icons-round text-5xl text-gray-600 block mb-3">leaderboard</span>
          กด &quot;ดึงข้อมูล Legend League&quot; เพื่อโหลดอันดับ
        </div>
      ) : (
        <div className="overflow-x-auto">
          {rendering && (
            <div className="text-gray-400 text-sm mb-2 flex items-center gap-2">
              <span className="material-icons-round text-sm animate-spin">autorenew</span>
              กำลังโหลดรูปภาพและสร้างตาราง...
            </div>
          )}
          {/* canvas เป็นทั้ง preview และ export — วาดแล้วได้เลย ไม่ต้องแปลง */}
          <canvas
            ref={canvasRef}
            style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
          />
        </div>
      )}
    </div>
  )
}
