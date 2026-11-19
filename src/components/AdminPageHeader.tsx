// ====================================================
// AdminPageHeader — หัวหน้าแอดมินแบบเดียวกันทุกหน้า
// ไอคอน + ชื่อหน้า + อธิบายสั้นๆ ว่าหน้านี้ทำอะไร + (ถ้ามี) ลิงก์ไปดูหน้าเว็บจริง
// ====================================================

import Link from 'next/link'

interface Props {
  icon: string
  title: string
  description: string
  /** ลิงก์ไปดูผลบนหน้าเว็บจริง */
  viewHref?: string
  viewLabel?: string
  /** สีไอคอน (Tailwind text-*) */
  tone?: string
}

export default function AdminPageHeader({ icon, title, description, viewHref, viewLabel = 'ดูหน้าเว็บจริง', tone = 'text-purple-300' }: Props) {
  return (
    <header className="mb-6 flex items-start gap-3 sm:gap-4">
      <div className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <span className={`material-icons-round text-2xl ${tone}`}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{title}</h1>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">{description}</p>
      </div>
      {viewHref && (
        <Link
          href={viewHref}
          target="_blank"
          title={viewLabel}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        >
          <span className="material-icons-round text-base">open_in_new</span>
          <span className="hidden sm:inline">{viewLabel}</span>
        </Link>
      )}
    </header>
  )
}
