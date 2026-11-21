'use client'

// ====================================================
// AdminSettingsMenu — ปุ่มตั้งค่า (เฟือง) มุมขวาของแถบแอดมิน แทนปุ่มออกจากระบบเดิม
// กดแล้ว drop ลงมา: บัญชีที่ล็อกอิน · เปลี่ยนภาษา · ระดับเสียง · ออกจากระบบ
//
// Mobile first: จอแคบเป็นแผ่นเต็มกว้างใต้แถบเมนู (กดง่าย ปุ่มสูง 44px) · จอ ≥ 640px เป็น dropdown ชิดขวา กว้าง 18rem
// ปิดได้ด้วย: แตะข้างนอก · Esc · เลือกออกจากระบบ
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage, LANG_LABELS, type Lang } from '@/contexts/LanguageContext'
import { useSound } from '@/contexts/SoundContext'
import { logout } from '@/lib/adminApi'

const LANGS: Lang[] = ['en', 'th']
const FLAG: Record<Lang, string> = { en: 'EN', th: 'TH' }

export default function AdminSettingsMenu({ username }: { username: string }) {
  const router = useRouter()
  const { lang, setLang, loading } = useLanguage()
  const { volume, setVolume, play } = useSound()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // ระดับเสียงก่อนกดปิด — กดไอคอนลำโพงอีกครั้งกลับมาดังเท่าเดิม
  const lastVol = useRef(volume > 0 ? volume : 0.2)
  useEffect(() => { if (volume > 0) lastVol.current = volume }, [volume])

  const th = lang === 'th'
  const T = (thText: string, en: string) => (th ? thText : en)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const pct = Math.round(volume * 100)
  const volIcon = volume <= 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'
  const initial = (username || 'A').trim().charAt(0).toUpperCase()

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        onClick={() => { play('click_global.ogg'); setOpen(o => !o) }}
        aria-label={T('ตั้งค่า', 'Settings')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={T('ตั้งค่า', 'Settings')}
        className={`group flex items-center justify-center gap-1.5 h-9 min-w-9 px-2.5 rounded-lg border text-sm transition-all ${
          open
            ? 'bg-purple-500/25 border-purple-400/60 text-purple-100 shadow-[0_0_16px_rgba(168,85,247,0.35)]'
            : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white'
        }`}
      >
        <span className={`material-icons-round text-[19px] transition-transform duration-300 ${open ? 'rotate-90' : 'group-hover:rotate-45'}`}>settings</span>
        <span className="hidden xl:inline">{T('ตั้งค่า', 'Settings')}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={T('ตั้งค่า', 'Settings')}
          // พื้นทึบ: แถบเมนูแม่มี backdrop-blur อยู่แล้ว (blur ซ้อนในลูกใช้ไม่ได้) พื้นโปร่งจะเห็นเนื้อหาข้างหลังทะลุ
          className="absolute inset-x-3 top-full mt-2 sm:inset-x-auto sm:right-0 sm:w-72 z-50 rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1d0f33] to-[#120922] shadow-[0_18px_50px_rgba(0,0,0,0.65),0_0_0_1px_rgba(168,85,247,0.15)]"
          style={{ animation: 'fadeIn 0.16s ease-out' }}
        >
          {/* เส้นไล่สีบนสุด */}
          <div className="h-[3px] bg-gradient-to-r from-purple-500 via-fuchsia-400 to-cyan-400" />

          {/* บัญชี */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white font-black text-lg shadow-lg shadow-purple-900/40">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-gray-500">{T('เข้าสู่ระบบเป็น', 'Signed in as')}</p>
              <p className="text-sm font-bold text-white truncate">{username || 'admin'}</p>
            </div>
          </div>

          {/* ภาษา */}
          <div className="px-4 pt-3 pb-3.5 border-b border-white/10">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 mb-2">
              <span className="material-icons-round text-base text-cyan-300">language</span>
              {T('ภาษา', 'Language')}
              {loading && <span className="material-icons-round text-sm animate-spin text-gray-500">refresh</span>}
            </p>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/30 border border-white/10">
              {LANGS.map(l => (
                <button
                  key={l} type="button" role="menuitemradio" aria-checked={lang === l}
                  onClick={() => { if (l !== lang) { play('click_global.ogg'); setLang(l) } }}
                  className={`h-11 sm:h-9 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                    lang === l
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-900/50'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={`text-[10px] font-black px-1 rounded ${lang === l ? 'bg-white/20' : 'bg-white/10'}`}>{FLAG[l]}</span>
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          {/* ระดับเสียง */}
          <div className="px-4 pt-3 pb-3.5 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <span className="material-icons-round text-base text-fuchsia-300">graphic_eq</span>
                {T('ระดับเสียง', 'Volume')}
              </p>
              <span className="text-xs font-black tabular-nums text-purple-200">{pct}%</span>
            </div>
            <div className="flex items-center gap-2.5">
              {/* แตะลำโพง = ปิด/เปิดเสียง (กลับมาดังเท่าเดิม) */}
              <button
                type="button"
                onClick={() => setVolume(volume > 0 ? 0 : lastVol.current)}
                aria-label={volume > 0 ? T('ปิดเสียง', 'Mute') : T('เปิดเสียง', 'Unmute')}
                className={`shrink-0 grid place-items-center w-11 h-11 sm:w-9 sm:h-9 rounded-xl border transition-colors ${
                  volume <= 0 ? 'bg-white/5 border-white/10 text-gray-500' : 'bg-purple-500/15 border-purple-400/30 text-purple-200 hover:bg-purple-500/25'
                }`}
              >
                <span className="material-icons-round text-[20px]">{volIcon}</span>
              </button>
              <input
                type="range" min={0} max={100} step={1} value={pct}
                onChange={e => setVolume(parseInt(e.target.value, 10) / 100)}
                // ปล่อยนิ้ว → เล่นเสียงตัวอย่างให้ได้ยินระดับที่ตั้ง
                onPointerUp={() => play('click_button.ogg')}
                onKeyUp={() => play('click_button.ogg')}
                aria-label={T('ระดับเสียง', 'Volume')}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-fuchsia-500"
                style={{ background: `linear-gradient(90deg, #a855f7 0%, #e879f9 ${pct}%, rgba(255,255,255,0.12) ${pct}%)` }}
              />
            </div>
          </div>

          {/* ออกจากระบบ */}
          <div className="p-2">
            <button
              type="button" role="menuitem"
              onClick={() => { setOpen(false); logout(); router.push('/') }}
              className="w-full h-11 sm:h-10 px-3 rounded-xl flex items-center gap-2.5 text-sm font-bold text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
            >
              <span className="material-icons-round text-[19px]">logout</span>
              {T('ออกจากระบบ', 'Log out')}
              <span className="ml-auto material-icons-round text-[18px] opacity-60">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
