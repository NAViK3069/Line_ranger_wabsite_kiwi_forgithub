'use client'

// ระหว่างเปลี่ยนหน้า (รอโค้ดของหน้าใหม่) — ให้ตัวโหลดกลาง (GlobalLoader) แสดงแทนหน้าว่าง
import { usePageLoading } from '@/lib/pageLoading'

export default function Loading() {
  usePageLoading(true)
  return null
}
