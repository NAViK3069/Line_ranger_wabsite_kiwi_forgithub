// ====================================================
// ข้อความแปลอย่างเป็นทางการของ warmycat (rangerbook v2) — ไทย / อังกฤษ / จีน
//
// warmycat v2 เก็บข้อความเป็น "คีย์ + ตัวเลข" แทนประโยคจีนสำเร็จรูป เช่น
//   { templateKey: 'CUSTOM:TALENT_TEXT_SPEED_S', args: [130, 2] }
//   → th: "ความเร็วการเคลื่อนที่ +130% (2 วินาที)" / en: "Move Speed +130% (2 sec)"
// ไฟล์ legacy (Rangers_data.json ฯลฯ) ที่เราเคยดึงมาแปลเอง ก็ถูก "สร้าง" จากคีย์ชุดนี้ในภาษาจีน
// การเรนเดอร์จากคีย์ตรงๆ จึงได้คำไทยตามต้นทางเป๊ะ ไม่ต้องเดาไวยากรณ์จากประโยคจีน
//
// custom.json = ข้อความที่ warmycat เขียนเอง (~470 รายการ ~100KB) — lerico ไม่มีชุดนี้
// official.json = ข้อความจากเกม — ตรวจแล้วตรงกับ lerico th/en ทุกรายการ จึงไม่ต้องดึง (6.7MB)
// ====================================================

// เปลี่ยนเลขนี้เมื่อ warmycat ออกไฟล์ภาษาใหม่ (ดูได้จาก ?v= ในหน้าเว็บ rangerbook)
export const WARMYCAT_LOCALE_VERSION = '20261013-thai1'
export const WARMYCAT_CUSTOM_LOCALE_URL =
  `https://rangerbook.warmycat.com/res/v2/locales/custom.json?v=${WARMYCAT_LOCALE_VERSION}`
export const WARMYCAT_V2_RANGERS_URL = 'https://rangerbook.warmycat.com/res/v2/rangers.json'

export type LocaleLang = 'en' | 'th'

export interface LocaleEntry { zh: string; en: string; th: string }
export type LocaleCatalog = Map<string, LocaleEntry>

/** ข้อความเดียวกันสองภาษา — ภาษาที่ต้นทางยังไม่มี = ไม่ใส่ฟิลด์นั้น (ฝั่งหน้าเว็บถอยไปใช้ตัวแปลเดิมเอง) */
export interface Localized { en?: string; th?: string }

const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

export async function fetchCustomLocale(): Promise<LocaleCatalog> {
  const res = await fetch(WARMYCAT_CUSTOM_LOCALE_URL, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`warmycat custom locale ${res.status}`)
  const rows = await res.json() as Array<{ key: string; zh_TW?: string; en?: string; th?: string }>
  const out: LocaleCatalog = new Map()
  for (const r of rows) {
    if (!r?.key) continue
    out.set(r.key, { zh: r.zh_TW ?? '', en: r.en ?? '', th: r.th ?? '' })
  }
  return out
}

const HAS_THAI = /[฀-๿]/
// ตัวแทนค่าในแม่แบบ: %d %d1 %n %s %N %N1 ... — เรียงลำดับตรงกันทุกภาษา (ตรวจแล้วทั้งไฟล์)
const PLACEHOLDER = /%[dnsN]\d*/g

/** ข้อความภาษานี้ของคีย์หนึ่ง — ไทยที่ต้นทางยังเป็นคำอังกฤษล้วน (ยังไม่ได้แปล) ถือว่าไม่มี
 *  ยกเว้นคำย่อสั้นๆ อย่าง "HP +%d%" ที่ในเกมก็เขียนแบบนั้นจริง */
function textOf(e: LocaleEntry, lang: LocaleLang): string | null {
  const t = e[lang]
  if (!t) return null
  if (lang === 'th' && !HAS_THAI.test(t) && /[A-Za-z]{3,}/.test(t)) return null
  return t
}

type TemplateNode = number | string | null | undefined | { templateKey?: string; key?: string; args?: TemplateNode[] }

/** เรนเดอร์ { templateKey, args } หรือ { key } เป็นข้อความ — args ซ้อนคีย์ได้ (เช่น "ชนิด: " + ชื่อชนิด)
 *  คืน null ถ้าส่วนไหนไม่มีข้อความในภาษานั้น จะได้ไม่ออกมาเป็นประโยคครึ่งๆ กลางๆ */
export function renderLocalized(node: TemplateNode, lang: LocaleLang, cat: LocaleCatalog): string | null {
  if (node === null || node === undefined) return ''
  if (typeof node === 'number' || typeof node === 'string') return String(node)
  const key = node.templateKey ?? node.key
  if (!key) return null
  const e = cat.get(key)
  if (!e) return null
  const t = textOf(e, lang)
  if (t === null) return null
  const args = node.args ?? []
  let i = 0
  let broken = false
  const out = t.replace(PLACEHOLDER, () => {
    const s = renderLocalized(args[i++], lang, cat)
    if (s === null) broken = true
    return s ?? ''
  })
  return broken ? null : out.replace(/\\n/g, '\n').trim()
}

/** เรนเดอร์ทั้งไทยและอังกฤษพร้อมกัน — ภาษาที่ไม่มีจะไม่ถูกใส่ในผลลัพธ์ */
export function localizeBoth(node: TemplateNode, cat: LocaleCatalog): Localized | undefined {
  const en = renderLocalized(node, 'en', cat)
  const th = renderLocalized(node, 'th', cat)
  if (!en && !th) return undefined
  return { ...(en ? { en } : {}), ...(th ? { th } : {}) }
}

// ── แม่แบบสำหรับจับคู่ประโยคจีนสำเร็จรูป (ใช้กับข้อมูล legacy ที่ยังไม่มีคีย์ เช่น Spec+ ของเกียร์) ──
// แปลง "技能閃避機率+%d%" เป็น regex จับตัวเลข แล้วเอาไปเติมลงแม่แบบไทย/อังกฤษ
// ส่งไปฝั่งหน้าเว็บผ่าน /api/talent-dict (talentTranslate ลองชั้นนี้ก่อนตัวแปลแบบเดิม)
export interface PhraseTemplate { zh: string; en: string; th: string }

export function phraseTemplates(cat: LocaleCatalog): PhraseTemplate[] {
  const out: PhraseTemplate[] = []
  const seen = new Set<string>()
  for (const e of cat.values()) {
    const zh = e.zh.trim()
    // ต้องมีอักษรจีนจริง ไม่งั้นจับคู่มั่ว (เช่น "PVP", "Buff") และข้ามแม่แบบที่ขึ้นต้นด้วยตัวแทนค่าเฉยๆ
    if (!zh || !/[一-鿿]/.test(zh) || seen.has(zh)) continue
    const th = textOf(e, 'th') ?? ''
    const en = textOf(e, 'en') ?? ''
    if (!th && !en) continue
    seen.add(zh)
    out.push({ zh, en, th })
  }
  // ยาวก่อน — แม่แบบที่เจาะจงกว่าชนะ
  return out.sort((a, b) => b.zh.length - a.zh.length)
}
