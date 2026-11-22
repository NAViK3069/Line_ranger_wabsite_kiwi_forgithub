// ====================================================
// rangerSearch — ค้นหาเรนเจอร์ได้ทั้งชื่อไทย ชื่ออังกฤษ และไอดี ไม่ว่าเว็บจะอยู่โหมดภาษาไหน
// ใช้ร่วมกันทุกช่องค้นหาเรนเจอร์: Ranger Book, RangerPicker (Lobby / Tier List / Custom Gacha / Video Studio),
// Ranger Book ของแอดมิน
//
//   • ชื่อทั้งสองภาษาโหลดจาก /data/translations/{th,en}-names.json (~270KB รวม)
//     โหลดครั้งเดียวต่อ session ตอนเริ่มพิมพ์ค้นหาครั้งแรก — คนที่ไม่ได้ค้นหาไม่ต้องโหลดเพิ่ม
//   • ระหว่างรอไฟล์ชื่อ ยังค้นได้จากชื่อที่หน้านั้นมีอยู่แล้ว (ชื่อใน Ranger Book + ชื่อตามภาษาปัจจุบัน) + ไอดี
//   • ไม่สนตัวพิมพ์ใหญ่เล็ก ช่องว่าง ขีด จุด วงเล็บ และ "\n" ที่ติดมากับชื่อบางตัว (เช่น "Demon Lord\nRimuru")
//     → "demon lord rimuru", "demonlordrimuru", "u1293e-rt", "u1293ert" เจอทั้งหมด
//   • พิมพ์หลายคำคั่นด้วยช่องว่าง = ต้องเจอครบทุกคำ (ลำดับไหนก็ได้) เช่น "jessica inn" เจอ "Inn Staff Jessica"
//   • ชื่อตัวละคร LINE ที่ข้อมูลไทยเขียนเป็นอังกฤษ (Brown, Cony, Sally ฯลฯ) พิมพ์เป็นไทยได้ — ดู THAI_ALIASES
// ====================================================

import { useEffect, useState } from 'react'
import { apiFetch } from './staticApi'

/** { "<rangerId>_nm": "ชื่อ" } */
export type NameMap = Record<string, string>
export interface RangerNames { th: NameMap; en: NameMap }

let namesCache: RangerNames | null = null
let namesPromise: Promise<RangerNames | null> | null = null

const fetchNames = (lang: 'th' | 'en'): Promise<NameMap> =>
  apiFetch(`/api/translations/${lang}?only=names`)
    .then(r => (r.ok ? r.json() as Promise<NameMap> : {}))
    .catch(() => ({}))

/** โหลดชื่อเรนเจอร์ทั้งสองภาษา (ครั้งเดียวต่อ session · โหลดไม่สำเร็จจะลองใหม่ในครั้งถัดไป) */
export function loadRangerNames(): Promise<RangerNames | null> {
  if (namesCache) return Promise.resolve(namesCache)
  if (!namesPromise) {
    namesPromise = Promise.all([fetchNames('th'), fetchNames('en')]).then(([th, en]) => {
      if (!Object.keys(th).length && !Object.keys(en).length) { namesPromise = null; return null }
      namesCache = { th, en }
      return namesCache
    })
  }
  return namesPromise
}

/** ชื่อทั้งสองภาษา — เริ่มโหลดเมื่อ active เป็น true (เช่น ช่องค้นหามีข้อความ) */
export function useRangerNames(active: boolean): RangerNames | null {
  const [names, setNames] = useState<RangerNames | null>(namesCache)
  useEffect(() => {
    if (!active || names) return
    let alive = true
    loadRangerNames().then(n => { if (alive && n) setNames(n) })
    return () => { alive = false }
  }, [active, names])
  return names
}

// ช่องว่างทุกแบบ (รวม zero-width) + เครื่องหมายที่คนมักพิมพ์ไม่ตรง · "\n" แบบตัวอักษร (backslash + n) ที่ติดมากับข้อมูล
const IGNORED = /\\n|[\s​-‍⁠﻿\-_.,:;!?'"`‘’“”·•・()[\]{}<>/\\|&+*#~^=]+/g

/** ทำให้ข้อความเทียบกันได้: ตัวเล็ก + ตัดช่องว่าง/เครื่องหมาย (ใช้ทั้งกับคำค้นและชื่อ) */
export function normalizeSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(IGNORED, '')
}

// ข้อความรวมของแต่ละเรนเจอร์ (คำนวณใหม่เฉพาะเมื่อชื่อเปลี่ยน — พิมพ์ทีละตัวจะไม่ต้อง normalize ซ้ำ 3,000 ตัว)
const SEP = '\u0001'
const hayCache = new Map<string, { src: string; hay: string }>()

function haystack(id: string, names: RangerNames | null, extra: (string | null | undefined)[]): string {
  const key = `${id}_nm`
  const parts = [id, names?.th[key], names?.en[key], ...extra]
  const src = parts.join(SEP)
  const hit = hayCache.get(id)
  if (hit && hit.src === src) return hit.hay
  const hay = parts.map(p => (p ? normalizeSearch(p) : '')).filter(Boolean).join(SEP)
  hayCache.set(id, { src, hay })
  return hay
}

// ชื่อตัวละคร LINE ที่ข้อมูลภาษาไทยของเกมเขียนเป็นภาษาอังกฤษ (เช่น "Brown ตัวแทนพิเศษ")
// → พิมพ์ "บราวน์" ก็ให้เจอ · ตัวยาวต้องมาก่อนตัวสั้น (บราวนี่ ก่อน บราวน์ / บราว)
const THAI_ALIASES: [string, string][] = ([
  ['บราวนี่', 'brownie'], ['บราวนี', 'brownie'],
  ['บราวน์', 'brown'], ['บราว', 'brown'],
  ['โคนี่', 'cony'], ['โคนี', 'cony'],
  ['แซลลี่', 'sally'], ['แซลลี', 'sally'], ['แซลี่', 'sally'],
  ['มูน', 'moon'],
  ['เจสสิก้า', 'jessica'], ['เจสซิก้า', 'jessica'], ['เจสสิกา', 'jessica'],
  ['บอส', 'boss'],
  ['เจมส์', 'james'],
  ['ช็อคโก', 'choco'], ['ช็อกโก', 'choco'], ['โชโก', 'choco'],
] as [string, string][])
  .map(([th, en]) => [normalizeSearch(th), en] as [string, string])
  .sort((a, b) => b[0].length - a[0].length)

/** คำค้นแบบที่แทนชื่อไทยของตัวละคร LINE ด้วยชื่ออังกฤษแล้ว (ไม่มีให้แทน = คืนตัวเดิม) */
function withAliases(token: string): string {
  let out = token
  for (const [th, en] of THAI_ALIASES) if (out.includes(th)) out = out.split(th).join(en)
  return out
}

export type RangerMatcher = (id: string, ...extraNames: (string | null | undefined)[]) => boolean

/**
 * สร้างตัวกรองจากคำค้น — คืน null ถ้าคำค้นว่าง (ไม่ต้องกรอง)
 * ใช้: const match = makeRangerMatcher(search, names)
 *      if (match) list = list.filter(r => match(r.id, r.name, tRanger(r.id, r.name)))
 */
export function makeRangerMatcher(query: string, names: RangerNames | null): RangerMatcher | null {
  // แต่ละคำ = ตัวที่พิมพ์ + ตัวที่แทนชื่อไทยของตัวละคร LINE แล้ว (เจอแบบใดแบบหนึ่งก็ผ่าน)
  const tokens = query.split(/\s+/).map(normalizeSearch).filter(Boolean)
    .map(t => { const a = withAliases(t); return a === t ? [t] : [t, a] })
  if (!tokens.length) return null
  return (id, ...extraNames) => {
    const hay = haystack(id, names, extraNames)
    return tokens.every(variants => variants.some(v => hay.includes(v)))
  }
}
