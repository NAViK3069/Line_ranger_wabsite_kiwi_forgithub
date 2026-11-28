'use client'

// ====================================================
// SiteHeader — แถบบนแบบเดียวกันทั้งเว็บ (แบบหน้า Main Stage)
//   [← Back]  [ไอคอน 34px]  ชื่อหน้า (ฟอนต์ LINE)            [เสียง · ภาษา]
//   children = แถวเสริมใต้แถบ (เช่นแท็บโหมด/ประเภทด่าน) — อยู่ในกล่องเดียวกัน ติดบนจอไปด้วยกัน
// ไอคอน: รูป (src) หรือไอคอน Material (materialIcon) ในกรอบขนาดเดียวกัน
// ====================================================

import Link from 'next/link'
import { forwardRef, type ReactNode } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  /** ปุ่มย้อนกลับไปที่ไหน (ค่าเริ่ม = หน้าแรก) */
  backHref?: string
  /** ข้อความปุ่มย้อนกลับ (ค่าเริ่ม = "Back" ตามภาษา) — ซ่อนบนมือถือ */
  backLabel?: string
  /** รูปไอคอนหน้า (เช่น /home-icons/mission-*.webp) */
  icon?: string
  /** หรือไอคอน Material แทนรูป */
  materialIcon?: string
  title: ReactNode
  /** ชื่อหน้าเป็น h1 (ค่าเริ่ม) · false = หน้ามีหัวข้อใหญ่ของตัวเองอยู่แล้ว */
  heading?: boolean
  /** คลาสของ <header> เพิ่มเติม (เช่น fixed บนมือถือ) */
  className?: string
  children?: ReactNode
}

const SiteHeader = forwardRef<HTMLElement, Props>(function SiteHeader(
  { backHref = '/', backLabel, icon, materialIcon, title, heading = true, className = '', children }, ref,
) {
  const { tStat } = useLanguage()
  const label = backLabel ?? tStat('Back')
  const Title = heading ? 'h1' : 'p'
  return (
    <header ref={ref} className={`sticky top-0 z-40 border-b border-white/10 bg-[#120a20]/95 backdrop-blur ${className}`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2.5">
        <Link href={backHref} aria-label={label} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-gray-300 hover:bg-white/10 hover:text-white">
          <span className="material-icons-round text-[22px]">arrow_back</span>
          <span className="hidden sm:inline">{label}</span>
        </Link>
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={34} height={34} className="shrink-0 rounded-lg ring-1 ring-white/15" />
        ) : materialIcon ? (
          <span className="shrink-0 flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-white/10 ring-1 ring-white/15">
            <span className="material-icons-round text-[20px] text-amber-300">{materialIcon}</span>
          </span>
        ) : null}
        <Title className="min-w-0 font-[family-name:var(--font-line)] text-[17px] sm:text-lg text-white truncate">{title}</Title>
        <div className="ml-auto shrink-0"><LanguageSwitcher /></div>
      </div>
      {children}
    </header>
  )
})

export default SiteHeader
