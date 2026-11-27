'use client'

// ====================================================
// GlobalLoader — หน้าโหลดกลางของทั้งเว็บ (วางใน layout ครั้งเดียว)
//   Sally (u1643e-sally) ท่า idle — แปลงจากอนิเมชันเกมเป็น /loading/sally-idle.webp
//   (WebP เคลื่อนไหว 110×160 · 15fps · ไม่ต้องใช้ JS/canvas วาด เบราว์เซอร์แคชไว้ หน้าต่อไปขึ้นทันที)
//
// ลำดับตอนกดลิงก์ไปหน้าอื่น:
//   1) ตัวโหลดค่อยๆ ขึ้นทับหน้าเดิมจนทึบ (NAV_FADE_IN)   — ยังไม่เปลี่ยนหน้า
//   2) เปลี่ยนหน้าใต้ตัวโหลด · หน้าใหม่บอกว่ายังโหลดข้อมูล (usePageLoading) → ตัวโหลดอยู่ต่อ
//   3) ทุกอย่างพร้อม → ค่อยๆ จางออก เห็นหน้าใหม่ที่เสร็จแล้ว
// เปิดเว็บครั้งแรก: HTML แรก (static) มีตัวโหลดอยู่แล้ว → ขึ้นก่อน JS ทำงาน
// โหลดข้อมูลเพิ่มในหน้าเดิม (เช่นเปลี่ยน League): ถ้าเสร็จเร็วกว่า SHOW_DELAY ไม่เห็นตัวโหลดเลย
// ====================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  beginNavigation, endNavigation, getNavKind, getPageLoading, notePath, getServerPageLoading, isNavigating, subscribePageLoading,
} from '@/lib/pageLoading'
import { useLanguage } from '@/contexts/LanguageContext'

const SHOW_DELAY = 150    // ms — โหลดในหน้าเดิมเร็วกว่านี้ไม่ต้องเห็น
const NAV_FADE_IN = 200   // ms — ตัวโหลดขึ้นทับหน้าเดิมก่อนเปลี่ยนหน้า
const MIN_VISIBLE = 450   // ms — โผล่แล้วอยู่อย่างน้อยเท่านี้ (ไม่แวบ)
const FADE = 350          // ms — จางออก
const NAV_TIMEOUT = 10000 // ms — กันค้าง: เปลี่ยนหน้าไม่สำเร็จก็ปล่อย

const CSS = `
@keyframes gl-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes gl-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
@keyframes gl-shadow { 0%,100% { transform: scaleX(1); opacity: .45 } 50% { transform: scaleX(.86); opacity: .3 } }
@keyframes gl-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(260%) } }
@keyframes gl-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.gl-in-delayed { animation: gl-in .3s ease-out ${SHOW_DELAY}ms both }
.gl-in-nav { animation: gl-in ${NAV_FADE_IN}ms ease-out both }
@media (prefers-reduced-motion: reduce) { .gl-anim { animation: none !important } }
`

type Mode = 'instant' | 'nav' | 'delayed'
/** ตัวโหลดเริ่มขึ้นเพราะอะไร: กดลิงก์ = ค่อยๆ ขึ้น · ย้อนกลับ = ทันที · โหลดในหน้าเดิม = หน่วงก่อนโผล่ */
const entryMode = (): Mode => !isNavigating() ? 'delayed' : getNavKind() === 'history' ? 'instant' : 'nav'

/** ลิงก์ที่ควรให้ตัวโหลดบังก่อนเปลี่ยนหน้า → URL ปลายทาง · ไม่ใช่ → null */
function navTarget(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return null
  let url: URL
  try { url = new URL(a.href, location.href) } catch { return null }
  if (url.origin !== location.origin) return null
  if (url.pathname === location.pathname) return null // แค่เปลี่ยน ?query / #hash ในหน้าเดิม
  return url
}

export default function GlobalLoader() {
  const { lang } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const pending = useSyncExternalStore(subscribePageLoading, getPageLoading, getServerPageLoading)
  const [loaded, setLoaded] = useState(false)
  // phase: shown = อยู่บนจอ · fading = กำลังจาง · hidden = ถอดออก
  const [phase, setPhase] = useState<'shown' | 'fading' | 'hidden'>('shown')
  const [mode, setMode] = useState<Mode>('instant')
  const shownAt = useRef(0)
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  // เปิดเว็บครั้งแรก: รอจนหน้าโหลดเสร็จ (รูป/ฟอนต์ในหน้า)
  useEffect(() => {
    shownAt.current = performance.now()
    if (document.readyState === 'complete') { setLoaded(true); return }
    const on = () => setLoaded(true)
    addEventListener('load', on)
    const t = setTimeout(on, 6000) // กันค้าง: ไฟล์ข้างนอกช้ามาก ก็ไม่รอเกิน 6 วิ
    return () => { removeEventListener('load', on); clearTimeout(t) }
  }, [])

  // กดลิงก์ในเว็บ: ตัวโหลดขึ้นก่อน แล้วค่อยเปลี่ยนหน้า (Link ของ Next ข้ามการนำทางเมื่อ defaultPrevented)
  useEffect(() => {
    let navTimer: ReturnType<typeof setTimeout> | undefined
    const onClick = (e: MouseEvent) => {
      const url = navTarget(e)
      if (!url) return
      e.preventDefault()
      const hidden = phaseRef.current === 'hidden'
      beginNavigation('link')
      clearTimeout(navTimer)
      // ตัวโหลดยังไม่อยู่บนจอ → รอให้ขึ้นทับจนทึบก่อน · อยู่แล้ว → ไปเลย
      navTimer = setTimeout(() => router.push(url.pathname + url.search + url.hash), hidden ? NAV_FADE_IN : 0)
    }
    // ปุ่มย้อนกลับ/ไปข้างหน้า: จับไว้ใน lib/pageLoading.ts (ต้องมาก่อน Next)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      clearTimeout(navTimer)
    }
  }, [router])

  // ถึงหน้าใหม่แล้ว → ปล่อยส่วนของการนำทาง (หน้าใหม่ลงทะเบียน usePageLoading ไปแล้วตอน layout)
  const lastPath = useRef(pathname)
  useEffect(() => {
    notePath(pathname)
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    const t = setTimeout(endNavigation, 60)
    return () => clearTimeout(t)
  }, [pathname])
  // กันค้าง: กดแล้วไม่ได้ไปไหน
  const navBusy = pending > 0 && isNavigating()
  useEffect(() => {
    if (!navBusy) return
    const t = setTimeout(endNavigation, NAV_TIMEOUT)
    return () => clearTimeout(t)
  }, [navBusy])

  const busy = !loaded || pending > 0
  useEffect(() => {
    if (busy) {
      if (phase !== 'shown') {
        shownAt.current = performance.now()
        setMode(entryMode())
        setPhase('shown')
      }
      return
    }
    if (phase !== 'shown') return
    const elapsed = performance.now() - shownAt.current
    // โหลดในหน้าเดิมเสร็จก่อนตัวโหลดทันโผล่ → ถอดเลย ผู้ใช้ไม่เห็นอะไร
    if (mode === 'delayed' && elapsed < SHOW_DELAY) { setPhase('hidden'); return }
    const visibleFor = mode === 'delayed' ? elapsed - SHOW_DELAY : elapsed
    const t1 = setTimeout(() => setPhase('fading'), Math.max(0, MIN_VISIBLE - visibleFor))
    return () => clearTimeout(t1)
  }, [busy, phase, mode])
  useEffect(() => {
    if (phase !== 'fading') return
    const t = setTimeout(() => setPhase('hidden'), FADE)
    return () => clearTimeout(t)
  }, [phase])

  // เพิ่งเริ่มโหลด (phase ยังเป็น hidden) → วาดตัวโหลดในรอบเรนเดอร์เดียวกันเลย ไม่รอ effect
  // (ปุ่มย้อนกลับของเบราว์เซอร์: หน้าใหม่ถูกวาดในรอบนี้ทันที ถ้ารอ effect จะเห็นหน้าใหม่แวบก่อน)
  const starting = phase === 'hidden' && busy
  if (phase === 'hidden' && !starting) return null
  const shownMode = starting ? entryMode() : mode
  const th = lang === 'th'
  const inCls = shownMode === 'nav' ? ' gl-in-nav' : shownMode === 'delayed' ? ' gl-in-delayed' : ''
  return (
    // ชั้นนอก = จางออก (transition) · ชั้นใน = ค่อยๆ โผล่ (animation) — แยกกัน ไม่งั้น animation ทับ opacity ตอนจาง
    <div role="status" aria-live="polite" aria-busy={busy}
      className="fixed inset-0 z-[100]"
      style={{ opacity: phase === 'fading' ? 0 : 1, transition: `opacity ${FADE}ms ease-out`, pointerEvents: phase === 'fading' ? 'none' : 'auto' }}>
      <style>{CSS}</style>
      <div className={'absolute inset-0 flex items-center justify-center' + inCls}>
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
