'use client'

// ====================================================
// ANME Studio — โปรแกรมทำวิดีโอ/อนิเมชันเรนเจอร์ (เมนู Custom → Video Studio)
//
// โคลนมาจากโปรเจค Line_ranger_ANME (Vite) ทั้งตัว — โค้ดอยู่ใน src/anme/
//   engine/  ตัวเล่น SAM, ไทม์ไลน์, ส่งออก MP4 (ไม่ได้แก้ตรรกะ)
//   ui/      หน้าตาแอพ (แก้: แท็บเรนเจอร์ใช้ RangerPicker ของเว็บ, ปุ่มกลับเมนู Custom)
//   engine/storage.ts  เปลี่ยนหลังบ้านเป็น Cloudflare Worker + ไฟล์ข้อมูล static ของเว็บ
//
// CSS ของ ANME เป็นแบบ global → แปลงให้มีผลเฉพาะใน .anme-root แล้ว (scripts/scope-anme-css.cjs)
// ====================================================

import { useEffect } from 'react'
import './anme.css'
import { App } from './ui/App'
import { bindSiteLang, setLang } from './engine/store'
import { useLanguage } from '@/contexts/LanguageContext'

export default function Studio() {
  // ภาษาเริ่มต้นตามภาษาของเว็บ (ในสตูดิโอเปลี่ยนเองได้จากปุ่มบนแถบ)
  // ปุ่ม TH/EN ในสตูดิโอ → เปลี่ยนภาษาของเว็บด้วย (สองทาง) — คำแปลสกิลบนการ์ดใช้ภาษาของเว็บ
  const { lang, setLang: setSiteLang } = useLanguage()
  useEffect(() => { setLang(lang === 'th' ? 'th' : 'en') }, [lang])
  useEffect(() => { bindSiteLang(l => { if (l !== lang) setSiteLang(l) }); return () => bindSiteLang(null) }, [lang, setSiteLang])

  return (
    <>
      {/* ฟอนต์ Kanit ที่ ANME ใช้ */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      {/* เต็มจอทับหน้าเว็บ — ANME ออกแบบเป็นแอพเต็มหน้าต่าง */}
      <div className="anme-root" style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
        <App />
      </div>
    </>
  )
}
