// ====================================================
// ไฟล์เกมที่เว็บเก็บไว้เอง (public/gameres/hd = assets/images/hd ของ APK เวอร์ชันล่าสุด)
//   ใช้แทนโฟลเดอร์ hd/ ของ rangers.lerico.net ทั้งหมด — หน้า /res, วิดีโอสอน, สตูดิโอ anme
//   สารบัญโฟลเดอร์: public/gameres/hd/_index.json ← scripts/build-gameres-index.cjs
// ====================================================

import type { DirEntry } from './resIndex'

export const GAMERES_BASE = '/gameres'

/** พาธใต้ res/ ที่อยู่ในไฟล์ของเราเอง (hd หรือ hd/...) */
export const isLocalRes = (path: string) => path === 'hd' || path.startsWith('hd/')

/** URL ของไฟล์ในโฟลเดอร์ของเรา (พาธใต้ res/ เช่น 'hd/battle/battle_ui.png') */
export const localResUrl = (path: string) => `${GAMERES_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`

let indexPromise: Promise<Record<string, DirEntry[]>> | null = null
function loadIndex(): Promise<Record<string, DirEntry[]>> {
  if (!indexPromise) {
    indexPromise = fetch(`${GAMERES_BASE}/hd/_index.json`).then(r => {
      if (!r.ok) throw new Error(`gameres index ${r.status}`)
      return r.json() as Promise<Record<string, DirEntry[]>>
    })
    indexPromise.catch(() => { indexPromise = null })
  }
  return indexPromise
}

/** รายการของโฟลเดอร์ (พาธใต้ res/ ที่ isLocalRes) */
export async function loadLocalResDir(path: string): Promise<DirEntry[]> {
  const idx = await loadIndex()
  const list = idx[path]
  if (!list) throw new Error('Not found')
  return list
}
