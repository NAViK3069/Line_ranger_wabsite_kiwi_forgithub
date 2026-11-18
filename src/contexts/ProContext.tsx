'use client'

// ====================================================
// Pro / Beta — ยกเลิกระบบโค้ดแล้ว ทุกคนได้สิทธิ์ทุกฟีเจอร์
//
// คง usePro() ไว้ให้คอมโพเนนต์เดิมใช้ต่อได้โดยไม่ต้องแก้ — isPro เป็น true เสมอ
// (ฟีเจอร์ที่เคยล็อกไว้: ตัวเล่นอนิเมชัน, /res, Lobby, Custom Gacha ฯลฯ)
// ====================================================

import type { ReactNode } from 'react'

interface ProContextValue {
  isPro: boolean
  loading: boolean
  unlock: (code: string) => Promise<{ ok: boolean; message?: string; messageKey?: string }>
  revoke: () => void
}

const VALUE: ProContextValue = {
  isPro: true,
  loading: false,
  unlock: async () => ({ ok: true }),
  revoke: () => {},
}

export function ProProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function usePro(): ProContextValue {
  return VALUE
}
