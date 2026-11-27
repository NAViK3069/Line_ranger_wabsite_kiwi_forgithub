// ====================================================
// pageLoading — บอกตัวโหลดกลางของเว็บ (src/components/GlobalLoader.tsx) ว่า "หน้านี้ยังไม่พร้อม"
//
//   usePageLoading(กำลังโหลด)   เรียกในหน้า/คอมโพเนนต์ที่ต้องรอข้อมูลก่อนแสดง
//                               true = ตัวโหลดกลางแสดงค้างไว้ · false / ถอดคอมโพเนนต์ = ปล่อย
// นับรวมทุกที่ที่ยังโหลด — ตัวโหลดหายเมื่อทุกที่พร้อม (ผู้ใช้ไม่เห็นหน้าครึ่งๆ กลางๆ / รูปกระพริบ)
//
//   beginNavigation / endNavigation   ใช้ใน GlobalLoader ตอนกดลิงก์ไปหน้าอื่น
//                               (ตัวโหลดบังก่อน → ค่อยเปลี่ยนหน้า → หน้าใหม่พร้อมค่อยเปิด)
// ====================================================

import { useLayoutEffect } from 'react'

let pending = 0
let navigating = false
let navKind: 'link' | 'history' = 'link'
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export const subscribePageLoading = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getPageLoading = () => pending + (navigating ? 1 : 0)
/** ฝั่ง server (สร้างหน้า static) ถือว่ายังโหลด → HTML แรกมีตัวโหลดอยู่แล้ว */
export const getServerPageLoading = () => 1
export const isNavigating = () => navigating
/** link = กดลิงก์ในเว็บ (ตัวโหลดค่อยๆ ขึ้นก่อนเปลี่ยนหน้า) · history = ปุ่มย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์ (ขึ้นทันที) */
export const getNavKind = () => navKind

export function beginNavigation(kind: 'link' | 'history' = 'link') {
  if (navigating) return
  navigating = true; navKind = kind; emit()
}

// ปุ่มย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์: React วาดหน้าใหม่ทันทีในจังหวะ popstate
// → ต้องนับว่ากำลังโหลด "ก่อน" ตัวรับ popstate ของ Next (ลงทะเบียนตั้งแต่โหลดไฟล์นี้ = มาก่อนเสมอ)
//   ย้อนกลับในหน้าเดิม (แค่ ?query / #hash เปลี่ยน) ไม่นับ — ไม่มีหน้าใหม่ให้รอ
let knownPath = typeof window !== 'undefined' ? location.pathname : ''
/** GlobalLoader แจ้ง path ปัจจุบันทุกครั้งที่เปลี่ยน */
export const notePath = (p: string) => { knownPath = p }
if (typeof window !== 'undefined') {
  addEventListener('popstate', () => { if (location.pathname !== knownPath) beginNavigation('history') })
}
export function endNavigation() { if (navigating) { navigating = false; emit() } }

export function usePageLoading(active: boolean) {
  // layout effect: นับก่อนเบราว์เซอร์วาดหน้าใหม่ → ไม่มีจังหวะที่หน้าโผล่ก่อนตัวโหลด
  useLayoutEffect(() => {
    if (!active) return
    pending++
    emit()
    return () => { pending--; emit() }
  }, [active])
}
