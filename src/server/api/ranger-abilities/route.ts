// ====================================================
// API: GET /api/ranger-abilities
// รายชื่อ Ability ทั้งหมด + แผนที่ว่าเรนเจอร์ตัวไหนมี ability อะไรบ้าง
// ใช้กับตัวกรอง Ability ใน Ranger Book
//
// • ข้อมูลมาจาก bundle เดิม (getRangersBasics + /api/v2/abilities) ที่โหลดไว้อยู่แล้ว
//   ไม่ได้ยิง lerico เพิ่มเลยถ้ามีหน้าอื่นโหลด bundle ไปก่อนแล้ว
// • byRanger เก็บเป็น "เลข index" ของ ability ไม่ใช่ตัว code
//   เพราะ 3,000 เรนเจอร์ × โค้ดยาว ๆ ทำให้ payload บวมโดยไม่จำเป็น
// • Redis 7 วัน + browser/CDN 7 วัน — ข้อมูลเปลี่ยนแค่ตอนเกมอัปเดต
// ====================================================

import { NextResponse } from 'next/server'
import { redis, REDIS_TTL, redisKey } from '@/lib/redis'
import {
  ensureRangerBundle,
  getAllRawRangers,
  getRawAbility,
  translateAbility,
  abilityIconUrlFromRaw,
} from '@/lib/rangerData'

export const maxDuration = 60

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

export interface AbilityOption {
  code: string
  name: string
  /** โค้ดที่ชื่อนี้มาจาก — ฝั่ง client เอาไปหา `${nameCode}_nm` ในตารางแปลไทย
   *  ไม่ใช่ code เสมอไป เช่น ab998_barrier_labi1 ยืมชื่อของ ab229_st_shield2 */
  nameCode: string
  icon: string
  /** จำนวนเรนเจอร์ที่มี ability นี้ — เอาไว้เรียงและโชว์ในป๊อปอัพ */
  count: number
  /** ability กลุ่ม (ab701_team*) — เอาไว้ดันลงล่างสุดของลิสต์
   *  ต้องเช็คจากโค้ด ไม่ใช่จากคำว่า "Group:" ในชื่อ เพราะภาษาไทยขึ้นต้นว่า "[กลุ่ม]" */
  group?: true
  /** Awakening ability (aab*) — ของเฉพาะเรนเจอร์ 9★ ขึ้นไป */
  awaken?: true
}

export interface RangerAbilitiesPayload {
  abilities: AbilityOption[]
  /** unitCode → index ของ ability ใน abilities[] */
  byRanger: Record<string, number[]>
}

const EMPTY: RangerAbilitiesPayload = { abilities: [], byRanger: {} }

const GROUP_PREFIX = 'ab701_team'

// Awakening ability อยู่คนละที่ — lerico ไม่มี ต้องเอาจาก warmycat
// ไฟล์นี้ 8MB แต่ยิงแค่ตอน Redis หมดอายุ (7 วัน) และ route awakening ก็ดึงไฟล์เดียวกันนี้อยู่แล้ว
const WARMYCAT_RANGERS = 'https://rangerbook.warmycat.com/res/Rangers_data.json'

interface AwakenEntry { abilityCode?: string; icon?: string }

/** โค้ดว่างมาได้หลายหน้าตา ('', '0', 'none') — กันไว้ให้หมด */
function usableCode(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.trim()
  if (!c || c === '0' || c.toLowerCase() === 'none') return null
  return c
}

/** ชื่อที่จะโชว์ของ ability หนึ่งตัว — ไม่มีชื่อแปลคืน ''
 *
 *  ⚠ ลำดับสำคัญมาก: ต้องเอา `${code}_nm` (ชื่อของตัวเอง) มาก่อน nameCode เสมอ
 *  เพราะ ability กลุ่มใหม่ ๆ ตั้ง nameCode ชี้ไปที่ชื่อของกลุ่มเก่า:
 *    ab701_team_2502 → nameCode = ab701_team_2410_nm ("Group: Chained Soldier")
 *  ทั้งที่ ab701_team_2502_nm มีอยู่จริงและคือ "Group: Delicious in Dungeon"
 *  ถ้าเชื่อ nameCode ก่อน จะได้ชื่อผิดแล้วสองกลุ่มไปยุบรวมกัน (โดนมาแล้ว 3 คู่:
 *  Delicious in Dungeon / Attack on Titan2 / GACHIAKUTA)
 *  nameCode ยังจำเป็นอยู่สำหรับโค้ดที่ไม่มีชื่อของตัวเองจริง ๆ เช่น ab998_barrier_labi1–6
 */
/** ชื่อที่จะโชว์ + โค้ดที่ชื่อนั้นมาจาก (ใช้เป็นคีย์แปลไทย) — ไม่มีชื่อคืน null */
function resolveName(code: string): { name: string; nameCode: string } | null {
  const raw = getRawAbility(code)
  const borrowed = typeof raw?.nameCode === 'string' ? raw.nameCode : ''
  const own = translateAbility(`${code}_nm`)
  if (own) return { name: own, nameCode: code }
  // borrowed มาในรูป "<code>_nm" — ตัดหางออกให้เหลือโค้ด เพื่อให้ฝั่ง client ต่อ _nm เองได้
  if (borrowed && translateAbility(borrowed)) {
    return { name: translateAbility(borrowed), nameCode: borrowed.replace(/_nm$/, '') }
  }
  const bare = translateAbility(code)
  return bare ? { name: bare, nameCode: code } : null
}

/** ตัวสะสมผลลัพธ์ — ใช้ร่วมกันทั้ง ability ปกติและ awakening */
class Index {
  private seen = new Map<string, number>()
  readonly options: AbilityOption[] = []
  readonly byRanger: Record<string, number[]> = {}

  /** คืน index ของช่องที่ ability นี้อยู่ สร้างใหม่ถ้ายังไม่มี
   *  key ต้องมี kind นำหน้า — awakening 16 ตัวใช้ชื่อซ้ำกับ ability ปกติเป๊ะ ๆ
   *  (Last Attack / Revive / Skill Barrier …) ถ้าไม่แยกจะยุบรวมกันเป็นตัวเลือกเดียว */
  slot(key: string, make: () => AbilityOption): number {
    let i = this.seen.get(key)
    if (i === undefined) {
      i = this.options.length
      this.seen.set(key, i)
      this.options.push(make())
    }
    return i
  }

  add(unitCode: string, idx: number): void {
    const list = this.byRanger[unitCode] ??= []
    // เรนเจอร์บางตัวใส่ ability ซ้ำสองช่อง (หรือคนละโค้ดแต่ชื่อเดียวกัน) — นับครั้งเดียว
    if (list.includes(idx)) return
    list.push(idx)
    this.options[idx].count++
  }
}

/** ability ปกติ 3 ช่องของเรนเจอร์แต่ละตัว (จาก bundle ของ lerico) */
function addNormal(ix: Index): void {
  for (const raw of getAllRawRangers()) {
    const unitCode = raw.unitCode
    if (!unitCode) continue
    for (const v of [raw.abilityCode, raw.abilityCode2, raw.abilityCode3]) {
      const code = usableCode(v)
      if (!code) continue
      // ไม่มีชื่อจริง = โชว์เป็นโค้ดดิบในป๊อปอัพ ซึ่งผู้เล่นอ่านไม่รู้เรื่อง ข้ามไป
      const n = resolveName(code)
      if (!n) continue
      // จัดกลุ่มตามชื่อ ไม่ใช่ตามโค้ด — Super Shield+ มี 6 โค้ด ถ้าแยกจะได้ตัวเลือกซ้ำ 6 อัน
      const idx = ix.slot(`n:${n.name}`, () => ({
        code, name: n.name, nameCode: n.nameCode,
        icon: abilityIconUrlFromRaw(getRawAbility(code), code),
        count: 0,
        ...(code.startsWith(GROUP_PREFIX) ? { group: true as const } : {}),
      }))
      ix.add(unitCode, idx)
    }
  }
}

/** Awakening ability (9★+) — โครงสร้าง: [{ ranger_id, 覺醒能力: [{ abilityCode, icon }] }] */
async function addAwakening(ix: Index): Promise<number> {
  const res = await fetch(WARMYCAT_RANGERS, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: REDIS_TTL.rangerAbilities },
  })
  if (!res.ok) throw new Error(`warmycat ${res.status}`)
  const rangers = await res.json() as Array<Record<string, unknown>>

  let added = 0
  for (const r of rangers) {
    const unitCode = typeof r['ranger_id'] === 'string' ? r['ranger_id'] : ''
    const list = r['覺醒能力']
    // เรนเจอร์ที่ไม่มี awakening ฟิลด์นี้เป็น string ไม่ใช่ array — เช็คให้ครบก่อนวน
    if (!unitCode || !Array.isArray(list)) continue

    for (const a of list as AwakenEntry[]) {
      const code = a && typeof a === 'object' ? usableCode(a.abilityCode) : null
      if (!code || !code.startsWith('aab')) continue
      const n = resolveName(code)
      if (!n) continue
      const idx = ix.slot(`a:${n.name}`, () => ({
        code, name: n.name, nameCode: n.nameCode,
        // warmycat บอกชื่อไฟล์ไอคอนมาตรง ๆ ส่วน lerico ไม่รู้จักโค้ด aab*
        icon: `https://rangers.lerico.net/res/ability_icon/${a.icon || `${code.slice(1)}_icon.png`}`,
        count: 0,
        awaken: true as const,
      }))
      ix.add(unitCode, idx)
      added++
    }
  }
  return added
}

export async function GET() {
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey.rangerAbilities())
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data, { headers: CACHE_HEADERS })
      }
    } catch { /* Redis ล่ม → คิดใหม่ */ }
  }

  try {
    await ensureRangerBundle()
    const ix = new Index()
    addNormal(ix)
    // warmycat ล่มไม่ควรทำให้ตัวกรองทั้งอันใช้ไม่ได้ — ขาดแค่ awakening ก็ยังกรองอย่างอื่นได้
    // แต่ห้าม cache ผลที่ขาดไปไว้ 7 วัน ไม่งั้นจะหายยาว
    let awakenOk = true
    try {
      await addAwakening(ix)
    } catch (err) {
      awakenOk = false
      console.error('[ranger-abilities] awakening skipped:', err)
    }
    const payload: RangerAbilitiesPayload = { abilities: ix.options, byRanger: ix.byRanger }
    // bundle โหลดไม่สำเร็จ (lerico ล่ม) → อย่าเพิ่ง cache ของว่างไว้ 7 วัน
    if (payload.abilities.length === 0) {
      return NextResponse.json(EMPTY, { status: 503 })
    }
    if (!awakenOk) return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
    if (redis) {
      redis.set(redisKey.rangerAbilities(), JSON.stringify(payload), {
        ex: REDIS_TTL.rangerAbilities,
      }).catch(() => {})
    }
    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[ranger-abilities] build failed:', err)
    // ตัวกรองจะไม่ขึ้นให้เลือก แต่หน้า Ranger Book ยังใช้ได้ตามปกติ
    return NextResponse.json(EMPTY, { status: 503 })
  }
}
