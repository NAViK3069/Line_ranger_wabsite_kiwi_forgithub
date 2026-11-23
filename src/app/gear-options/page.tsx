'use client'

// ====================================================
// /gear-options — วิดีโอสอน "ออพชั่นของอุปกรณ์" (ใส่เกียร์ที่มีค่านี้แล้วเกิดอะไรขึ้นในเกม)
//   บน  = จอวิดีโอ (เล่นฉาก .anme.json ด้วย engine ของ Video Studio — ดู src/components/ScenePlayer.tsx)
//   ล่าง = ปุ่มเลือกออพชั่น (รายการอยู่ที่ ./options.ts)
//
// ยังไม่มีปุ่มพามาหน้านี้ — กำลังทำวิดีโอทีละออพชั่น (ไม่อยู่ใน sitemap และบอก Google ไม่ให้เก็บ)
// ออพชั่นที่เลือกเก็บไว้ใน URL (?o=atk) → ส่งลิงก์ให้คนอื่นเปิดตรงออพชั่นนั้นได้
// ====================================================

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useLanguage } from '@/contexts/LanguageContext'
import { GEAR_OPTIONS, SAMPLE_SCENE, sceneUrl } from './options'

// engine ของสตูดิโอใช้ canvas / Web Audio ตั้งแต่ตอนโหลดโมดูล → โหลดฝั่ง browser เท่านั้น
const ScenePlayer = dynamic(() => import('@/components/ScenePlayer'), {
  ssr: false,
  loading: () => <div className="w-full aspect-video bg-black rounded-xl" />,
})

export default function GearOptionsPage() {
  const { lang, tStat } = useLanguage()
  const T = (th: string, en: string) => (lang === 'th' ? th : en)

  const [selected, setSelected] = useState(GEAR_OPTIONS[0].id)
  // กดเลือกออพชั่นแล้ว = ผู้ใช้โต้ตอบกับหน้าแล้ว → เปิดเสียงได้ จึงเล่นวิดีโอต่อเองได้
  const [interacted, setInteracted] = useState(false)

  useEffect(() => {
    const o = new URLSearchParams(location.search).get('o')
    if (o && GEAR_OPTIONS.some(g => g.id === o)) setSelected(o)
  }, [])

  // ไม่ให้ Google เก็บหน้านี้ระหว่างที่ยังทำไม่เสร็จ (static export ตั้ง metadata ในหน้า client ไม่ได้)
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex'
    document.head.appendChild(m)
    return () => { m.remove() }
  }, [])

  const choose = (id: string) => {
    setSelected(id)
    setInteracted(true)
    const url = new URL(location.href)
    url.searchParams.set('o', id)
    history.replaceState(null, '', url)
  }

  const opt = GEAR_OPTIONS.find(g => g.id === selected) ?? GEAR_OPTIONS[0]
  const hasVideo = !!opt.scene

  return (
    <div className="min-h-screen pb-10">
      {/* แถบบน — แบบเดียวกับหน้า /custom */}
      <header className="sticky top-0 z-40 bg-[#1A0A2E]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">{tStat('Back')}</span>
          </Link>
          <span className="text-white/20">|</span>
          <span className="material-icons-round text-amber-300 text-xl">smart_display</span>
          <span className="text-sm font-bold text-white truncate">{T('ออพชั่นของอุปกรณ์', 'Gear Options')}</span>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 sm:pt-6">
        {/* จอวิดีโอ */}
        <section className="card-glass rounded-2xl p-2 sm:p-3">
          <ScenePlayer key={opt.id} src={sceneUrl(opt.scene ?? SAMPLE_SCENE)} autoPlay={interacted} />
        </section>

        {/* ชื่อออพชั่นที่กำลังดู */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold text-white">{T(opt.th, opt.en)}</h1>
          <span className="text-sm text-gray-500">{T(opt.en, opt.th)}</span>
          {!hasVideo && (
            <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
              {T('ยังไม่มีวิดีโอ — แสดงวิดีโอตัวอย่าง', 'No video yet — showing a sample')}
            </span>
          )}
        </div>

        {/* ปุ่มเลือกออพชั่น */}
        <nav aria-label={T('ออพชั่นของอุปกรณ์', 'Gear options')}
          className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {GEAR_OPTIONS.map(g => {
            const on = g.id === opt.id
            return (
              <button
                key={g.id}
                onClick={() => choose(g.id)}
                aria-pressed={on}
                className={`relative text-left rounded-xl border px-3 py-2.5 transition-colors min-h-[52px] ${
                  on
                    ? 'bg-amber-500/20 border-amber-400/60 text-white'
                    : 'bg-white/[0.04] border-white/10 text-gray-300 hover:bg-white/[0.08] hover:border-white/20'
                }`}
              >
                <span className="block text-sm font-semibold leading-tight">{T(g.th, g.en)}</span>
                <span className="block text-[11px] text-gray-500 leading-tight mt-0.5 truncate">{T(g.en, g.th)}</span>
                {!g.scene && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gray-600" title={T('ยังไม่มีวิดีโอ', 'No video yet')} />}
              </button>
            )
          })}
        </nav>
      </main>
    </div>
  )
}
