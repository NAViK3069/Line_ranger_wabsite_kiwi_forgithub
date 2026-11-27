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
// "พร้อม" = ไม่มีใครบอกว่ายังโหลด (usePageLoading) + ฟอนต์ + รูปที่อยู่บนจอโหลดเสร็จ (settlePage)
// หน้าที่เคยพร้อมแล้วในรอบนี้: ไปได้เลยไม่บัง — ตัวโหลดโผล่เฉพาะถ้ายังไม่พร้อมภายใน REVISIT_DELAY
// โหลดข้อมูลเพิ่มในหน้าเดิม (เช่นเปลี่ยน League): ถ้าเสร็จเร็วกว่า SHOW_DELAY ไม่เห็นตัวโหลดเลย
// ====================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  beginNavigation, endNavigation, getNavKind, getPageLoading, isPathReady, markPathReady, notePath, getServerPageLoading, isNavigating, subscribePageLoading,
} from '@/lib/pageLoading'
import { useLanguage } from '@/contexts/LanguageContext'

const SHOW_DELAY = 150    // ms — โหลดในหน้าเดิมเร็วกว่านี้ไม่ต้องเห็น
const REVISIT_DELAY = 500 // ms — หน้าที่เคยโหลดเสร็จแล้ว: ข้อมูล/รูปอยู่ในเครื่อง ปกติพร้อมก่อนนี้ → ไม่เห็นตัวโหลด
const NAV_FADE_IN = 200   // ms — ตัวโหลดขึ้นทับหน้าเดิมก่อนเปลี่ยนหน้า
const MIN_VISIBLE = 450   // ms — โผล่แล้วอยู่อย่างน้อยเท่านี้ (ไม่แวบ)
const FADE = 350          // ms — จางออก
const NAV_TIMEOUT = 10000 // ms — กันค้าง: เปลี่ยนหน้าไม่สำเร็จก็ปล่อย
const SETTLE_MAX = 10000  // ms — รอรูปบนจอนานสุดเท่านี้ (รูปข้างนอกช้า/เสีย ก็ไม่ค้าง)

const CSS = `
@keyframes gl-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes gl-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
@keyframes gl-shadow { 0%,100% { transform: scaleX(1); opacity: .45 } 50% { transform: scaleX(.86); opacity: .3 } }
@keyframes gl-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(260%) } }
@keyframes gl-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.gl-in-delayed { animation: gl-in .3s ease-out ${SHOW_DELAY}ms both }
.gl-in-revisit { animation: gl-in .3s ease-out ${REVISIT_DELAY}ms both }
.gl-in-nav { animation: gl-in ${NAV_FADE_IN}ms ease-out both }
@media (prefers-reduced-motion: reduce) { .gl-anim { animation: none !important } }
`

type Mode = 'instant' | 'nav' | 'delayed' | 'revisit'
/** โหมดที่หน่วงก่อนโผล่ → หน่วงกี่ ms */
const delayOf = (m: Mode) => m === 'delayed' ? SHOW_DELAY : m === 'revisit' ? REVISIT_DELAY : 0
/** ตัวโหลดเริ่มขึ้นเพราะอะไร: กดลิงก์ = ค่อยๆ ขึ้น · ย้อนกลับ = ทันที · โหลดในหน้าเดิม = หน่วงก่อนโผล่ */
const entryMode = (): Mode => {
  if (!isNavigating()) return 'delayed'
  const k = getNavKind()
  return k === 'history' ? 'instant' : k === 'revisit' ? 'revisit' : 'nav'
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
/** รูปที่อยู่บนจอ (หรือใกล้ๆ) แต่ยังโหลดไม่เสร็จ — ไม่นับรูปของตัวโหลดเอง / รูปที่ซ่อน (display:none) */
function pendingImages(): HTMLImageElement[] {
  const h = innerHeight
  return [...document.images].filter(img => {
    if (img.complete || !img.getAttribute('src') || img.closest('[data-global-loader]')) return false
    const rs = img.getClientRects()
    if (!rs.length) return false
    const r = rs[0]
    return r.top < h * 1.25 && r.bottom > -50
  })
}
/**
 * รอจนหน้าพร้อมโชว์จริง: ฟอนต์ + รูปบนจอโหลดเสร็จ (รูปใหม่ที่เพิ่งโผล่หลังข้อมูลมาก็รอด้วย)
 * คืน true = พร้อมครบ · false = หมดเวลา/ยกเลิก
 */
async function settlePage(cancelled: () => boolean): Promise<boolean> {
  const deadline = performance.now() + SETTLE_MAX
  try { await Promise.race([document.fonts?.ready, sleep(3000)]) } catch { /* ไม่มี fonts API */ }
  while (!cancelled()) {
    await sleep(40) // ให้ React วาดผลข้อมูลล่าสุดก่อน แล้วค่อยดูรูป
    if (cancelled()) return false
    const imgs = pendingImages()
    if (!imgs.length) return true
    const left = deadline - performance.now()
    if (left <= 0) return false
    await Promise.race([
      Promise.all(imgs.map(img => new Promise<void>(r => {
        if (img.complete) return r()
        img.addEventListener('load', () => r(), { once: true })
        img.addEventListener('error', () => r(), { once: true })
      }))),
      sleep(left),
    ])
  }
  return false
}

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
    let offCovered: (() => void) | undefined
    const onClick = (e: MouseEvent) => {
      const url = navTarget(e)
      if (!url) return
      // เคยโหลดเสร็จแล้ว → ไปเลย (Link ทำงานตามปกติ) ตัวโหลดขึ้นเฉพาะถ้าช้าเกิน SHOW_DELAY
      if (isPathReady(url.pathname)) { beginNavigation('revisit'); return }
      e.preventDefault()
      const hidden = phaseRef.current === 'hidden'
      beginNavigation('link')
      clearTimeout(navTimer)
      offCovered?.()
      const go = () => { offCovered?.(); clearTimeout(navTimer); router.push(url.pathname + url.search + url.hash) }
      if (!hidden) { go(); return }
      // ตัวโหลดยังไม่อยู่บนจอ → รอให้ขึ้นทับจนทึบจริง (animation จบ) ค่อยเปลี่ยนหน้า
      const onEnd = (ev: AnimationEvent) => { if (ev.animationName === 'gl-in') go() }
      document.addEventListener('animationend', onEnd)
      offCovered = () => { document.removeEventListener('animationend', onEnd); offCovered = undefined }
      navTimer = setTimeout(go, NAV_FADE_IN + 400) // กันค้าง: เครื่องช้ามาก/ปิด animation
    }
    // ปุ่มย้อนกลับ/ไปข้างหน้า: จับไว้ใน lib/pageLoading.ts (ต้องมาก่อน Next)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      clearTimeout(navTimer)
      offCovered?.()
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

  // ข้อมูลครบ (ไม่มีใครบอกว่ายังโหลด) แล้วยังต้องรอรูปบนจอ/ฟอนต์อีกชั้น
  const dataBusy = !loaded || pending > 0
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (dataBusy) { setSettled(false); return }
    if (settled) return
    let stop = false
    settlePage(() => stop).then(ok => {
      if (stop) return
      if (ok) markPathReady(location.pathname)
      setSettled(true)
    })
    return () => { stop = true }
  }, [dataBusy, settled])
  const busy = dataBusy || !settled
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
    const delay = delayOf(mode)
    if (delay && elapsed < delay) { setPhase('hidden'); return }
    const visibleFor = elapsed - delay
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
  const inCls = shownMode === 'instant' ? '' : ` gl-in-${shownMode}`
  return (
    // ชั้นนอก = จางออก (transition) · ชั้นใน = ค่อยๆ โผล่ (animation) — แยกกัน ไม่งั้น animation ทับ opacity ตอนจาง
    <div role="status" aria-live="polite" aria-busy={busy} data-global-loader
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
