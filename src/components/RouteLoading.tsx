'use client'

// ระหว่างเปลี่ยนหน้า (รอโค้ดของหน้าใหม่) — ให้ตัวโหลดกลาง (GlobalLoader) แสดงแทนหน้าว่าง
// พับเก็บไว้: ไฟล์นี้ต้องอยู่ที่ src/app/loading.tsx ถึงจะทำงาน (ย้ายกลับตอนเปิด GLOBAL_LOADER_ENABLED)
import { usePageLoading } from '@/lib/pageLoading'

export default function Loading() {
  usePageLoading(true)
  return null
}
