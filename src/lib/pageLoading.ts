// ====================================================
// pageLoading — บอกตัวโหลดกลางของเว็บ (src/components/GlobalLoader.tsx) ว่า "หน้านี้ยังไม่พร้อม"
//
//   usePageLoading(กำลังโหลด)   เรียกในหน้า/คอมโพเนนต์ที่ต้องรอข้อมูลก่อนแสดง
//                               true = ตัวโหลดกลางแสดงค้างไว้ · false / ถอดคอมโพเนนต์ = ปล่อย
// นับรวมทุกที่ที่ยังโหลด — ตัวโหลดหายเมื่อทุกที่พร้อม (ผู้ใช้ไม่เห็นหน้าครึ่งๆ กลางๆ / รูปกระพริบ)
// ====================================================

import { useEffect } from 'react'

let pending = 0
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export const subscribePageLoading = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getPageLoading = () => pending
/** ฝั่ง server (สร้างหน้า static) ถือว่ายังโหลด → HTML แรกมีตัวโหลดอยู่แล้ว */
export const getServerPageLoading = () => 1

export function usePageLoading(active: boolean) {
  useEffect(() => {
    if (!active) return
    pending++
    emit()
    return () => { pending--; emit() }
  }, [active])
}
