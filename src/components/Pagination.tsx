'use client'

// ====================================================
// Pagination — แถบเลื่อนหน้าใช้ร่วมกัน (Ranger Book / Gear Book / ตัวเลือกเรนเจอร์ ฯลฯ)
//
// พิมพ์เลขหน้าแล้ววาปไปได้เลย (100+ หน้าถ้าไล่กดทีละหน้าช้าเกินไป) — กด Enter เพื่อปิดคีย์บอร์ด
// Mobile first: จอแคบเหลือ ‹ › + เลขหน้าแบบย่อ (1 … หน้านี้ … หน้าสุดท้าย) · จอกว้างเพิ่มปุ่มหน้าแรก/หน้าสุดท้าย + เลขหน้าข้างเคียง
// ====================================================

import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  /** หน้าปัจจุบัน (เริ่มที่ 0) */
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** ข้อความเสริมต่อท้ายบรรทัด "หน้า … จาก …" เช่น "1–25 / 3,156" */
  info?: ReactNode
  className?: string
}

type Item = number | '...'

/** radius = จำนวนหน้าข้างเคียงที่โชว์รอบหน้าปัจจุบัน (จอแคบ 0 · จอกว้าง 1) */
function pageItems(current: number, total: number, radius: number): Item[] {
  const max = 3 + radius * 2 + 2   // แรก + สุดท้าย + ช่วงกลาง + … สองข้าง
  if (total <= max) return Array.from({ length: total }, (_, i) => i)
  const out: Item[] = [0]
  const lo = Math.max(1, current - radius), hi = Math.min(total - 2, current + radius)
  if (lo > 1) out.push('...')
  for (let p = lo; p <= hi; p++) out.push(p)
  if (hi < total - 2) out.push('...')
  out.push(total - 1)
  return out
}

const navBtn = 'flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors'

export default function Pagination({ page, totalPages, onChange, info, className = '' }: Props) {
  const { tStat } = useLanguage()
  const last = Math.max(0, totalPages - 1)
  const cur = Math.min(Math.max(0, page), last)
  const go = (p: number) => onChange(Math.min(last, Math.max(0, p)))

  // ช่องเลขหน้าเก็บข้อความดิบไว้ต่างหาก จะได้ลบให้ว่างระหว่างพิมพ์ได้
  // แล้วเด้งกลับมาตรงกับหน้าจริงตอนออกจากช่อง (หรือเมื่อกดปุ่มเลื่อนหน้า)
  const [input, setInput] = useState(String(cur + 1))
  useEffect(() => { setInput(String(cur + 1)) }, [cur])

  const numbers = (items: Item[], cls: string) => (
    <div className={`${cls} items-center justify-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1 h-11 sm:h-10`}>
      {items.map((p, i) =>
        p === '...'
          ? <span key={`dot-${i}`} className="flex items-center justify-center w-6 sm:w-7 h-8 text-gray-600 text-xs select-none">…</span>
          : <button key={p} type="button" onClick={() => go(p)} aria-current={p === cur ? 'page' : undefined}
              className={`flex items-center justify-center min-w-8 sm:min-w-7 px-1 h-9 sm:h-8 rounded-lg text-xs font-bold tabular-nums transition-all ${
                p === cur ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}>
              {p + 1}
            </button>,
      )}
    </div>
  )

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* พิมพ์เลขหน้าเพื่อวาปไปเลย */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
        <label className="flex items-center gap-1.5">
          {tStat('Page')}
          <input
            type="text" inputMode="numeric" enterKeyHint="go" aria-label={tStat('Page')} value={input}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
              setInput(digits)
              const n = parseInt(digits, 10)
              if (Number.isFinite(n) && n >= 1) go(n - 1)
            }}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            onBlur={() => setInput(String(cur + 1))}
            className="w-14 h-9 sm:w-12 sm:h-7 px-1 rounded-lg bg-slate-900 border border-slate-700 text-gray-100 text-sm sm:text-xs text-center tabular-nums focus:outline-none focus:border-purple-500"
          />
          {tStat('of')} <span className="text-gray-300 font-semibold tabular-nums">{totalPages}</span>
        </label>
        {info && <span className="text-gray-600 tabular-nums">{info}</span>}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
          {/* หน้าแรก/หน้าสุดท้าย: จอแคบใช้ช่องพิมพ์เลขแทน */}
          <button type="button" onClick={() => go(0)} disabled={cur === 0} aria-label="first page" className={`${navBtn} hidden sm:flex`}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>first_page</span>
          </button>
          <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="previous page" className={navBtn}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>chevron_left</span>
          </button>
        </div>
        {numbers(pageItems(cur, totalPages, 0), 'flex sm:hidden')}
        {numbers(pageItems(cur, totalPages, 1), 'hidden sm:flex')}
        <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
          <button type="button" onClick={() => go(cur + 1)} disabled={cur >= last} aria-label="next page" className={navBtn}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
          <button type="button" onClick={() => go(last)} disabled={cur >= last} aria-label="last page" className={`${navBtn} hidden sm:flex`}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>last_page</span>
          </button>
        </div>
      </div>
    </div>
  )
}
