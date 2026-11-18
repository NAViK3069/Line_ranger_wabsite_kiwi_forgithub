'use client'
// ====================================================
// GearSpecSection — แสดง Spec+ ของเกียร์ 9★ จาก warmycat
// • Show เฉพาะเกียร์ 9★ ที่มี Spec+ (ไม่มี → return null)
// • ธีมสีม่วง (แยกจาก Basic/Switchable/SKILL+)
// • แปลภาษาผ่าน talentTranslate (ระบบเดียวกับพรสวรรค์เรนเจอร์)
// • Spec+ สเกลตามระดับเกียร์ได้ (每次升級增加 จาก warmycat) → slider 0-5max
// ====================================================

import { apiFetch } from '@/lib/staticApi'
import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  translateStatLine, translateCondition, translateDescription, translateBuffEffect,
  type ExtraDict,
} from '@/lib/talentTranslate'

// ── Singleton: fetch /api/talent-dict ครั้งเดียวต่อ session (zh→en จาก lerico) ──
let dictPromise: Promise<ExtraDict> | null = null
function getDict(): Promise<ExtraDict> {
  if (!dictPromise) {
    dictPromise = apiFetch('/api/talent-dict')
      .then(r => {
        const ct = r.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json() as Promise<ExtraDict>
      })
      .then(d => d && typeof d === 'object' ? d : { stats: {}, phrases: {} })
      .catch(() => ({ stats: {}, phrases: {} }))
  }
  return dictPromise
}

/** ข้อความทางการสองภาษาจาก warmycat v2 — ภาษาที่ต้นทางยังไม่มีจะไม่มีฟิลด์นั้น */
interface Localized { en?: string; th?: string }

interface SpecTriggerEffect {
  triggerRate: string; triggerRatePerLevel?: string
  effect: string
  effectL?: Localized
  coef: string; coefPerLevel?: string
  time: string; timePerLevel?: string
}
interface SpecSpecial {
  description: string
  triggerRate: string
  condition: string
  condition2?: string
  conditionL?: Localized
  condition2L?: Localized
  triggerEffect: SpecTriggerEffect | null
}
interface GearSpecData {
  hasSpec: boolean
  name?: string
  nameTh?: string
  nameEn?: string
  descTemplatesTh?: string[]
  descTemplatesEn?: string[]
  basic?: { stat: string; value: string; perLevel?: string; statL?: Localized }[]
  special?: SpecSpecial | null
}

interface Props {
  itemCode: string
  grade: number | string | null
  // false = ไม่มี slider ให้เลื่อน — ล็อกที่ lockedLevel (ตาม effectLevel ของ Gear value at level หลัก)
  // true/ไม่ระบุ = เลื่อนได้เอง (gear-book)
  interactive?: boolean
  // ระดับที่ล็อกไว้ (0-5) เมื่อ interactive=false เช่น 0=ตู้กาชา(Initial), 5=picker/เกียร์ที่ใส่แล้ว(Max)
  lockedLevel?: number
  // ── controlled slider (optional) — ให้ parent ยก state ขึ้นไปคุมเอง (เช่น Ranger Book ที่ต้อง sync
  //    ระดับ Spec+ กับไอคอนป้ายมุมเกียร์) ถ้าไม่ส่งมา ใช้ state ภายในเอง (uncontrolled) ──
  specLevel?: number
  onSpecLevelChange?: (level: number) => void
}

// ── คำนวณค่า ณ ระดับ (level 0-5) จาก "min ~ max" + per-level increment ──
//   base: ค่าดิบจาก warmycat เช่น "8.0% ~ 12.0%", "100%", "3秒", "-"
//   perLevel: เช่น "1.6%", "0秒" — เพิ่มทีละเท่านี้ต่อ 1 ระดับ
//   ⚠️ ใช้ค่า "สูงสุด" ของช่วงเป็นฐานเสมอ (ไม่ใช่ต่ำสุด) — ตามธรรมเนียมเว็บเรา
function parseLeadingNum(s?: string): number {
  if (!s) return 0
  const m = s.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : 0
}
// ค่าสุดท้ายในสตริง = สูงสุดของช่วง (หรือค่าเดียวถ้าไม่มีช่วง "~")
function parseMaxNum(s?: string): number {
  if (!s) return 0
  const nums = s.match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length === 0) return 0
  return parseFloat(nums[nums.length - 1])
}
function formatNum(n: number): string {
  return n.toFixed(1)   // เหมือนสไตล์ตัวเลขในส่วนอื่นของ popup (เช่น "+74.0%")
}
function valueAtLevel(base: string, perLevel: string | undefined, level: number): string {
  if (!base || base === '-') return base || '-'
  const max = parseMaxNum(base)   // ฐาน = ค่าสูงสุดของช่วงเสมอ
  const inc = perLevel ? parseLeadingNum(perLevel) : 0
  const val = max + inc * level
  const suffix = base.includes('%') ? '%' : (base.includes('秒') ? '秒' : '')
  return `${formatNum(val)}${suffix}`
}
// เหมือน valueAtLevel แต่คืนแค่ตัวเลข ไม่มี suffix — ใช้แทนค่าใน placeholder {$Nf} ที่ template มีหน่วยของตัวเองอยู่แล้ว (เช่น "วินาที")
function numAtLevel(base: string, perLevel: string | undefined, level: number): string {
  if (!base || base === '-') return ''
  const max = parseMaxNum(base)
  const inc = perLevel ? parseLeadingNum(perLevel) : 0
  return formatNum(max + inc * level)
}

// ── Render เทมเพลตคำอธิบาย Spec+ จาก lerico (มี placeholder + tag สี) ──
//   %s        → ค่า Basic Effect ปัจจุบัน (มี % ในตัวอยู่แล้ว)
//   {$Np}     → ค่า Trigger Effect coefficient ปัจจุบัน (เปอร์เซ็นต์ มี % ในตัวอยู่แล้ว)
//   {$Nf}     → ค่า Trigger Effect time ปัจจุบัน (ตัวเลขล้วน — template มีหน่วย "วินาที"/"s" ต่อท้ายเองแล้ว)
//   <#RRGGBB>...<->  → highlight ด้วยสีที่ระบุ (ถ้าไม่มี <-> ปิด = ยาวไปจนจบข้อความ)
function renderSpecTemplate(template: string, values: { percent?: string; coefPercent?: string; time?: string }): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  const re = /<#([0-9a-fA-F]{6})>([\s\S]*?)(?:<->|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template))) {
    if (m.index > lastIndex) parts.push(template.slice(lastIndex, m.index))
    let inner = m[2]
    inner = inner.replace(/%s/g, values.percent ?? '')
    inner = inner.replace(/\{\$\d+p\}/g, values.coefPercent ?? '')
    inner = inner.replace(/\{\$\d+f\}/g, values.time ?? '')
    parts.push(<span key={key++} style={{ color: `#${m[1]}` }}>{inner}</span>)
    lastIndex = re.lastIndex
    if (m[0].length === 0) break   // กัน infinite loop
  }
  if (lastIndex < template.length) parts.push(template.slice(lastIndex))
  return parts
}

// ── ไอคอนระดับ Spec+ (ไฟล์จริงชื่อ "Spac+" — ตามที่เพิ่มไว้ใน public/gacha/images) ──
function specLevelIcon(level: number): string {
  const suffix = level >= 5 ? 'max' : `+${level}`
  return `/gacha/images/Spac+_${suffix}.png`
}

export default function GearSpecSection({ itemCode, grade, interactive = true, lockedLevel = 5, specLevel: specLevelProp, onSpecLevelChange }: Props) {
  const { lang, tStat } = useLanguage()
  const [data, setData] = useState<GearSpecData | null>(null)
  const [dict, setDict] = useState<ExtraDict>({ stats: {}, phrases: {} })
  const [loading, setLoading] = useState(true)
  const [internalSpecLevel, setInternalSpecLevel] = useState(0)
  const specLevel = specLevelProp ?? internalSpecLevel
  const setSpecLevel = (level: number) => {
    if (onSpecLevelChange) onSpecLevelChange(level)
    else setInternalSpecLevel(level)
  }

  // เฉพาะเกียร์ 9★ (grade อาจเป็น number 9 หรือ string เช่น "9star"/"9#star")
  const is9star = grade === 9 || (typeof grade === 'string' && grade.startsWith('9'))

  useEffect(() => {
    if (!is9star || !itemCode) { setLoading(false); return }
    let cancelled = false
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10000)
    setLoading(true)

    // ?v=2 = รุ่นที่มีข้อความทางการ — กัน browser ใช้ JSON รุ่นเก่าที่แคชไว้ 7 วัน
    const specPromise = apiFetch(`/api/gear/spec-plus/${encodeURIComponent(itemCode)}?v=2`, { signal: ctrl.signal })
      .then(r => {
        const ct = r.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json() as Promise<GearSpecData>
      })
      .then(d => d && typeof d === 'object' ? d : { hasSpec: false } as GearSpecData)
      .catch(() => ({ hasSpec: false } as GearSpecData))

    Promise.all([specPromise, getDict()])
      .then(([d, dc]) => { if (!cancelled) { setData(d); setDict(dc) } })
      .finally(() => { clearTimeout(timeoutId); if (!cancelled) setLoading(false) })

    return () => { cancelled = true; clearTimeout(timeoutId); ctrl.abort() }
  }, [itemCode, is9star])

  const targetLang: 'en' | 'th' = lang === 'th' ? 'th' : 'en'
  const localize = (zh: string, kind: 'stat' | 'desc' | 'cond' | 'buff', official?: Localized): string => {
    // ข้อความทางการของ warmycat v2 มาก่อน — ไม่มีค่อยแปลจากจีน
    const o = official?.[targetLang]
    if (o) return o.replace(/\\n|[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!zh) return ''
    let out: string
    if (kind === 'stat') out = translateStatLine(zh, targetLang, dict)
    else if (kind === 'cond') out = translateCondition(zh, targetLang, dict)
    else if (kind === 'buff') out = translateBuffEffect(zh, targetLang, dict)
    else out = translateDescription(zh, targetLang, dict)
    return out.replace(/\\n|[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()  // เก็บ \n ค้างจาก dict
  }
  // ชื่อ stat: แปล CN → English ก่อน แล้วส่งผ่าน tStat (ระบบแปลเดียวกับ gear effects)
  //   → ชื่อ stat ตรงกับ Basic/Switchable ของเกียร์ (เช่น "อัตราความแม่นยำของทักษะ")
  //   ถ้า app ไม่มีคำแปล → fallback เป็นคำแปลของ talentTranslate
  const localizeStat = (zh: string, official?: Localized): string => {
    const o = official?.[targetLang]
    if (o) return o
    const en = translateStatLine(zh, 'en', dict).replace(/\s*\([%+]\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
    if (!en) return localize(zh, 'stat')
    if (targetLang === 'en') return en
    const th = tStat(en)
    return th !== en ? th : localize(zh, 'stat')
  }
  // 秒 → หน่วยวินาทีของภาษานั้น: "3秒" → "3 วินาที" / "3s"; "-" คงเดิม
  // ใช้กับทั้งช่องเวลาและช่องสัมประสิทธิ์ (บางเกียร์สัมประสิทธิ์เป็นวินาที เช่นลดเวลาสถานะ "เสน่ห์")
  const localizeTime = (zh: string): string => {
    if (!zh || zh === '-') return zh || '-'
    return zh.replace(/\s*秒/g, targetLang === 'th' ? ' วินาที' : 's')
  }

  if (!is9star) return null
  if (loading) return null
  if (!data || !data.hasSpec) return null

  const { name, nameTh, nameEn, descTemplatesTh, descTemplatesEn, basic, special } = data
  // ชื่อ Spec: ใช้ของจริงจาก lerico th/en:EQUIP ก่อน (แม่นกว่า) — fallback เป็นการแปลแบบเดา ถ้าไม่มี
  const nameFromLerico = lang === 'th' ? nameTh : nameEn
  const nameLoc = nameFromLerico || (name ? localize(name, 'stat') : '')
  const showName = !!nameLoc && !/[一-鿿]/.test(nameLoc)

  // มีข้อมูล per-level ไหม (basic หรือ trigger effect) → โชว์ slider; ถ้าไม่มี → ข้อความเดิม (ไม่ scale)
  const hasLevelData =
    !!basic?.some(b => b.perLevel !== undefined) ||
    !!(special?.triggerEffect && (
      special.triggerEffect.coefPerLevel !== undefined ||
      special.triggerEffect.timePerLevel !== undefined ||
      special.triggerEffect.triggerRatePerLevel !== undefined
    ))

  const L = lang === 'th'
    ? { basic: 'ค่าพื้นฐาน', effect: 'เอฟเฟกต์', value: 'ค่า', special: 'เอฟเฟกต์พิเศษ',
        rate: 'อัตราเกิด', cond: 'เงื่อนไข', trigEffect: 'เอฟเฟกต์ที่เกิด', coef: 'สัมประสิทธิ์', time: 'ระยะเวลา',
        note: 'Spec+ ไม่ขึ้นกับระดับของเกียร์',
        levelLabel: 'ค่า Spec+ ที่ระดับ', initial: 'เริ่มต้น', max: 'สูงสุด' }
    : { basic: 'Basic Effect', effect: 'Effect', value: 'Value', special: 'Special Effect',
        rate: 'Trigger Rate', cond: 'Trigger Condition', trigEffect: 'Trigger Effect', coef: 'Coefficient', time: 'Time',
        note: "Spec+ doesn't scale with gear level",
        levelLabel: 'Spec+ value at level', initial: 'Initial', max: 'Max' }

  // ไม่มีข้อมูล per-level → แสดงเต็ม range เดิม (ล็อกที่ max)
  // interactive=false → ล็อกตาม lockedLevel (มาจาก effectLevel ของ "Gear value at level" หลัก
  //   เช่น ตู้กาชา=0/Initial, picker preview/เกียร์ที่ใส่แล้ว=5/Max)
  const safeLockedLevel = Math.max(0, Math.min(5, lockedLevel))
  const lvl = !hasLevelData ? 5 : (interactive ? specLevel : safeLockedLevel)

  // ── ค่าที่ใช้แทน placeholder ในเทมเพลตคำอธิบาย (ที่ระดับ lvl ปัจจุบัน) ──
  //   %s → ค่า Basic Effect (มี % ในตัว), {$Np} → coef (มี % ในตัว), {$Nf} → ค่าวินาที (เลขล้วน)
  //   {$Nf} = "ตัวเลขวินาที" ของเอฟเฟกต์ — ปกติคือช่องเวลา แต่เอฟเฟกต์ที่ "ตัวค่าเป็นวินาที" เอง
  //   (เช่นลดเวลาสถานะ: สัมประสิทธิ์ 3.5秒~4.5秒 ส่วนเวลาเป็น "-") ต้องเอาจากสัมประสิทธิ์แทน
  //   ไม่งั้นคำอธิบายจะเหลือแค่ "...ที่ตนเองได้รับ วินาที" ไม่มีตัวเลข
  const te = special?.triggerEffect
  const coefIsSeconds = !!te && te.coef.includes('秒')
  const specValues = {
    percent: basic && basic[0] ? valueAtLevel(basic[0].value, basic[0].perLevel, lvl) : undefined,
    coefPercent: te ? valueAtLevel(te.coef, te.coefPerLevel, lvl) : undefined,
    time: te
      ? (coefIsSeconds ? numAtLevel(te.coef, te.coefPerLevel, lvl) : numAtLevel(te.time, te.timePerLevel, lvl))
      : undefined,
  }
  const descTemplates = lang === 'th' ? descTemplatesTh : descTemplatesEn

  return (
    <div className="mt-1">
      {/* ── Divider: ——— Spec+ ——— (สไตล์เดียวกับพรสวรรค์เรนเจอร์) ── */}
      <div className="flex items-center gap-3 mb-2.5">
        <div className="flex-1 h-px bg-purple-500/40"></div>
        <span className="text-purple-300 font-bold text-xs tracking-wider flex items-center gap-1">
          Spec+
          {hasLevelData && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={specLevelIcon(lvl)} alt="" className="h-5 object-contain ml-0.5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </span>
        <div className="flex-1 h-px bg-purple-500/40"></div>
      </div>

      {hasLevelData && interactive ? (
        /* ── Slider: ปรับระดับ Spec+ 0-5max (ค่าเปลี่ยนตามจริง) — gear-book เท่านั้น ── */
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-purple-200/70">{L.levelLabel}</span>
            <span className="text-purple-200 font-semibold font-mono">
              +{lvl}
              {lvl === 5 && ` (${L.max})`}
              {lvl === 0 && ` (${L.initial})`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={lvl}
            onChange={(e) => setSpecLevel(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-400"
          />
        </div>
      ) : hasLevelData ? (
        /* ── ไม่ interactive → ล็อกตาม lockedLevel ไม่มี slider ให้เลื่อน ── */
        <p className="text-[10px] text-purple-200/70 mb-2 text-center">
          {L.levelLabel}{' '}
          <span className="text-purple-200 font-semibold">
            +{lvl}
            {lvl === 5 && ` (${L.max})`}
            {lvl === 0 && ` (${L.initial})`}
          </span>
        </p>
      ) : (
        /* หมายเหตุ: ไม่มีข้อมูล per-level → ไม่ scale ตาม level */
        <p className="text-[10px] text-purple-200/60 mb-2 flex items-center justify-center gap-1">
          <span className="material-icons-round" style={{ fontSize: 12 }}>info</span>
          {L.note}
        </p>
      )}

      {/* ── ชื่อ Spec+ (ตัวใหญ่ สีม่วง) + คำอธิบาย (จาก lerico th/en:EQUIP) ── */}
      {showName && (
        <div className="text-left mb-2.5">
          <div className="text-purple-300 font-bold text-lg mb-1">{nameLoc}</div>
          {descTemplates && descTemplates.length > 0 && (
            <div className="space-y-0.5">
              {descTemplates.map((tpl, i) => (
                <p key={i} className="text-white text-sm leading-relaxed">
                  {renderSpecTemplate(tpl, specValues)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Basic Effect */}
      {basic && basic.length > 0 && (
        <div className="rounded-lg bg-black/20 border border-purple-400/20 overflow-hidden mb-2">
          <div className="grid grid-cols-2 text-sm">
            <div className="bg-purple-500/20 text-purple-200 px-3 py-1.5 font-semibold border-b border-white/10 text-xs">{L.effect}</div>
            <div className="bg-purple-500/20 text-purple-200 px-3 py-1.5 font-semibold border-b border-white/10 text-xs">{L.value}</div>
            {basic.map((b, i) => (
              <div key={i} className="contents">
                <div className={`px-3 py-1.5 text-purple-300 leading-snug ${i < basic.length - 1 ? 'border-b border-white/5' : ''}`}>{localizeStat(b.stat, b.statL)}</div>
                <div className={`px-3 py-1.5 text-white font-medium ${i < basic.length - 1 ? 'border-b border-white/5' : ''}`}>{valueAtLevel(b.value, b.perLevel, lvl)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special Effect */}
      {special && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-purple-300">{L.special}</div>

          {/* อัตราเกิด + เงื่อนไข */}
          <div className="rounded-lg bg-black/20 border border-purple-400/20 overflow-hidden">
            <div className="grid grid-cols-[90px_1fr] text-sm">
              <div className="bg-purple-500/20 text-purple-200 px-3 py-1.5 font-semibold border-b border-white/10 text-xs">{L.rate}</div>
              <div className="bg-purple-500/20 text-purple-200 px-3 py-1.5 font-semibold border-b border-white/10 text-xs">{L.cond}</div>
              <div className={`px-3 py-1.5 text-white ${special.condition2 ? 'row-span-2 flex items-center' : ''}`}>{special.triggerRate}</div>
              <div className={`px-3 py-1.5 text-gray-200 leading-snug ${special.condition2 ? 'border-b border-white/5' : ''}`}>{localize(special.condition, 'cond', special.conditionL)}</div>
              {special.condition2 && (
                <div className="px-3 py-1.5 text-gray-200 leading-snug">{localize(special.condition2, 'cond', special.condition2L)}</div>
              )}
            </div>
          </div>

          {/* เอฟเฟกต์ที่เกิด — stacked card (อ่านง่ายกว่าตาราง 4 คอลัมน์บนภาษาไทย) */}
          {special.triggerEffect && (
            <div className="rounded-lg bg-black/20 border border-purple-400/20 p-2.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm text-gray-100 leading-snug">{localize(special.triggerEffect.effect, 'buff', special.triggerEffect.effectL)}</span>
                <span className="text-xs font-bold text-purple-200 bg-purple-500/25 rounded px-1.5 py-0.5 shrink-0">{valueAtLevel(special.triggerEffect.triggerRate, special.triggerEffect.triggerRatePerLevel, lvl)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-purple-300">{L.coef}: <span className="text-white font-medium">{localizeTime(valueAtLevel(special.triggerEffect.coef, special.triggerEffect.coefPerLevel, lvl))}</span></span>
                <span className="text-purple-300">{L.time}: <span className="text-white font-medium">{localizeTime(valueAtLevel(special.triggerEffect.time, special.triggerEffect.timePerLevel, lvl))}</span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
