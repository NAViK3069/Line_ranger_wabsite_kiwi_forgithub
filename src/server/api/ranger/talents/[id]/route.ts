// ====================================================
// API: GET /api/ranger/talents/[id]
// คืน talent data (主要才能 + 強化才能) ของ ranger จาก warmycat API
//
// 🏗 Resource optimization (matching 7-day pattern):
//   • CDN cache 7 วัน — request ส่วนใหญ่ไม่ถึง server
//   • Redis key แยกต่อ ranger — request กิน ~1KB ไม่ใช่ 250KB
//   • TTL 7 วัน + "primed" flag
//   • Fetch warmycat 1× ต่อ 7 วัน (เมื่อ primed flag หมดอายุ)
//
// Flow:
//   request /api/ranger/talents/u1601e-james
//     → CDN cache hit (7d) → served, no server hit         ← ส่วนใหญ่
//     → CDN miss → server:
//       → MGET [lr:talent:u1601e-james, lr:talent:primed]
//         → ถ้ามี talent key → return (small payload ~1KB)
//         → ถ้าไม่มี แต่ primed → return { hasTalent: false }
//         → ถ้าไม่ primed → populate all (fetch warmycat 1×)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis, REDIS_TTL, redisKey } from '@/lib/redis'
import { fetchCustomLocale, localizeBoth, WARMYCAT_V2_RANGERS_URL } from '@/lib/warmycatLocale'
import type { LocaleCatalog, Localized } from '@/lib/warmycatLocale'

export const maxDuration = 60

const WARMYCAT_URL = 'https://rangerbook.warmycat.com/res/Rangers_data.json'
const LERICO_ABILITY_URL = 'https://rangers.lerico.net/api/v2/translate?keys=th:ABILITY,en:ABILITY'
const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

// สกัด skill id จากชื่อไฟล์ icon ของ 技能1 เช่น "skill_icon_sk1549_moon.png" → "1549"
// ใช้ประกอบ key "ab_tlt_{id}_desc" ของ lerico ABILITY dict (ยืนยันแล้วว่าตรงกับ 主要才能.敘述 ของ ranger นั้น)
function extractSkillId(icon: unknown): string | null {
  if (typeof icon !== 'string') return null
  const m = icon.match(/sk(\d+)_/)
  return m ? m[1] : null
}

/** Fetch lerico th/en:ABILITY dict ครั้งเดียว → ใช้แปล ab_tlt_{id}_desc เป็นคำอธิบาย Major Talent
 *  (ไม่ cache แยก — ฟังก์ชันนี้ถูกเรียกจาก populateAllTalents ซึ่งรันแค่ 1 ครั้ง/7วันอยู่แล้ว) */
async function fetchTalentDescDict(): Promise<{ th: Record<string, string>; en: Record<string, string> }> {
  try {
    const res = await fetch(LERICO_ABILITY_URL, { headers: FETCH_HEADERS })
    if (!res.ok) return { th: {}, en: {} }
    const json = await res.json() as Record<string, Record<string, string>>
    return { th: json['th:ABILITY'] ?? {}, en: json['en:ABILITY'] ?? {} }
  } catch {
    return { th: {}, en: {} }
  }
}

// browser/CDN cache 1 ชั่วโมง (stale-while-revalidate 1 วัน) — เดิม 7 วันทำให้ ranger ที่เพิ่งมี talent
// ใหม่ (หรือหลัง sync แก้ primed flag) กว่าจะเห็นได้นานเกินไป ทั้งฝั่ง browser cache ของแต่ละคนเองและ CDN
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

interface BuffEffect {
  triggerRate: string       // "100%"
  effect: string            // "所有技能冷卻減少2秒"
  template: string          // "所有技能冷卻減少N秒"
  effectL?: Localized       // ข้อความทางการ th/en จาก warmycat v2 (มี = ใช้แทนการแปลจากจีน)
}

interface PrimaryTalent {
  description: string
  descriptionTh?: string      // จาก lerico th:ABILITY key ab_tlt_{skillId}_desc
  descriptionEn?: string      // จาก lerico en:ABILITY key ab_tlt_{skillId}_desc
  triggerRate: string
  condition: string
  conditionTemplate: string
  condition2?: string         // เงื่อนไข 2 (เฉพาะบาง ranger เช่น u1603e-sh)
  conditionL?: Localized      // ข้อความทางการของ condition / condition2 (warmycat v2)
  condition2L?: Localized
  buffs: BuffEffect[]
}

interface TalentData {
  hasTalent: boolean
  primary?: PrimaryTalent
  enhanced?: string[]
  enhancedL?: (Localized | null)[]   // ตรงตำแหน่งกับ enhanced[] — null = บรรทัดนั้นไม่มีข้อความทางการ
}

// ── ข้อมูล v2 ของ warmycat: talent เก็บเป็น "คีย์ + ตัวเลข" (เรนเดอร์เป็นไทย/อังกฤษทางการได้ตรงๆ) ──
type V2Node = { templateKey?: string; key?: string; args?: unknown[] }
interface V2Talents {
  major?: {
    descriptionKey?: string
    activationConditionKey?: V2Node
    additionalConditions?: { text?: V2Node }[]
    effects?: { localizedEffect?: V2Node }[]
  } | null
  enhancements?: { localizedEffect?: V2Node }[]
}

/** rangerCode → talents (v2) — พังหรือโหลดไม่ได้ = Map ว่าง (ทุกอย่างถอยไปใช้ตัวแปลจากจีนแบบเดิม) */
async function fetchV2Talents(): Promise<Map<string, V2Talents>> {
  try {
    const res = await fetch(WARMYCAT_V2_RANGERS_URL, { headers: FETCH_HEADERS })
    if (!res.ok) return new Map()
    const d = await res.json() as { rangers?: { rangerCode?: string; talents?: V2Talents | null }[] }
    const out = new Map<string, V2Talents>()
    for (const r of d.rangers ?? []) {
      if (r?.rangerCode && r.talents) out.set(r.rangerCode.toLowerCase(), r.talents)
    }
    return out
  } catch {
    return new Map()
  }
}

/** เติมข้อความทางการ (th/en) ลงข้อมูล talent ที่ parse จาก legacy แล้ว
 *  จับคู่ตามตำแหน่ง — ถ้าจำนวนบรรทัดไม่ตรงกัน (ข้อมูลสองชุดไม่ตรงรุ่น) จะไม่เติมส่วนนั้น ปลอดภัยกว่าเติมผิดบรรทัด */
function attachLocalized(t: TalentData, v2: V2Talents | undefined, cat: LocaleCatalog, descDict: { th: Record<string, string>; en: Record<string, string> }): TalentData {
  if (!t.hasTalent || !t.primary || !v2) return t
  const p = { ...t.primary }
  const m = v2.major
  if (m) {
    const cond = localizeBoth(m.activationConditionKey as never, cat)
    if (cond) p.conditionL = cond
    const extra = (m.additionalConditions ?? []).map(c => localizeBoth(c.text as never, cat))
    if (p.condition2 && extra[0]) p.condition2L = extra[0]
    const effects = (m.effects ?? []).map(e => localizeBoth(e.localizedEffect as never, cat))
    if (effects.length === p.buffs.length) {
      p.buffs = p.buffs.map((b, i) => (effects[i] ? { ...b, effectL: effects[i] } : b))
    }
    // คำอธิบาย: คีย์จาก v2 ตรงกว่าการเดาเลขสกิลจากชื่อไฟล์ไอคอน (ใช้ dict ABILITY ของ lerico ชุดเดิม)
    const descKey = m.descriptionKey?.replace(/^ABILITY:/, '')
    if (descKey) {
      const normalizeDesc = (s: string) => s.replace(/\\n/g, '\n').replace(/\n{2,}/g, '\n')
      if (descDict.th[descKey]) p.descriptionTh = normalizeDesc(descDict.th[descKey])
      if (descDict.en[descKey]) p.descriptionEn = normalizeDesc(descDict.en[descKey])
    }
  }
  const enh = (v2.enhancements ?? []).map(e => localizeBoth(e.localizedEffect as never, cat) ?? null)
  const out: TalentData = { ...t, primary: p }
  if (t.enhanced && enh.length === t.enhanced.length && enh.some(Boolean)) out.enhancedL = enh
  return out
}

// Normalize ranger id เป็น base (ตัด tier letter e/u/h หลังเลข)
//   u1602e-sh / u1602u-sh / u1602h-sh → u1602-sh
// → ทุก tier ของ ranger เดียวกัน ใช้ cache key เดียว (talent ตรงกันทุก tier — verified)
// หมายเหตุ: ตัดเฉพาะ e/u/h (tier letters) ไม่ตัด s หรืออื่นๆ ที่อาจเป็นส่วนของชื่อ
function baseRangerId(id: string): string {
  const m = id.match(/^(u\d+)[euh](-.+)$/i)
  return m ? `${m[1]}${m[2]}` : id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTalent(rawTalent: any, skillId: string | null, descDict: { th: Record<string, string>; en: Record<string, string> }): TalentData {
  if (!rawTalent || typeof rawTalent !== 'object') return { hasTalent: false }
  const primary = rawTalent['主要才能']
  const enhanced = rawTalent['強化才能']
  if (!primary || typeof primary !== 'object') return { hasTalent: false }

  // condition2 มีเฉพาะบาง ranger (เช่น u1603e-sh มี "類型為智慧型")
  const cond2 = primary['條件2']
  const condition2 = (typeof cond2 === 'string' && cond2.trim()) ? cond2 : undefined

  const descKey = skillId ? `ab_tlt_${skillId}_desc` : null
  const descriptionTh = descKey ? descDict.th[descKey] : undefined
  const descriptionEn = descKey ? descDict.en[descKey] : undefined

  // แปลง \n literal → newline จริง + ยุบบรรทัดว่างซ้ำ (\n\n\n... → \n เดียว)
  const normalizeDesc = (s: string) => s.replace(/\\n/g, '\n').replace(/\n{2,}/g, '\n')

  return {
    hasTalent: true,
    primary: {
      description:       normalizeDesc(String(primary['敘述'] ?? '')),
      ...(descriptionTh ? { descriptionTh: normalizeDesc(descriptionTh) } : {}),
      ...(descriptionEn ? { descriptionEn: normalizeDesc(descriptionEn) } : {}),
      triggerRate:       String(primary['觸發機率'] ?? ''),
      condition:         String(primary['條件'] ?? ''),
      conditionTemplate: String(primary['條件搜尋分類'] ?? ''),
      ...(condition2 ? { condition2 } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buffs: Array.isArray(primary['增益效果']) ? primary['增益效果'].map((b: any) => ({
        triggerRate: String(b['觸發機率'] ?? ''),
        effect:      String(b['效果'] ?? ''),
        template:    String(b['效果搜尋分類'] ?? ''),
      })) : [],
    },
    enhanced: Array.isArray(enhanced) ? enhanced.map(String) : [],
  }
}

/** Fetch warmycat + parse ทุก ranger + populate Redis (per-ranger keys + primed flag)
 *  รันครั้งเดียวต่อ 7 วัน (เมื่อ primed flag หมดอายุ) */
async function populateAllTalents(): Promise<Map<string, TalentData>> {
  const [res, descDict, v2Talents, catalog] = await Promise.all([
    fetch(WARMYCAT_URL, { headers: FETCH_HEADERS }),
    fetchTalentDescDict(),
    fetchV2Talents(),
    fetchCustomLocale().catch(() => new Map() as LocaleCatalog),
  ])
  if (!res.ok) throw new Error(`Warmycat fetch failed: ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : Object.values(data)

  const result = new Map<string, TalentData>()
  const writeOps: Promise<unknown>[] = []

  const writtenBases = new Set<string>()   // กัน write ซ้ำ base เดียวกันหลาย tier
  for (const ranger of list as Array<Record<string, unknown>>) {
    if (!ranger || typeof ranger !== 'object') continue
    const rangerId = String(ranger.ranger_id ?? '').toLowerCase()
    if (!rangerId) continue

    const skillId = extractSkillId((ranger['技能1'] as Record<string, unknown> | undefined)?.['icon'])
    const talent = attachLocalized(parseTalent(ranger['才能'], skillId, descDict), v2Talents.get(rangerId), catalog, descDict)
    const base = baseRangerId(rangerId)
    // เก็บผลลัพธ์ใน map keyed by base
    // ⚠️ ถ้า base มีทั้ง tier ที่มี talent + tier ที่ NONE → ให้ตัวที่ "มี talent" ชนะ
    //    (ทุก tier ของ ranger เดียวกันควรขึ้น talent เหมือนกัน)
    const existing = result.get(base)
    if (talent.hasTalent || !existing) {
      result.set(base, talent)
    }

    // เก็บเฉพาะ ranger ที่ "มี" talent + base ยังไม่เคย write (ลด ~3 เท่า เพราะ tier ใช้ key เดียว)
    // (rangers ไม่มี talent → ใช้ primed flag ตัดสินได้ ไม่ต้องเก็บ)
    if (redis && talent.hasTalent && !writtenBases.has(base)) {
      writtenBases.add(base)
      writeOps.push(
        redis.set(redisKey.talent(base), JSON.stringify(talent), { ex: REDIS_TTL.talent })
          .catch(() => {})    // ignore individual write errors
      )
    }
  }

  // primed flag — บอกว่า cache ถูก populate แล้ว
  // ถ้าไม่มี flag = cache ยังว่าง → ต้อง populate ใหม่
  if (redis) {
    writeOps.push(
      redis.set(redisKey.talentPrimed(), '1', { ex: REDIS_TTL.talent }).catch(() => {})
    )
  }

  // รอ write ทั้งหมดเสร็จ (fire-and-forget ก็ได้ แต่รอเพื่อให้ retry ทำงานได้)
  await Promise.all(writeOps)
  return result
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!/^[a-z0-9][a-z0-9_\-]+$/i.test(id)) {
    return NextResponse.json({ hasTalent: false, error: 'Invalid id' }, { status: 400 })
  }

  // normalize เป็น base ranger → ทุก tier (e/u/h) ใช้ cache เดียวกัน
  const base = baseRangerId(id)

  try {
    // ── No Redis (local dev ไม่มี env) → fetch + parse ทุกครั้ง ──
    if (!redis) {
      const map = await populateAllTalents()
      return NextResponse.json(map.get(base) ?? { hasTalent: false }, { headers: CACHE_HEADERS })
    }

    // ── Cache lookup ── 1 round trip ดึง 2 keys (ใช้ base id)
    const [talentRaw, primed] = await redis.mget<[unknown, unknown]>(
      redisKey.talent(base),
      redisKey.talentPrimed(),
    )

    // 1) มี talent ใน cache → return
    if (talentRaw) {
      const talent = typeof talentRaw === 'string' ? JSON.parse(talentRaw) as TalentData : talentRaw as TalentData
      return NextResponse.json(talent, { headers: CACHE_HEADERS })
    }

    // 2) ไม่มี talent key แต่ primed → ranger นี้ไม่มี talent ใน game
    if (primed) {
      return NextResponse.json({ hasTalent: false } as TalentData, { headers: CACHE_HEADERS })
    }

    // 3) Cache ว่าง → populate + return result
    const map = await populateAllTalents()
    return NextResponse.json(map.get(base) ?? { hasTalent: false }, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[Talents] error:', err)
    // Silent fail — return no-talent ให้ UI ซ่อน TalentSection
    return NextResponse.json({ hasTalent: false, error: 'Internal error' } as TalentData, {
      status: 500,
    })
  }
}
