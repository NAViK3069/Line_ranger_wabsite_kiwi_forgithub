'use client'

// ====================================================
// SlotPanel — แผงช่องเรนเจอร์ของหน้า /custom-gacha-ranger
// โคลนจาก TeamPanel ของ /lobby: แถวบน 4 ช่อง / แถวล่าง 3 ช่อง
// ช่องว่างขึ้น [+] กดแล้วเปิดลิสเรนเจอร์ / ลากแถบจับไปวางช่องอื่นเพื่อสลับที่
// ====================================================

import { useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { TOP_ROW, BOTTOM_ROW } from './slots'
import type { GachaSlot } from './slots'

const thumb = (id: string) => `https://rangers.lerico.net/res/${id}/${id}-thum.png`

const DRAG_THRESHOLD = 8

interface Props {
  slots: GachaSlot[]
  names: Map<string, string>
  onAdd: (index: number) => void
  onClear: (index: number) => void
  onSwap: (from: number, to: number) => void
}

interface DragState { index: number; id: string; x: number; y: number }

function slotAtPoint(x: number, y: number): number | null {
  const raw = document.elementFromPoint(x, y)?.closest('[data-slot]')?.getAttribute('data-slot')
  return raw ? Number(raw) : null
}

export default function SlotPanel({ slots, names, onAdd, onClear, onSwap }: Props) {
  const { tRanger, tStat } = useLanguage()

  const [drag, setDrag] = useState<DragState | null>(null)
  const pressRef = useRef<{ x: number; y: number; index: number; id: string } | null>(null)
  const draggedRef = useRef(false)
  const [overSlot, setOverSlot] = useState<number | null>(null)

  const startPress = (e: React.PointerEvent, index: number, id: string) => {
    draggedRef.current = false
    pressRef.current = { x: e.clientX, y: e.clientY, index, id }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const movePress = (e: React.PointerEvent) => {
    const p = pressRef.current
    if (!p) return
    if (!draggedRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
      draggedRef.current = true
    }
    setDrag({ index: p.index, id: p.id, x: e.clientX, y: e.clientY })
    const hit = slotAtPoint(e.clientX, e.clientY)
    setOverSlot(hit !== null && hit !== p.index ? hit : null)
  }

  const endPress = (e: React.PointerEvent) => {
    const p = pressRef.current
    pressRef.current = null
    setDrag(null)
    setOverSlot(null)
    if (!p || !draggedRef.current) return
    const hit = slotAtPoint(e.clientX, e.clientY)
    if (hit !== null && hit !== p.index) onSwap(p.index, hit)
  }

  const box = (i: number) => {
    const slot = slots[i]
    const filled = !!slot.rangerId
    return (
      <div
        key={i}
        data-slot={i}
        className={`rounded-xl border p-1.5 relative flex flex-col transition-colors ${
          overSlot === i ? 'border-cyan-400 bg-cyan-400/10'
            : filled ? 'border-white/10 bg-white/5'
            : 'border-dashed border-white/20 bg-white/[0.03]'
        } ${drag && drag.index === i ? 'opacity-40' : ''}`}
      >
        {filled && (
          <button
            type="button" onClick={() => onClear(i)} aria-label="remove"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 border border-slate-600 text-gray-400 hover:text-white hover:bg-red-500/30 hover:border-red-400 inline-flex items-center justify-center z-10"
          >
            <span className="material-icons-round text-[13px]">close</span>
          </button>
        )}

        <div
          onPointerDown={filled ? e => startPress(e, i, slot.rangerId as string) : undefined}
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
          <span className="material-icons-round text-[15px] leading-none pointer-events-none rotate-90">drag_indicator</span>
        </div>

        <button
          type="button"
          onClick={() => onAdd(i)}
          className={`w-full rounded-lg ${filled ? '' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors'}`}
        >
          <div className="w-full aspect-square flex items-center justify-center relative">
            {filled ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(slot.rangerId as string)} alt=""
                className="max-h-full max-w-full object-contain pointer-events-none"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <span className="material-icons-round text-2xl">add</span>
            )}
          </div>
          <div className="text-[10px] leading-tight text-center text-gray-300 line-clamp-1 h-[1.1em]">
            {filled ? tRanger(slot.rangerId as string, names.get(slot.rangerId as string) ?? slot.rangerId as string) : ''}
          </div>
        </button>
      </div>
    )
  }

  const indices = (from: number, count: number) => Array.from({ length: count }, (_, k) => from + k)

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-icons-round text-lg text-cyan-400">groups</span>
        <h2 className="text-sm font-bold text-white">{tStat('Rangers')}</h2>
      </div>
      {/* แถวบน 4 / แถวล่าง 3 — แถวล่างกว้างช่องเท่าแถวบนและจัดกึ่งกลาง ให้เรียงเหมือนในภาพ */}
      <div className="grid grid-cols-4 gap-2 max-w-xl mx-auto">
        {indices(0, TOP_ROW).map(box)}
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[27rem] mx-auto">
        {indices(TOP_ROW, BOTTOM_ROW).map(box)}
      </div>

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
