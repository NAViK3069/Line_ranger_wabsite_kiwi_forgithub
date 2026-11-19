// ====================================================
// AdminPageHeader — หัวหน้าแอดมินแบบเดียวกันทุกหน้า
// ไอคอน + ชื่อหน้า + อธิบายสั้นๆ ว่าหน้านี้ทำอะไร + (ถ้ามี) วิธีใช้เป็นข้อๆ และลิงก์ไปดูหน้าเว็บจริง
// ====================================================

import Link from 'next/link'

interface Props {
  icon: string
  title: string
  description: string
  /** วิธีใช้ / สิ่งที่ควรรู้ — แสดงเป็นข้อๆ ในกล่องพับได้ */
  tips?: string[]
  /** ลิงก์ไปดูผลบนหน้าเว็บจริง */
  viewHref?: string
  viewLabel?: string
  /** สีไอคอน (Tailwind text-*) */
  tone?: string
}

export default function AdminPageHeader({ icon, title, description, tips, viewHref, viewLabel = 'ดูหน้าเว็บจริง', tone = 'text-purple-300' }: Props) {
  return (
    <header className="mb-6">
      <div className="flex items-start gap-3 sm:gap-4">
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
            className="shrink-0 hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <span className="material-icons-round text-base">open_in_new</span>
            {viewLabel}
          </Link>
        )}
      </div>
      {(tips?.length || viewHref) && (
        <details className="group mt-4 rounded-xl border border-sky-400/20 bg-sky-400/5 open:pb-1">
          <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none text-sm font-semibold text-sky-200 list-none [&::-webkit-details-marker]:hidden">
            <span className="material-icons-round text-lg">help_outline</span>
            วิธีใช้หน้านี้
            <span className="material-icons-round text-lg ml-auto transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          {tips?.length ? (
            <ul className="px-4 pb-3 space-y-1.5 text-sm text-gray-300">
              {tips.map(t => (
                <li key={t} className="flex gap-2 leading-relaxed">
                  <span className="text-sky-300 mt-0.5">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {viewHref && (
            <Link href={viewHref} target="_blank" className="sm:hidden mx-4 mb-3 inline-flex items-center gap-1.5 text-sm text-sky-300">
              <span className="material-icons-round text-base">open_in_new</span>
              {viewLabel}
            </Link>
          )}
        </details>
      )}
    </header>
  )
}
