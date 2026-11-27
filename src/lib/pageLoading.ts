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
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export const subscribePageLoading = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getPageLoading = () => pending + (navigating ? 1 : 0)
/** ฝั่ง server (สร้างหน้า static) ถือว่ายังโหลด → HTML แรกมีตัวโหลดอยู่แล้ว */
export const getServerPageLoading = () => 1
export const isNavigating = () => navigating

export function beginNavigation() { if (!navigating) { navigating = true; emit() } }
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
