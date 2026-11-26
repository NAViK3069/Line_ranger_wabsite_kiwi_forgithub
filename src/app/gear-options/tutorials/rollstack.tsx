'use client'

// ====================================================
// วงล้อสุ่มหลายขั้น (ใช้ร่วมกับ surehit.tsx / skill-cancel.tsx)
//   แถว = ขั้นการสุ่มที่เกมทำตามลำดับ · แถวหนึ่งมีวงล้อ 1–2 วง (2 วง = สุ่มพร้อมกัน เช่น ต้าน vs โดนแน่นอน)
//   แถวแรกหมุน st+0.3 → st+1.9 · แถวถัดไปโผล่ด้านล่าง หมุน 1.6 วิเท่ากัน (ผู้ตีลงมือหลังวงล้อสุดท้ายหยุด — ROW2 ใน build-surehit-scene.cjs)
//   มีหลายแถว = ย่อเฉพาะแถวบน (ผลที่ตัดสินแล้ว) · แถวที่กำลังสุ่มขนาดปกติ
// ====================================================

import type { OverlayCtx } from '@/components/ScenePlayer'
import { easeInOut, easeOutBack, prog, span } from './anim'
import { Wheel } from './skill-rates'

const WHEEL = 236
const SPIN = { from: 0.3, to: 1.9 }
const SMALL = 0.55
/** แถวที่ 2: เริ่มหมุน / หยุด นับจากต้นรอบ (ตรงกับ ROW2 ใน build-surehit-scene.cjs) */
export const ROW2 = { from: 2.15, to: 3.75 }

export interface WheelSpec {
  chance: number
  /** ผลที่ตก: true = ช่องสี (ผลที่วงล้อนี้ถาม) */
  good: boolean
  goodColor: [string, string]
  badColor?: [string, string]
  /** ชื่อช่องสี / ช่องเทา (ใต้วงล้อ) */
  goodLabel: string
  badLabel: string
  /** ชื่อสั้นกลางวงล้อ */
  sub: string
  /** จุดตกในช่อง (0–1) ให้แต่ละรอบไม่ซ้ำกัน */
  land: number
}
export interface RowSpec {
  wheels: WheelSpec[]
  /** ผลของแถวนี้ (แสดงตอนหยุด) */
  note: string
  /** สีป้ายผล: true = เขียว (ผลดีของตัวใส่เกียร์) */
  noteGood: boolean
}

const pct = (v: number) => { const x = v * 100; return `${Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : x.toFixed(1)}%` }

/** เวลาหมุนของแต่ละแถว [เริ่มหมุน, หยุด] */
export function rowTimes(st: number, rows: number): [number, number][] {
  const out: [number, number][] = [[st + SPIN.from, st + SPIN.to]]
  for (let i = 1; i < rows; i++) out.push([st + ROW2.from, st + ROW2.to])
  return out
}

export function RollStack({ c, header, st, rows, end, x = 640 }: { c: OverlayCtx; header: string; st: number; rows: RowSpec[]; end: number; /** กึ่งกลางแนวนอน (พิกเซลชั้นซ้อน) */ x?: number }) {
  const t = c.t
  const vis = span(t, st, end, 0.25, 0.3)
  if (!vis.on) return null
  const times = rowTimes(st, rows.length)
  // แถวที่โผล่แล้ว · ย่อวงล้อเมื่อแถวที่ 2 โผล่ (หรือแถวเดียวที่มี 2 วง)
  const shown = rows.filter((_, i) => i === 0 || t >= times[i][0] - 0.25)
  const shrink = rows.length > 1 ? easeInOut(prog(t, times[0][1] + 0.05, times[0][1] + 0.35)) : 0
  const scaleOf = (i: number) => {
    const base = rows[i].wheels.length > 1 ? 0.78 : 1
    if (rows.length === 1 || i > 0) return base
    return base + (SMALL - base) * shrink
  }
  const chip = (color: [string, string], txt: string, small: boolean) => (
    <div className={`flex items-center gap-1.5 rounded-lg bg-black/65 ${small ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
      <span className={`${small ? 'w-3 h-3' : 'w-4 h-4'} rounded-full shrink-0`} style={{ background: `linear-gradient(135deg, ${color[0]}, ${color[1]})` }} />
      <span className={`${small ? 'text-[14px]' : 'text-[17px]'} font-black text-white whitespace-nowrap`}>{txt}</span>
    </div>
  )
  return (
    <div className="absolute top-[10px] -translate-x-1/2 flex flex-col items-center" style={{ left: x, opacity: vis.alpha }}>
      <div className="px-3 py-0.5 rounded-lg bg-black/70 text-[16px] font-bold text-gray-200 whitespace-nowrap">{header}</div>
      {shown.map((row, i) => {
        const [a, b] = times[i]
        const s = scaleOf(i)
        const small = s < 0.8
        const landed = t >= b
        const appear = i === 0 ? easeOutBack(Math.min(1, (t - st) / 0.3)) : easeOutBack(prog(t, a - 0.25, a + 0.05))
        return (
          <div key={i} className="flex flex-col items-center" style={{ marginTop: i === 0 ? 8 : 4 }}>
            {i > 0 && <span className="material-icons-round text-amber-300 leading-none" style={{ fontSize: 26, opacity: appear }}>south</span>}
            <div className="flex gap-4">
              {row.wheels.map((w, j) => {
                const g = Math.max(0, Math.min(1, w.chance)) * 360
                const theta = w.good ? g * w.land : g + (360 - g) * w.land
                const sp = prog(t, a, b)
                const rot = (360 * 5 - theta) * (1 - Math.pow(1 - sp, 3))
                const bad = w.badColor ?? ['#94a3b8', '#475569']
                return (
                  <div key={j} className="flex flex-col items-center">
                    <div style={{ width: WHEEL * s, height: WHEEL * s, marginTop: 14 * s }}>
                      <div style={{ transform: `scale(${s})`, transformOrigin: 'top left', width: WHEEL, height: WHEEL }}>
                        <Wheel chance={w.chance} rot={rot} goodColor={w.goodColor} badColor={bad} scale={appear} center={pct(w.chance)} sub={w.sub} />
                      </div>
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      {chip(w.goodColor, `${w.goodLabel} ${pct(w.chance)}`, small)}
                      {chip(bad, `${w.badLabel} ${pct(1 - w.chance)}`, small)}
                    </div>
                  </div>
                )
              })}
            </div>
            {landed && (
              <div className={`mt-1.5 rounded-xl border-2 text-center ${row.noteGood ? 'bg-emerald-600/95 border-emerald-200/70' : 'bg-slate-700/95 border-white/25'} ${small ? 'px-3 py-1' : 'px-4 py-1.5'}`}
                style={{ transform: `scale(${easeOutBack(prog(t, b, b + 0.3))})` }}>
                <span className={`${small ? 'text-[16px]' : 'text-[19px]'} font-black text-white whitespace-nowrap`}>{row.note}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
