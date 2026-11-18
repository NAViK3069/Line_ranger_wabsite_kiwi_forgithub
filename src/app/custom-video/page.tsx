'use client'

// ====================================================
// /custom-video — Video Studio (ANME) จัดฉากเรนเจอร์ เล่นสกิล แล้วส่งออกเป็นวิดีโอ MP4
// ตัวแอพอยู่ใน src/anme/ — โหลดเฉพาะฝั่ง browser (ใช้ IndexedDB / WebCodecs / canvas ตั้งแต่ตอนโหลดโมดูล)
// ====================================================

import dynamic from 'next/dynamic'

const Studio = dynamic(() => import('@/anme/Studio'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm gap-2">
      <span className="material-icons-round text-sm animate-spin">autorenew</span>
      Loading Video Studio...
    </div>
  ),
})

export default function CustomVideoPage() {
  return <Studio />
}
