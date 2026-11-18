'use client'
// ====================================================
// SoundContext — ระดับเสียง (volume) + helper เล่นเสียง UI
//   • volume 0..1 เก็บใน localStorage ('sound-volume'), ค่าเริ่มต้น 0.5 (50%)
//   • play(name, vol) เล่นไฟล์จาก /public/sound/<name> ที่ระดับ volume*vol
//     (ข้ามถ้า volume = 0); สร้าง Audio ใหม่ทุกครั้ง → เล่นทับกันได้
// ====================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

interface SoundContextValue {
  volume: number                                   // 0..1
  setVolume: (v: number) => void
  play: (name: string, vol?: number) => void
  // เล่นไฟล์จาก URL เต็ม (เช่นเสียงท่าของเรนเจอร์บน lerico) — ใช้ระดับเสียงหลักชุดเดียวกับ play
  playUrl: (url: string, vol?: number) => void
  // เล่นแบบวนซ้ำ (เช่น เสียงกล่อง idle) — คืนฟังก์ชันหยุด; null ถ้าเล่นไม่ได้ (muted)
  //   overlapSec > 0 → เริ่มรอบใหม่ก่อนรอบปัจจุบันจบ overlapSec วินาที (เล่นซ้อนต่อเนื่อง)
  playLoop: (name: string, vol?: number, overlapSec?: number) => (() => void) | null
}

const DEFAULT_VOLUME = 0.2
const STORAGE_KEY = 'sound-volume'

const SoundContext = createContext<SoundContextValue>({
  volume: DEFAULT_VOLUME,
  setVolume: () => {},
  play: () => {},
  playUrl: () => {},
  playLoop: () => null,
})

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME)

  // hydrate จาก localStorage (client เท่านั้น — กัน SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw !== null) {
        const n = parseFloat(raw)
        if (!isNaN(n)) setVolumeState(clamp01(n))
      }
    } catch { /* ignore */ }
  }, [])

  // ref ให้ play อ่านค่า volume ล่าสุดโดยไม่ต้อง re-create callback
  const volumeRef = useRef(volume)
  useEffect(() => { volumeRef.current = volume }, [volume])

  const setVolume = useCallback((v: number) => {
    const next = clamp01(v)
    setVolumeState(next)
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* ignore */ }
  }, [])

  const playUrl = useCallback((url: string, vol = 1) => {
    const master = volumeRef.current
    if (master <= 0 || typeof window === 'undefined') return
    try {
      const audio = new Audio(url)
      audio.volume = clamp01(master * vol)
      audio.play().catch(() => { /* autoplay policy / ยังไม่ interact */ })
    } catch { /* ignore */ }
  }, [])

  const play = useCallback((name: string, vol = 1) => playUrl(`/sound/${name}`, vol), [playUrl])

  // เล่นแบบวนซ้ำ — คืนฟังก์ชันหยุด (หรือ null ถ้า muted/เล่นไม่ได้)
  //   overlapSec = 0 → วนต่อกันตอนจบพอดี (native-like)
  //   overlapSec > 0 → เริ่มรอบใหม่ก่อนจบ overlapSec วินาที (เล่นซ้อน → ต่อเนื่องไม่มีรอยต่อ)
  const playLoop = useCallback((name: string, vol = 1, overlapSec = 0): (() => void) | null => {
    if (volumeRef.current <= 0 || typeof window === 'undefined') return null
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const active = new Set<HTMLAudioElement>()

    const playOnce = () => {
      if (stopped) return
      try {
        const audio = new Audio(`/sound/${name}`)
        audio.volume = clamp01(volumeRef.current * vol)   // อ่าน volume ล่าสุดทุกรอบ
        active.add(audio)
        audio.addEventListener('ended', () => active.delete(audio), { once: true })

        const schedule = () => {
          if (stopped) return
          const dur = audio.duration
          if (!isFinite(dur) || dur <= 0) return
          const delay = Math.max(0, dur - overlapSec) * 1000
          timer = setTimeout(playOnce, delay)   // ตั้งเวลาเริ่มรอบถัดไป (ก่อนจบ overlapSec)
        }
        if (isFinite(audio.duration) && audio.duration > 0) schedule()
        else audio.addEventListener('loadedmetadata', schedule, { once: true })

        audio.play().catch(() => {})
      } catch { /* ignore */ }
    }

    playOnce()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      active.forEach(a => { try { a.pause(); a.currentTime = 0 } catch { /* ignore */ } })
      active.clear()
    }
  }, [])

  return (
    <SoundContext.Provider value={{ volume, setVolume, play, playUrl, playLoop }}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSound(): SoundContextValue {
  return useContext(SoundContext)
}
