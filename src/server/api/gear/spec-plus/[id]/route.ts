// ====================================================
// API: GET /api/gear/spec-plus/[id]
// คืน Spec+ ของเกียร์ 9★ จาก warmycat 裝備資料庫.json
//
// 🏗 mirror ระบบ talent (7-day pattern):
//   • CDN cache 7 วัน — request ส่วนใหญ่ไม่ถึง server
//   • Redis key แยกต่อเกียร์ (~1KB) + primed flag
//   • Fetch warmycat 1× ต่อ 7 วัน (เมื่อ primed flag หมดอายุ)
//
// Flow (เหมือน /api/ranger/talents):
//   → CDN hit → เสิร์ฟไม่ผ่าน server           ← ส่วนใหญ่
//   → CDN miss → MGET [lr:gearspec:<id>, primed]
//     → มี key → return  | primed แต่ไม่มี key → { hasSpec:false }
//     → ไม่ primed → populate all (fetch warmycat 1×)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis, REDIS_TTL, redisKey } from '@/lib/redis'
import { fetchCustomLocale, localizeBoth } from '@/lib/warmycatLocale'
import type { LocaleCatalog, Localized } from '@/lib/warmycatLocale'
import { gameText } from '@/lib/gameData'

export const maxDuration = 60

const WARMYCAT_URL =
  'https://rangerbook.warmycat.com/res/' + encodeURIComponent('裝備資料庫') + '.json'
// ข้อมูล v2 ของ warmycat — Spec+ เก็บเป็นคีย์ข้อความ (เรนเดอร์เป็นไทย/อังกฤษทางการได้ตรงๆ)
const WARMYCAT_V2_EQUIP_URL = 'https://rangerbook.warmycat.com/res/v2/equipment.json'
const FETCH_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }

// "裝備種類" (จีน) → prefix ที่ lerico EQUIP dict ใช้ใน key "SPC_{prefix}_{id}_..."
// ยืนยันจาก dict จริง: มีแค่ 3 prefix (wpn/amr/acc) ตรงกับ 3 ประเภทเกียร์พอดี
const GEAR_TYPE_PREFIX: Record<string, string> = {
  '武器': 'wpn',
  '防具': 'amr',
  '飾品': 'acc',
}

interface EquipDict { zh: Record<string, string>; th: Record<string, string>; en: Record<string, string> }

/** ข้อความ zh/th/en ของ EQUIP จากไฟล์ภาษาของเกม → ใช้หา SPC_{prefix}_{id} จากชื่อ (จีน) + แปล desc
 *  (เดิมดึง zh/th/en:EQUIP ของ lerico — ข้อความชุดเดียวกัน) */
async function fetchEquipDict(): Promise<EquipDict> {
  return { zh: gameText('zh', 'EQUIP'), th: gameText('th', 'EQUIP'), en: gameText('en', 'EQUIP') }
}

/** สร้าง lookup "prefix:ชื่อจีน" → SPC id (เช่น "wpn:褪色" → "0001") จาก zh:EQUIP dict
 *  (เก็บทุก "SPC_{prefix}_{id}_nm" entry) */
function buildSpecNameLookup(zh: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  const re = /^SPC_([a-z]+)_(\d+)_nm$/
  for (const [key, name] of Object.entries(zh)) {
    const m = key.match(re)
    if (!m || !name) continue
    map.set(`${m[1]}:${name}`, m[2])
  }
  return map
}

// browser/CDN cache 1 ชั่วโมง (stale-while-revalidate 1 วัน) — เดิม 7 วันทำให้เกียร์ที่เพิ่งมี Spec+
// ใหม่ (หรือหลัง sync แก้ primed flag) กว่าจะเห็นได้นานเกินไป ทั้งฝั่ง browser cache ของแต่ละคนเองและ CDN
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

// ── โครงสร้างที่ส่งกลับ (Chinese ดิบ — แปลฝั่ง client เหมือน talent) ──
// v2: เพิ่ม perLevel — Spec+ สเกลตามระดับเกียร์ได้ (每次升級增加 ฯลฯ) — คำนวณ/แสดงฝั่ง client
interface SpecTriggerEffect {
  triggerRate: string           // 觸發機率
  triggerRatePerLevel?: string  // 每次升級觸發機率增加
  effect: string                // 效果 (จีน — แปล client)
  effectL?: Localized           // ชื่อเอฟเฟกต์ทางการ th/en (warmycat v2) — มี = ใช้แทนการแปลจากจีน
  coef: string                  // 係數
  coefPerLevel?: string         // 每次升級係數增加
  time: string                  // 時間 (เช่น "3秒", "-", "1.5秒 ~ 2秒")
  timePerLevel?: string         // 每次升級時間增加
}
interface SpecSpecial {
  description: string    // 敘述 (จีน — แปล client)
  triggerRate: string    // 觸發機率
  condition: string      // 條件 (จีน)
  condition2?: string    // 條件2 (บางชิ้น)
  conditionL?: Localized   // ข้อความทางการของ condition / condition2 (warmycat v2)
  condition2L?: Localized
  triggerEffect: SpecTriggerEffect | null  // 觸發效果
}
export interface GearSpecData {
  hasSpec: boolean
  name?: string                         // 名稱 (จีน — แปล client, fallback ถ้าไม่มี nameTh/nameEn)
  nameTh?: string                       // จาก lerico th:EQUIP (SPC_{prefix}_{id}_nm)
  nameEn?: string                       // จาก lerico en:EQUIP
  // เทมเพลตคำอธิบาย ดิบ (มี placeholder %s / {$Np} / {$Nf} + tag สี <#RRGGBB>...<->) — client แทนค่า+render เอง
  descTemplatesTh?: string[]
  descTemplatesEn?: string[]
  basic?: { stat: string; value: string; perLevel?: string; statL?: Localized }[]  // 基本效果 (stat จีน, value ช่วง, 每次升級增加, ชื่อทางการ)
  special?: SpecSpecial | null          // 特殊效果
}

const PER_LEVEL_KEY = '每次升級增加'
const MAX_DESC_INDEX = 5   // ยืนยันจาก dict จริงมีสูงสุด desc2 — กันไว้เผื่ออนาคตเพิ่ม

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSpec(raw: any, gearTypeZh: string, equipDict: EquipDict, nameLookup: Map<string, string>): GearSpecData {
  if (!raw || typeof raw !== 'object') return { hasSpec: false }
  const basicObj = (raw['基本效果'] && typeof raw['基本效果'] === 'object') ? raw['基本效果'] : {}
  // "每次升級增加" เป็น metadata (per-level increment ของ stat ตัวเดียวที่อยู่ในนี้) ไม่ใช่ stat แยก
  const perLevelBasic = basicObj[PER_LEVEL_KEY] != null ? String(basicObj[PER_LEVEL_KEY]) : undefined
  const basic = Object.entries(basicObj)
    .filter(([stat]) => stat !== PER_LEVEL_KEY)
    .map(([stat, value]) => ({
      stat: String(stat), value: String(value ?? ''),
      ...(perLevelBasic ? { perLevel: perLevelBasic } : {}),
    }))

  const se = raw['特殊效果']
  let special: SpecSpecial | null = null
  if (se && typeof se === 'object') {
    const te = se['觸發效果']
    const cond2 = se['條件2']
    special = {
      description: String(se['敘述'] ?? '').replace(/\\n/g, '\n'),
      triggerRate: String(se['觸發機率'] ?? ''),
      condition:   String(se['條件'] ?? ''),
      ...(typeof cond2 === 'string' && cond2.trim() ? { condition2: cond2 } : {}),
      triggerEffect: (te && typeof te === 'object') ? {
        triggerRate:         String(te['觸發機率'] ?? ''),
        ...(te['每次升級觸發機率增加'] != null ? { triggerRatePerLevel: String(te['每次升級觸發機率增加']) } : {}),
        effect:              String(te['效果'] ?? ''),
        coef:                String(te['係數'] ?? ''),
        ...(te['每次升級係數增加'] != null ? { coefPerLevel: String(te['每次升級係數增加']) } : {}),
        time:                String(te['時間'] ?? ''),
        ...(te['每次升級時間增加'] != null ? { timePerLevel: String(te['每次升級時間增加']) } : {}),
      } : null,
    }
  }

  const name = String(raw['名稱'] ?? '') || undefined
  // หา SPC_{prefix}_{id} จากชื่อจีนตรงๆ (ยืนยันแล้วว่า 名稱 ตรงกับ SPC_{prefix}_{id}_nm ของ lerico เป๊ะ)
  const prefix = GEAR_TYPE_PREFIX[gearTypeZh]
  const specId = (name && prefix) ? nameLookup.get(`${prefix}:${name}`) : undefined
  let nameTh: string | undefined
  let nameEn: string | undefined
  let descTemplatesTh: string[] | undefined
  let descTemplatesEn: string[] | undefined
  if (specId) {
    const base = `SPC_${prefix}_${specId}`
    nameTh = equipDict.th[`${base}_nm`] || undefined
    nameEn = equipDict.en[`${base}_nm`] || undefined
    const th: string[] = []
    const en: string[] = []
    for (let i = 1; i <= MAX_DESC_INDEX; i++) {
      const t = equipDict.th[`${base}_desc${i}`]
      const e = equipDict.en[`${base}_desc${i}`]
      if (!t && !e) continue
      if (t) th.push(t)
      if (e) en.push(e)
    }
    if (th.length) descTemplatesTh = th
    if (en.length) descTemplatesEn = en
  }

  return {
    hasSpec: basic.length > 0 || !!special,
    name,
    ...(nameTh ? { nameTh } : {}),
    ...(nameEn ? { nameEn } : {}),
    ...(descTemplatesTh ? { descTemplatesTh } : {}),
    ...(descTemplatesEn ? { descTemplatesEn } : {}),
    basic,
    special,
  }
}

// ── Spec+ ของ v2: ทุกข้อความเป็นคีย์ ──
type V2Node = { templateKey?: string; key?: string; args?: unknown[] }
interface V2Spec {
  basicOptions?: { optionKey?: string }[]
  specialOptions?: {
    conditionKeys?: V2Node[]
    // เงื่อนไขเป้าหมาย (ชนิด/ธาตุ) — legacy แสดงเป็น 條件2 เช่น "類型為敏捷型 且 屬性為暗"
    conditions?: { kind?: string; value?: string; join?: string; secondaryKind?: string; secondaryValue?: string }[]
    effect?: { nameKey?: string }
  }[]
}

/** เงื่อนไขเป้าหมายแบบมีโครงสร้าง → ข้อความทางการ เช่น th "ชนิด: ความว่องไว และ ธาตุ: มืด"
 *  แต่ละส่วนใช้แม่แบบ V2_ABILITY_CONDITION_JOIN ("%N1: %N2") ของ warmycat — คำเชื่อม "และ/and" ใส่เอง (ต้นทางไม่มีคีย์ให้) */
function localizeTargetCondition(
  c: NonNullable<NonNullable<V2Spec['specialOptions']>[number]['conditions']>[number] | undefined,
  cat: LocaleCatalog,
): Localized | undefined {
  if (!c?.kind || !c.value) return undefined
  const part = (kind: string, value: string): V2Node => ({
    templateKey: 'CUSTOM:V2_ABILITY_CONDITION_JOIN',
    args: [
      { key: `CUSTOM:ABILITY_CONDITION_TYPE_${kind}` },
      { key: kind === 'ELEMENT' ? `CUSTOM:ELEMENT_${value}` : `CUSTOM:${kind}_${value}` },
    ],
  })
  const parts = [part(c.kind, c.value)]
  if (c.join === 'AND' && c.secondaryKind && c.secondaryKind !== 'NONE' && c.secondaryValue && c.secondaryValue !== 'NONE') {
    parts.push(part(c.secondaryKind, c.secondaryValue))
  }
  const out: Localized = {}
  for (const lang of ['en', 'th'] as const) {
    const texts = parts.map(n => localizeBoth(n as never, cat)?.[lang])
    if (texts.every(Boolean)) out[lang] = texts.join(lang === 'th' ? ' และ ' : ' and ')
  }
  return out.en || out.th ? out : undefined
}

/** equipCode → specPlus (v2) — โหลดไม่ได้ = Map ว่าง (ทุกอย่างถอยไปแปลจากจีนแบบเดิม) */
async function fetchV2Specs(): Promise<Map<string, V2Spec>> {
  try {
    const res = await fetch(WARMYCAT_V2_EQUIP_URL, { headers: FETCH_HEADERS })
    if (!res.ok) return new Map()
    const d = await res.json() as { equipment?: { equipCode?: string; specPlus?: V2Spec | null }[] }
    const out = new Map<string, V2Spec>()
    for (const e of d.equipment ?? []) {
      if (e?.equipCode && e.specPlus) out.set(e.equipCode.toLowerCase(), e.specPlus)
    }
    return out
  } catch {
    return new Map()
  }
}

/** เติมข้อความทางการลง Spec+ ที่ parse จาก legacy — จับคู่ตามตำแหน่ง (legacy โชว์เฉพาะตัวเลือกพิเศษชุดแรก)
 *  ชื่อ stat มาจาก EQUIP ของ lerico (ตรงกับข้อความทางการของ warmycat ทุกตัว) ส่วนเงื่อนไข/เอฟเฟกต์มาจาก custom.json */
function attachLocalizedSpec(spec: GearSpecData, v2: V2Spec | undefined, cat: LocaleCatalog, equipDict: EquipDict): GearSpecData {
  if (!spec.hasSpec || !v2) return spec
  const out: GearSpecData = { ...spec }
  const opts = v2.basicOptions ?? []
  if (spec.basic && opts.length === spec.basic.length) {
    out.basic = spec.basic.map((b, i) => {
      const k = opts[i]?.optionKey?.replace(/^EQUIP:/, '')
      // ชื่อใน EQUIP บางตัวมีขึ้นบรรทัดฝังมา (เช่น "Damage \nReduction") — ยุบเป็นช่องว่างเดียว
      const clean = (t?: string) => t?.replace(/\\n|[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || undefined
      const th = clean(k ? equipDict.th[k] : undefined)
      const en = clean(k ? equipDict.en[k] : undefined)
      return th || en ? { ...b, statL: { ...(en ? { en } : {}), ...(th ? { th } : {}) } } : b
    })
  }
  const first = v2.specialOptions?.[0]
  if (spec.special && first) {
    const sp = { ...spec.special }
    const c1 = localizeBoth(first.conditionKeys?.[0] as never, cat)
    const c2 = localizeBoth(first.conditionKeys?.[1] as never, cat)
    if (c1) sp.conditionL = c1
    // เงื่อนไขที่ 2: คีย์ข้อความชุดที่สอง หรือเงื่อนไขเป้าหมายแบบมีโครงสร้าง (ชนิด/ธาตุ)
    const target = localizeTargetCondition(first.conditions?.[0], cat)
    if (sp.condition2 && (c2 ?? target)) sp.condition2L = c2 ?? target
    const eff = first.effect?.nameKey ? localizeBoth({ key: first.effect.nameKey }, cat) : undefined
    if (sp.triggerEffect && eff) sp.triggerEffect = { ...sp.triggerEffect, effectL: eff }
    out.special = sp
  }
  return out
}

/** Fetch warmycat + parse ทุกเกียร์ที่มี Spec+ → populate Redis (per-gear + primed) */
async function populateAllSpecs(): Promise<Map<string, GearSpecData>> {
  const [res, equipDict, v2Specs, catalog] = await Promise.all([
    fetch(WARMYCAT_URL, { headers: FETCH_HEADERS }),
    fetchEquipDict(),
    fetchV2Specs(),
    fetchCustomLocale().catch(() => new Map() as LocaleCatalog),
  ])
  if (!res.ok) throw new Error(`Warmycat fetch failed: ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : Object.values(data)
  const nameLookup = buildSpecNameLookup(equipDict.zh)

  const result = new Map<string, GearSpecData>()
  const writeOps: Promise<unknown>[] = []

  for (const gear of list as Array<Record<string, unknown>>) {
    if (!gear || typeof gear !== 'object') continue
    const id = String(gear.id ?? '').toLowerCase()
    if (!id) continue
    const sp = gear['Spec+']
    if (!sp || typeof sp !== 'object' || !Object.keys(sp).length) continue

    const gearTypeZh = String(gear['裝備種類'] ?? '')
    const spec = attachLocalizedSpec(parseSpec(sp, gearTypeZh, equipDict, nameLookup), v2Specs.get(id), catalog, equipDict)
    if (!spec.hasSpec) continue
    result.set(id, spec)

    if (redis) {
      writeOps.push(
        redis.set(redisKey.gearSpec(id), JSON.stringify(spec), { ex: REDIS_TTL.gearSpec })
          .catch(() => {})
      )
    }
  }

  if (redis) {
    writeOps.push(
      redis.set(redisKey.gearSpecPrimed(), '1', { ex: REDIS_TTL.gearSpec }).catch(() => {})
    )
  }
  await Promise.all(writeOps)
  return result
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = rawId.toLowerCase().trim()

  if (!/^[a-z0-9][a-z0-9_\-]+$/i.test(id)) {
    return NextResponse.json({ hasSpec: false, error: 'Invalid id' }, { status: 400 })
  }

  try {
    // ── No Redis (local dev) → fetch + parse ทุกครั้ง ──
    if (!redis) {
      const map = await populateAllSpecs()
      return NextResponse.json(map.get(id) ?? { hasSpec: false }, { headers: CACHE_HEADERS })
    }

    const [specRaw, primed] = await redis.mget<[unknown, unknown]>(
      redisKey.gearSpec(id),
      redisKey.gearSpecPrimed(),
    )

    if (specRaw) {
      const spec = typeof specRaw === 'string' ? JSON.parse(specRaw) as GearSpecData : specRaw as GearSpecData
      return NextResponse.json(spec, { headers: CACHE_HEADERS })
    }
    if (primed) {
      return NextResponse.json({ hasSpec: false } as GearSpecData, { headers: CACHE_HEADERS })
    }

    const map = await populateAllSpecs()
    return NextResponse.json(map.get(id) ?? { hasSpec: false }, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[GearSpec] error:', err)
    return NextResponse.json({ hasSpec: false, error: 'Internal error' } as GearSpecData, { status: 500 })
  }
}
