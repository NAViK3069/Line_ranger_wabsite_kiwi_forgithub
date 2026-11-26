'use client'

// ====================================================
// ปุ่มดาวน์โหลดข้างชื่อคลิป — ภาพนิ่ง (PNG ของเฟรมที่หยุดอยู่) / วิดีโอ (MP4 ทั้งคลิป มีเสียง)
//   เรียกตัวเล่นผ่าน playerBus (ไม่ import engine ตรงๆ — engine โหลดได้เฉพาะฝั่ง browser)
//   วิดีโอสร้างทีละเฟรมในเครื่องผู้ใช้ → แสดง % และกดยกเลิกได้
// ====================================================

import { useEffect, useRef, useState } from 'react'
import { usePlayerApi } from '@/components/playerBus'

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export default function DownloadMenu({ fileBase, T }: { fileBase: string; T: (th: string, en: string) => string }) {
  const api = usePlayerApi()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'png' | 'video'>(null)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const signal = useRef({ cancel: false })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  // เปลี่ยนคลิประหว่างสร้างวิดีโอ → ยกเลิก
  useEffect(() => () => { signal.current.cancel = true }, [fileBase])

  const run = async (kind: 'png' | 'video') => {
    if (!api || busy) return
    setOpen(false); setErr(''); setBusy(kind); setProgress(0)
    signal.current = { cancel: false }
    try {
      if (kind === 'png') saveBlob(await api.png(), `${fileBase}.png`)
      else {
        const blob = await api.video(setProgress, signal.current)
        if (blob) saveBlob(blob, `${fileBase}.mp4`)
      }
    } catch (e) {
      console.error(e)
      setErr(T('ดาวน์โหลดไม่สำเร็จ', 'Download failed'))
    } finally { setBusy(null) }
  }

  if (busy === 'video') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="w-28 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-cyan-400" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="text-gray-300 tabular-nums whitespace-nowrap">{T('กำลังสร้างวิดีโอ', 'Making video')} {Math.round(progress * 100)}%</span>
        <button onClick={() => { signal.current.cancel = true }}
          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200">{T('ยกเลิก', 'Cancel')}</button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={!api || !!busy} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 disabled:opacity-40 text-sm text-white">
        <span className={`material-icons-round text-lg ${busy ? 'animate-spin' : ''}`}>{busy ? 'autorenew' : 'download'}</span>
        <span className="hidden sm:inline">{T('ดาวน์โหลด', 'Download')}</span>
      </button>
      {err && <span className="absolute right-0 top-full mt-1 text-[11px] text-red-300 whitespace-nowrap">{err}</span>}
      {open && api && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-gray-900/95 backdrop-blur border border-white/10 shadow-xl z-50 p-1.5">
          <button role="menuitem" onClick={() => run('png')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left">
            <span className="material-icons-round text-purple-300">image</span>
            <span>
              <span className="block text-sm text-white">{T('ภาพนิ่ง (PNG)', 'Image (PNG)')}</span>
              <span className="block text-[11px] text-gray-400">{T('เฟรมที่หยุดอยู่ตอนนี้', 'The frame shown now')}</span>
            </span>
          </button>
          <button role="menuitem" onClick={() => run('video')} disabled={!api.canVideo}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 disabled:opacity-40 text-left">
            <span className="material-icons-round text-cyan-300">movie</span>
            <span>
              <span className="block text-sm text-white">{T('วิดีโอ (MP4)', 'Video (MP4)')}</span>
              <span className="block text-[11px] text-gray-400">
                {api.canVideo ? T('ทั้งคลิป มีเสียง · สร้างในเครื่อง ใช้เวลาสักครู่', 'Whole clip with sound · made on your device, takes a while')
                  : T('เบราว์เซอร์นี้สร้างวิดีโอไม่ได้', 'This browser can’t make videos')}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
