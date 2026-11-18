// ====================================================
// API: GET /api/ranger-skill-effects?lang=th|en
// รายการ "ความสามารถของสกิล" (ไม่สนตัวเลข) + แผนที่ว่าเรนเจอร์ตัวไหนมีอะไรบ้าง
// ใช้กับตัวกรอง Skill ใน Ranger Book
//
// • ดึงจากบรรทัด "* ..." ในคำอธิบายสกิล เช่น "* เพิ่มพลังชีวิต 300% (7 วินาที)"
//   แล้วตัดตัวเลข/เวลาทิ้ง → "เพิ่มพลังชีวิต" สกิลที่ค่าต่างกันจึงรวมเป็นตัวเลือกเดียว
// • แยกตามภาษา เพราะข้อความไทย/อังกฤษไม่ได้เรียงบรรทัดตรงกันเสมอ
// • byRanger เก็บเป็นเลข index (เหตุผลเดียวกับ /api/ranger-abilities)
// • Redis 7 วัน + browser/CDN 7 วัน — ยิง lerico แค่ตอน Redis หมดอายุ
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis, REDIS_TTL } from '@/lib/redis'
import { ensureRangerBundle, getAllRawRangers, getRawSkill, skillIconUrlFromRaw } from '@/lib/rangerData'
import type { RangerAbilitiesPayload } from '@/server/api/ranger-abilities/route'

export const maxDuration = 60

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

const LANGS = ['en', 'th'] as const
type Lang = typeof LANGS[number]

// ⚠ แก้วิธีแตก/ตัดข้อความเมื่อไหร่ต้องบวกเลขนี้ (และ SKILL_FX_RULES_VERSION ฝั่งหน้า Ranger Book)
const cacheKey = (lang: Lang) => `lr:ranger:skillfx:${lang}:v5`

/** atk = สกิลโจมตี (เล็งศัตรู), buff = สกิลบัฟ/ช่วยเหลือ (targetType = SELF) */
export type SkillFxKind = 'atk' | 'buff'
export type SkillFxOption = RangerAbilitiesPayload['abilities'][number] & { kind: SkillFxKind }
export interface SkillFxPayload { abilities: SkillFxOption[]; byRanger: Record<string, number[]> }

const EMPTY: SkillFxPayload = { abilities: [], byRanger: {} }

/** สกิลที่ร่ายใส่ตัวเอง/พรรคพวก = บัฟ, ที่เล็งหาเป้าหมาย (SEARCH / RSEARCH) = โจมตี */
function skillKind(code: string): SkillFxKind {
  return getRawSkill(code)?.targetType === 'SELF' ? 'buff' : 'atk'
}

/** ตัดตัวเลขทั้งหมดออกจากหนึ่งบรรทัดเอฟเฟกต์ — เหลือแค่ "ทำอะไร" */
function effectKey(line: string): string {
  return line
    // วงเล็บที่มีตัวเลข = เวลา/จำนวนครั้ง เช่น (7 วินาที) (ต่อ 1 วินาที) (12 sec) → ทิ้งทั้งก้อน
    .replace(/[(（][^()（）]*\d[^()（）]*[)）]/g, ' ')
    // วงเล็บเปิดค้าง (ข้อความถูกตัดกลางคัน) → ทิ้งตั้งแต่ตรงนั้น
    .replace(/[(（][^()（）]*$/, ' ')
    // ตัวคูณหน้าเลข: "ATK ×200%" / "พลังโจมตี x 450%"
    .replace(/(^|\s)[×x]\s*(?=\d)/gi, ' ')
    // ตัวเลข + หน่วยที่ติดมา
    .replace(/[+-]?\d[\d.,]*\s*(%|วินาที|วิ|sec(?:onds?)?\b|หน่วย|ครั้ง|ตัว|times?\b|units?\b)?/gi, ' ')
    // เศษที่ค้างหลังตัดเลข: % ลอย ๆ / วงเล็บปิดเกิน
    .replace(/(^|\s)%(?=\s|$)/g, ' ')
    .replace(/^([^(（]*)[)）]/, '$1 ')
    .replace(/^[\s\-–:：,.;]+|[\s\-–:：,.;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** บรรทัดเอฟเฟกต์ในคำอธิบาย — บรรทัดที่ขึ้นต้นด้วย * หรือ • (และบรรทัดต่อท้ายที่ย่อหน้าไว้) */
function effectLines(desc: string): string[] {
  const out: string[] = []
  let inBullet = false
  for (const line of desc.split(/\\n|\r?\n/)) {
    const m = line.match(/^\s*[*•]\s*(.+)/)
    if (m) { out.push(m[1]); inBullet = true; continue }
    // "* Enemy Move Speed 80% Down,\n  Attack Speed 80% Down (8 sec)" — บรรทัดที่สองย่อหน้าไว้ใต้ bullet
    if (inBullet && /^\s+\S/.test(line)) { out.push(line); continue }
    inBullet = false
  }
  return out
}

async function fetchSkillTexts(lang: Lang): Promise<Record<string, string>> {
  const res = await fetch(`https://rangers.lerico.net/api/v2/translate?keys=${lang}:SKILL`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`lerico ${res.status}`)
  const raw = await res.json() as Record<string, unknown>
  return (raw[`${lang}:SKILL`] ?? raw) as Record<string, string>
}

async function build(lang: Lang): Promise<SkillFxPayload> {
  const [, texts] = await Promise.all([ensureRangerBundle(), fetchSkillTexts(lang)])
  const seen = new Map<string, number>()
  const options: SkillFxOption[] = []
  const byRanger: Record<string, number[]> = {}
  // ต่อเอฟเฟกต์: นับว่ามาจากสกิลโจมตี/บัฟกี่ครั้ง (ตัดสินหมวดด้วยเสียงข้างมาก)
  // และไอคอนสกิลไหนเจอบ่อยสุด (ใช้เป็นรูปตัวอย่าง)
  const kindVotes: { atk: number; buff: number }[] = []
  const iconVotes: Map<string, number>[] = []

  for (const r of getAllRawRangers()) {
    const unitCode = r.unitCode
    if (!unitCode) continue
    const mine = new Set<number>()
    for (const code of [r.skillCode, r.skillCode2, r.skillCode3, r.passiveSkillCode]) {
      if (!code) continue
      const desc = texts[`${code}_desc`]
      if (typeof desc !== 'string') continue
      const kind = skillKind(code)
      const icon = skillIconUrlFromRaw(getRawSkill(code), code)
      // บางสกิลอัดสองเอฟเฟกต์ไว้บรรทัดเดียว ("... * ..." / "... &...") → แยกออกก่อน
      for (const line of effectLines(desc).flatMap(l => l.split(/\s*\*\s*|\s*&\s*/))) {
        const name = effectKey(line)
        if (name.length < 2) continue
        let i = seen.get(name)
        if (i === undefined) {
          i = options.length
          seen.set(name, i)
          options.push({ code: `fx${i}`, name, nameCode: '', icon, count: 0, kind })
          kindVotes.push({ atk: 0, buff: 0 })
          iconVotes.push(new Map())
        }
        kindVotes[i][kind]++
        iconVotes[i].set(icon, (iconVotes[i].get(icon) ?? 0) + 1)
        mine.add(i)
      }
    }
    if (mine.size) {
      byRanger[unitCode] = [...mine]
      for (const i of mine) options[i].count++
    }
  }
  options.forEach((o, i) => {
    o.kind = kindVotes[i].buff > kindVotes[i].atk ? 'buff' : 'atk'
    let best = 0
    for (const [url, n] of iconVotes[i]) if (n > best) { best = n; o.icon = url }
  })
  return { abilities: options, byRanger }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('lang')
  const lang: Lang = (LANGS as readonly string[]).includes(q ?? '') ? q as Lang : 'en'

  if (redis) {
    try {
      const cached = await redis.get<string>(cacheKey(lang))
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data, { headers: CACHE_HEADERS })
      }
    } catch { /* Redis ล่ม → คิดใหม่ */ }
  }

  try {
    const payload = await build(lang)
    // lerico ล่ม → อย่า cache ของว่างไว้ 7 วัน
    if (payload.abilities.length === 0) return NextResponse.json(EMPTY, { status: 503 })
    if (redis) {
      redis.set(cacheKey(lang), JSON.stringify(payload), { ex: REDIS_TTL.rangerAbilities }).catch(() => {})
    }
    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[ranger-skill-effects] build failed:', err)
    return NextResponse.json(EMPTY, { status: 503 })
  }
}
