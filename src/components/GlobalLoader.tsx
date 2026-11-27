'use client'

// ====================================================
// GlobalLoader — หน้าโหลดกลางของทั้งเว็บ (วางใน layout ครั้งเดียว)
//   Sally (u1643e-sally) แช่ถ้วยชาท่า idle — แปลงจากอนิเมชันเกมเป็น /loading/sally-idle.webp
//   (WebP เคลื่อนไหว 110×160 · 15fps · ไม่ต้องใช้ JS/canvas วาด เบราว์เซอร์แคชไว้ หน้าต่อไปขึ้นทันที)
//
// แสดงเมื่อ: เปิดเว็บครั้งแรก (จนหน้าโหลดเสร็จ) · มีหน้าไหนบอกว่ายังโหลด (usePageLoading)
//            · เปลี่ยนหน้าระหว่างรอโค้ดหน้าใหม่ (app/loading.tsx)
// หน้าเร็ว (< 150ms) ไม่เห็นตัวโหลดเลย (ค่อยๆ โผล่หลัง 150ms) · โผล่แล้วอยู่อย่างน้อย ~0.4 วิ แล้วค่อยๆ จาง
// HTML แรก (static) มีตัวโหลดอยู่แล้ว → ขึ้นก่อน JS ทำงาน ไม่เห็นหน้าครึ่งๆ กลางๆ
// ====================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getPageLoading, getServerPageLoading, subscribePageLoading } from '@/lib/pageLoading'
import { useLanguage } from '@/contexts/LanguageContext'

const SHOW_DELAY = 150   // ms — โหลดเร็วกว่านี้ไม่ต้องเห็น
const MIN_VISIBLE = 400  // ms — โผล่แล้วอยู่อย่างน้อยเท่านี้ (ไม่แวบ)
const FADE = 320         // ms

const CSS = `
@keyframes gl-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes gl-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
@keyframes gl-shadow { 0%,100% { transform: scaleX(1); opacity: .45 } 50% { transform: scaleX(.86); opacity: .3 } }
@keyframes gl-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(260%) } }
@keyframes gl-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.gl-in { animation: gl-in .3s ease-out ${SHOW_DELAY}ms both }
@media (prefers-reduced-motion: reduce) { .gl-anim { animation: none !important } }
`

export default function GlobalLoader() {
  const { lang } = useLanguage()
  const pending = useSyncExternalStore(subscribePageLoading, getPageLoading, getServerPageLoading)
  const [loaded, setLoaded] = useState(false)
  // phase: shown = อยู่บนจอ · fading = กำลังจาง · hidden = ถอดออก
  const [phase, setPhase] = useState<'shown' | 'fading' | 'hidden'>('shown')
  const shownAt = useRef(0)
  // เปิดเว็บครั้งแรก: ตัวโหลดขึ้นทันที (มาพร้อม HTML) · เปลี่ยนหน้าทีหลัง: รอ SHOW_DELAY ก่อนค่อยโผล่
  const [instant, setInstant] = useState(true)

  // เปิดเว็บครั้งแรก: รอจนหน้าโหลดเสร็จ (รูป/ฟอนต์ในหน้า)
  useEffect(() => {
    shownAt.current = performance.now()
    if (document.readyState === 'complete') { setLoaded(true); return }
    const on = () => setLoaded(true)
    addEventListener('load', on)
    // กันค้าง: ไฟล์ข้างนอกช้ามาก ก็ไม่รอเกิน 6 วิ
    const t = setTimeout(on, 6000)
    return () => { removeEventListener('load', on); clearTimeout(t) }
  }, [])

  const busy = !loaded || pending > 0
  useEffect(() => {
    if (busy) {
      if (phase !== 'shown') { shownAt.current = performance.now(); setInstant(false); setPhase('shown') }
      return
    }
    if (phase !== 'shown') return
    const elapsed = performance.now() - shownAt.current
    // ยังไม่ทันโผล่ (เสร็จเร็วกว่า SHOW_DELAY) → ถอดเลย ผู้ใช้ไม่เห็นอะไร
    if (!instant && elapsed < SHOW_DELAY) { setPhase('hidden'); return }
    const visibleFor = instant ? elapsed : elapsed - SHOW_DELAY
    const wait = Math.max(0, MIN_VISIBLE - visibleFor)
    const t1 = setTimeout(() => setPhase('fading'), wait)
    return () => clearTimeout(t1)
  }, [busy, phase, instant])
  useEffect(() => {
    if (phase !== 'fading') return
    const t = setTimeout(() => setPhase('hidden'), FADE)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'hidden') return null
  const th = lang === 'th'
  return (
    // ชั้นนอก = จางออก (transition) · ชั้นใน = ค่อยๆ โผล่ (animation) — แยกกัน ไม่งั้น animation ทับ opacity ตอนจาง
    <div role="status" aria-live="polite" aria-busy={busy}
      className="fixed inset-0 z-[100]"
      style={{ opacity: phase === 'fading' ? 0 : 1, transition: `opacity ${FADE}ms ease-out`, pointerEvents: phase === 'fading' ? 'none' : 'auto' }}>
      <style>{CSS}</style>
      <div className={'absolute inset-0 flex items-center justify-center' + (instant ? '' : ' gl-in')}>
      <div className="absolute inset-0 bg-[#140a24]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_42%,rgba(168,85,247,0.28),transparent_70%)]" />
      <div className="relative flex flex-col items-center">
        <div className="relative h-[118px] w-[82px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/loading/sally-idle.webp" alt="" width={82} height={118} decoding="async" fetchPriority="high"
            className="gl-anim relative z-10 h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
            style={{ animation: 'gl-float 3.2s ease-in-out infinite' }} />
          <span aria-hidden className="gl-anim absolute -bottom-1 left-1/2 h-3 w-16 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[3px]"
            style={{ animation: 'gl-shadow 3.2s ease-in-out infinite' }} />
        </div>
        <p className="mt-5 font-[family-name:var(--font-line)] text-[15px] tracking-wide text-purple-100/90">
          {th ? 'กำลังโหลด' : 'Loading'}
          <span className="inline-flex w-5">
            {[0, 1, 2].map(i => (
              <span key={i} className="gl-anim" style={{ animation: `gl-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}>.</span>
            ))}
          </span>
        </p>
        <div className="mt-3 h-1 w-36 overflow-hidden rounded-full bg-white/10">
          <span className="gl-anim block h-full w-2/5 rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-300 to-sky-300"
            style={{ animation: 'gl-bar 1.6s ease-in-out infinite' }} />
        </div>
      </div>
      </div>
    </div>
  )
}
