// ====================================================
// i18n.ts — สลับภาษา ไทย / English
// ใช้แบบ L('ข้อความไทย', 'English text') ตรงจุดที่แสดงผล — อ่านง่าย ไม่ต้องตามหา key
// โมดูลนี้ไม่ import อะไรเลย (กัน import วน) · เปลี่ยนภาษาผ่าน setLang() ใน store.ts
// ====================================================
export type Lang = 'th' | 'en'

let current: Lang = (() => { try { return localStorage.getItem('anme.lang') === 'en' ? 'en' : 'th' } catch { return 'th' } })()

export const getLang = (): Lang => current
export const L = (th: string, en: string): string => (current === 'en' ? en : th)

export function applyLang(lang: Lang) {
  current = lang
  try { localStorage.setItem('anme.lang', lang) } catch { /* */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
