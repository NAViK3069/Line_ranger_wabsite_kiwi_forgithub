'use client'

// ====================================================
// TeamPanel — แผงจัดทีมของหน้า /lobby (ส่วนที่คนทั่วไปใช้)
// ทีม A = 5 ช่องฝั่งซ้ายของภาพ / ทีม B = 5 ช่องฝั่งขวา
// ช่องว่างขึ้น [+] กดแล้วเปิดลิสเรนเจอร์ เลือกแล้วฐาน/ดาว/ยศ/ธาตุ คิดให้เองใน team.ts
//
// ลากไปวางช่องอื่นเพื่อสลับที่ได้ ข้ามทีมก็ได้ — ใช้ pointer event ตัวเดียว
// คุมทั้งเมาส์และนิ้ว (HTML5 drag-and-drop ไม่ยิง event บนมือถือ)
//
// จับได้เฉพาะ "แถบจับ" เส้นเล็กๆ ด้านบนของช่องเท่านั้น ไม่ใช่ทั้งรูป —
// เพราะบนมือถือช่องเรียง 2 คอลัมน์เต็มจอ ถ้าทั้งรูปลากได้ก็แทบไม่เหลือที่ว่าง
// ให้นิ้วปัดเลื่อนหน้า กลายเป็นเผลอย้ายเรนเจอร์ทุกครั้งที่จะเลื่อนลงไปดูข้างล่าง
// ====================================================

import { useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { SLOT_COUNT } from './team'
import type { RangerFacts, TeamSide, TeamSlot } from './team'

const thumb = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`

// ระยะที่ต้องขยับก่อนถึงจะนับว่า "ลาก" — ต่ำกว่านี้ถือเป็นการกดเปลี่ยนเรนเจอร์ตามเดิม
// นิ้วสั่นตอนแตะได้ง่ายกว่าเมาส์ เลยต้องเผื่อไว้พอสมควร
const DRAG_THRESHOLD = 8

interface Props {
  teams: Record<TeamSide, TeamSlot[]>
  facts: Map<string, RangerFacts>
  names: Map<string, string>
  busy: string | null                 // "A:2" ของช่องที่กำลังโหลดข้อมูลเรนเจอร์อยู่
  onAdd: (side: TeamSide, index: number) => void
  onClear: (side: TeamSide, index: number) => void
  onLevel: (side: TeamSide, index: number, level: number) => void
  onTalent: (side: TeamSide, index: number, talent: number) => void
  /** ลากช่องหนึ่งไปวางอีกช่อง — สลับของสองช่องนั้น (ข้ามทีมได้) */
  onSwap: (from: { side: TeamSide; index: number }, to: { side: TeamSide; index: number }) => void
}

interface DragState {
  side: TeamSide
  index: number
  id: string
  x: number
  y: number
}

/** อ่านว่าจุดบนจอนี้ตกอยู่ในช่องไหน — ใช้ data-slot ที่ติดไว้กับกล่องของแต่ละช่อง */
function slotAtPoint(x: number, y: number): { side: TeamSide; index: number } | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot]')
  const raw = el?.getAttribute('data-slot')
  if (!raw) return null
  const [side, index] = raw.split(':')
  return { side: side as TeamSide, index: Number(index) }
}

const SIDE_LABEL: Record<TeamSide, string> = { A: 'Team A', B: 'Team B' }

export default function TeamPanel({ teams, facts, names, busy, onAdd, onClear, onLevel, onTalent, onSwap }: Props) {
  const { tRanger, tStat } = useLanguage()

  const [drag, setDrag] = useState<DragState | null>(null)
  // จุดที่เริ่มกด — เอาไว้วัดว่าขยับพอที่จะนับเป็นการลากหรือยัง
  const pressRef = useRef<{ x: number; y: number; side: TeamSide; index: number; id: string } | null>(null)
  // ผ่านระยะขั้นต่ำแล้วหรือยัง — แตะแถบจับเฉยๆ โดยไม่ขยับต้องไม่สลับอะไร
  const draggedRef = useRef(false)
  const [overSlot, setOverSlot] = useState<string | null>(null)

  const startPress = (e: React.PointerEvent, side: TeamSide, index: number, id: string) => {
    draggedRef.current = false
    pressRef.current = { x: e.clientX, y: e.clientY, side, index, id }
    // จับ pointer ไว้กับแถบนี้ → ลากออกนอกแถบแล้ว event ยังวิ่งมาที่เดิม
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const movePress = (e: React.PointerEvent) => {
    const p = pressRef.current
    if (!p) return
    if (!draggedRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
      draggedRef.current = true
    }
    setDrag({ side: p.side, index: p.index, id: p.id, x: e.clientX, y: e.clientY })
    const hit = slotAtPoint(e.clientX, e.clientY)
    setOverSlot(hit && !(hit.side === p.side && hit.index === p.index) ? `${hit.side}:${hit.index}` : null)
  }

  const endPress = (e: React.PointerEvent) => {
    const p = pressRef.current
    pressRef.current = null
    setDrag(null)
    setOverSlot(null)
    if (!p || !draggedRef.current) return
    const hit = slotAtPoint(e.clientX, e.clientY)
    if (hit && !(hit.side === p.side && hit.index === p.index)) {
      onSwap({ side: p.side, index: p.index }, hit)
    }
  }

  const row = (side: TeamSide) => (
    <div key={side}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs font-bold ${side === 'A' ? 'text-cyan-300' : 'text-pink-300'}`}>{SIDE_LABEL[side]}</span>
      </div>
      {/* มือถือ 2 ช่องต่อแถว — 5 ช่องเรียงแถวเดียวบีบจนกดหลอดเลเวลไม่ถูก */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const slot = teams[side][i]
          const f = slot.rangerId ? facts.get(slot.rangerId) ?? null : null
          const key = `${side}:${i}`
          const loading = busy === key
          const filled = !!slot.rangerId
          const maxLv = f?.playerMaxLevel ?? 1

          // โครงเดียวกันทั้งช่องว่างและช่องที่มีเรนเจอร์ — ช่องว่างแค่ซ่อนตัวคุมเลเวลไว้
          // (invisible ไม่ใช่ hidden) ขนาดช่องจึงเท่ากันเสมอ ไม่ดันไม่หดตอนเลือก/เอาออก
          return (
            <div
              key={key}
              data-slot={key}
              className={`rounded-xl border p-1.5 relative flex flex-col transition-colors ${
                overSlot === key ? 'border-cyan-400 bg-cyan-400/10'
                  : filled ? 'border-white/10 bg-white/5'
                  : 'border-dashed border-white/20 bg-white/[0.03]'
              } ${drag && drag.side === side && drag.index === i ? 'opacity-40' : ''}`}
            >
              {filled && (
                <button
                  type="button" onClick={() => onClear(side, i)} aria-label="remove"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 border border-slate-600 text-gray-400 hover:text-white hover:bg-red-500/30 hover:border-red-400 inline-flex items-center justify-center z-10"
                >
                  <span className="material-icons-round text-[13px]">close</span>
                </button>
              )}

              {/* แถบจับสำหรับลาก — จองที่ไว้ทุกช่องให้ความสูงเท่ากัน ช่องว่างแค่ซ่อนไว้
                  touchAction none อยู่แค่แถบนี้ ที่เหลือของช่องจึงยังปัดเลื่อนหน้าได้ */}
              <div
                onPointerDown={filled ? e => startPress(e, side, i, slot.rangerId as string) : undefined}
                onPointerMove={filled ? movePress : undefined}
                onPointerUp={filled ? endPress : undefined}
                onPointerCancel={filled ? endPress : undefined}
                style={filled ? { touchAction: 'none' } : undefined}
                aria-label={filled ? 'drag to swap' : undefined}
                className={`h-5 -mt-0.5 mb-0.5 flex items-center justify-center rounded ${
                  filled
                    ? 'cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 hover:bg-white/[0.06]'
                    : 'invisible'
                }`}
              >
                {/* หมุน 90 องศา — ไอคอนต้นฉบับเป็นจุดเรียงแนวตั้ง (2 คอลัมน์)
                    พลิกแล้วได้จุดเรียงแนวนอนแบบ ::: ซึ่งอ่านออกว่าเป็นแถบจับมากกว่า */}
                <span className="material-icons-round text-[15px] leading-none pointer-events-none rotate-90">drag_indicator</span>
              </div>

              <button
                type="button"
                onClick={() => onAdd(side, i)}
                className={`w-full rounded-lg ${filled ? '' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors'}`}
              >
                <div className="w-full aspect-square flex items-center justify-center relative">
                  {filled ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb(slot.rangerId as string)} alt=""
                        className="max-h-full max-w-full object-contain pointer-events-none"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      {loading && (
                        <span className="material-icons-round absolute text-lg text-cyan-300 animate-spin">autorenew</span>
                      )}
                    </>
                  ) : (
                    <span className="material-icons-round text-2xl">add</span>
                  )}
                </div>
                {/* บรรทัดชื่อ — ช่องว่างเว้นไว้เปล่าๆ แต่ยังจองความสูงไว้ ช่องจึงเท่ากันทุกช่อง */}
                <div className="text-[10px] leading-tight text-center text-gray-300 line-clamp-1 h-[1.1em]">
                  {filled ? tRanger(slot.rangerId as string, names.get(slot.rangerId as string) ?? slot.rangerId as string) : ''}
                </div>
              </button>

              {/* ── เลเวล ── ช่องพิมพ์ด้านบน แล้วหลอดที่มีปุ่ม min / max ขนาบสองข้าง ── */}
              <div className={`mt-1 ${filled ? '' : 'invisible'}`}>
                <input
                  type="text" inputMode="numeric" value={slot.level}
                  onChange={e => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                    onLevel(side, i, Number.isFinite(n) ? Math.min(n, maxLv) : 1)
                  }}
                  className="w-12 mx-auto block h-6 px-1 rounded bg-slate-900 border border-slate-700 text-gray-100 text-[11px] text-center focus:outline-none focus:border-cyan-500"
                />
                {/* min / max เป็นปุ่มจริงมีกรอบ กดง่ายกว่าตัวหนังสือลอยๆ
                    หลอดยอมสั้นลง (flex-1) เพราะลากคร่าวๆ แล้วพิมพ์เลขเป๊ะในช่องบนได้อยู่แล้ว */}
                <div className="flex items-center gap-1 mt-1">
                  <button
                    type="button" onClick={() => onLevel(side, i, 1)} disabled={!f}
                    className="h-6 px-1.5 rounded border border-white/10 bg-white/[0.04] text-[10px] leading-none text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/25 active:scale-90 transition-all disabled:opacity-30 disabled:hover:bg-white/[0.04] shrink-0"
                  >
                    min
                  </button>
                  <input
                    type="range" min={1} max={maxLv} step={1} value={slot.level}
                    disabled={!f}
                    onChange={e => onLevel(side, i, parseInt(e.target.value, 10) || 1)}
                    className="flex-1 min-w-0 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:cursor-default disabled:opacity-40"
                  />
                  <button
                    type="button" onClick={() => f && onLevel(side, i, maxLv)} disabled={!f}
                    className="h-6 px-1.5 rounded border border-white/10 bg-white/[0.04] text-[10px] leading-none text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/25 active:scale-90 transition-all disabled:opacity-30 disabled:hover:bg-white/[0.04] shrink-0"
                  >
                    max
                  </button>
                </div>

                {/* พรสวรรค์ — โผล่เฉพาะเรนเจอร์ที่มีจริง แต่จองที่ไว้ทุกช่องให้สูงเท่ากัน
                    กดซ้ำระดับเดิม = ปิด (กลับไป 0) */}
                <div className={`flex items-center justify-center gap-1 mt-1.5 ${f?.hasTalent ? '' : 'invisible'}`}>
                  {[1, 2, 3, 4].map(lv => (
                    <button
                      key={lv} type="button"
                      onClick={() => onTalent(side, i, slot.talent === lv ? 0 : lv)}
                      aria-pressed={slot.talent === lv}
                      // flex-1 + aspect-square = โตเต็มที่ที่ช่องให้ได้ แต่ไม่เกิน 34px
                      // จอแคบมากก็ยังไม่ล้น เพราะยอมหดลงมาเองแทนที่จะดันช่องแตก
                      className={`flex-1 aspect-square max-w-[34px] rounded-lg border p-0.5 transition-all active:scale-90 ${
                        slot.talent === lv
                          ? 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_6px_rgba(34,211,238,0.35)]'
                          : 'border-white/10 bg-white/[0.04] opacity-60 hover:opacity-100 hover:border-white/30 hover:bg-white/10'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/gacha/images/tlt${lv}.png`} alt={`talent ${lv}`} className="w-full h-full object-contain pointer-events-none" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-icons-round text-lg text-cyan-400">groups</span>
        <h2 className="text-sm font-bold text-white">{tStat('Ranger teams')}</h2>
      </div>
      {(['A', 'B'] as TeamSide[]).map(row)}

      {/* รูปที่ลอยตามนิ้ว/เมาส์ขณะลาก — pointer-events none ไม่งั้นมันจะบังการหาช่องปลายทาง */}
      {drag && (
        <div
          className="fixed z-50 pointer-events-none w-16 h-16 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb(drag.id)} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}
