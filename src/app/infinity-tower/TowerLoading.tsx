'use client'

// ====================================================
// หน้ารอโหลดของหอคอยอนันต์
//   <TowerLoader>      ตอนเปิดหน้า: ประตูหอคอย (อนิเมชันเกม endless_maintop_boss) + แถบโหลดวิ่ง + การ์ดโครง (skeleton)
//   <EnemySkeleton>    ระหว่างโหลดรายชื่อศัตรูของชั้น
//   <Shimmer>          แถบเงาวิ่งผ่าน (ใช้ร่วมกัน)
// ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" → ไม่มีแสงวิ่ง (motion-reduce)
// ====================================================

import dynamic from 'next/dynamic'

const TowerGate = dynamic(() => import('./TowerGate'), { ssr: false })

const KEYFRAMES = `
@keyframes it-shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
@keyframes it-bar { 0% { left: -40% } 100% { left: 100% } }
@keyframes it-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes it-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
`

/** กล่องโครงที่มีแสงวิ่งผ่าน */
export function Shimmer({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-lg bg-white/[0.06] ${className}`}>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.09] to-transparent motion-safe:animate-[it-shimmer_1.4s_ease-in-out_infinite]" />
    </span>
  )
}

function CardSkeleton({ i }: { i: number }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-[#181026]/80 overflow-hidden" style={{ opacity: 1 - i * 0.18 }}>
      <div className="flex gap-3 p-3">
        <div className="w-[112px] sm:w-[150px] shrink-0 space-y-1.5">
          <Shimmer className="aspect-[328/197] w-full rounded-xl" />
          <Shimmer className="h-10 w-full rounded-xl" />
        </div>
        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <Shimmer className="h-4 w-11/12" />
          <Shimmer className="h-4 w-2/3" />
          <div className="flex gap-1.5 pt-1"><Shimmer className="h-6 w-14 rounded-full" /><Shimmer className="h-6 w-14 rounded-full" /><Shimmer className="h-6 w-10 rounded-full" /></div>
        </div>
      </div>
      <div className="border-t border-white/[0.06] px-3 py-2.5 space-y-2.5">
        {[0, 1, 2].map(k => (
          <div key={k} className="flex items-center gap-2.5">
            <Shimmer className="w-10 h-10 shrink-0 rounded-xl" />
            <Shimmer className="h-3.5 flex-1" />
            <Shimmer className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </li>
  )
}

/** หน้าโหลดตอนเปิดหอคอย */
export function TowerLoader({ text }: { text: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <style>{KEYFRAMES}</style>
      <div className="relative mx-auto mt-6 flex max-w-sm flex-col items-center text-center">
        <div className="pointer-events-none absolute top-6 h-40 w-64 rounded-full bg-fuchsia-600/30 blur-3xl" />
        <div className="relative w-56 sm:w-64 aspect-[328/197] motion-safe:animate-[it-float_2.6s_ease-in-out_infinite]">
          <TowerGate battle="BOSS" />
        </div>
        <p className="relative mt-3 font-[family-name:var(--font-line)] text-[15px] text-fuchsia-100">
          {text}
          <span className="inline-flex w-6 justify-start">
            {[0, 1, 2].map(i => (
              <span key={i} className="motion-safe:animate-[it-dot_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.18}s` }}>.</span>
            ))}
          </span>
        </p>
        <div className="relative mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <span className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 motion-safe:animate-[it-bar_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
      <ol className="mt-6 space-y-2.5 sm:space-y-3">
        {[0, 1, 2].map(i => <CardSkeleton key={i} i={i} />)}
      </ol>
    </div>
  )
}

/** รายชื่อศัตรูระหว่างโหลด */
export function EnemySkeleton() {
  return (
    <div aria-busy="true" className="space-y-1.5">
      <style>{KEYFRAMES}</style>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2" style={{ opacity: 1 - i * 0.2 }}>
          <Shimmer className="w-11 h-11 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3.5 w-1/3" />
            <div className="grid grid-cols-3 gap-2"><Shimmer className="h-3" /><Shimmer className="h-3" /><Shimmer className="h-3" /></div>
          </div>
        </div>
      ))}
    </div>
  )
}
