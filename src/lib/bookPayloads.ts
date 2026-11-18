// ====================================================
// Payload ของ /api/ranger-book และ /api/gear-book
//
// แยกออกมาจาก route เพื่อให้ "ตอน sync" สร้าง payload ชุดเดียวกันได้
// เหตุผลเรื่องทรัพยากร: เดิม sync แค่ลบคีย์ Redis ทิ้ง → คนแรกที่เปิดหน้าหลังจากนั้น
// ต้องไปอ่าน Neon (ranger_book 3,081 แถว / gear_book ~861 แถว) = ปลุก compute อีก 5 นาที
// ทั้งที่ตอน sync compute ตื่นอยู่แล้ว อ่านตอนนั้นทีเดียวแล้วเขียนแคชไว้เลยจึงถูกกว่า
// ผลคือเส้นทางสาธารณะสองเส้นนี้ไม่แตะ Neon อีกเลยในการใช้งานปกติ
// ====================================================

import { prisma } from '@/lib/db'
import { getGearEffectsAsync } from '@/lib/pvpScraper'

// ⚠ คีย์ของ gear book ต้องใช้ตัวนี้ทุกที่ — เดิม route ใช้ 'lr:gear:book:all:v2'
// แต่ sync ไปลบ 'lr:gear:book:all' (ไม่มี v2) แคชจึงไม่เคยถูกล้างจริงเลยหลัง sync
// v3: เพิ่ม fx (คีย์เอฟเฟกต์ต่อชิ้น) + fxNames สำหรับตัวกรองค่าเกียร์
export const GEAR_BOOK_CACHE_KEY = 'lr:gear:book:all:v3'

function extractGearNumber(id: string): number {
  const m = id.match(/^eq_(\d+)_/)
  return m ? parseInt(m[1], 10) : 0
}

// แยก itemCode จาก iconUrl (เช่น /gear_icon/eq_123_weapon_icon.png → eq_123_weapon)
function itemCodeFromIconUrl(iconUrl: string): string | null {
  const m = iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)
  return m ? m[1] : null
}

export async function buildRangerBookPayload() {
  const rangers = await prisma.rangerBook.findMany({ orderBy: { sortOrder: 'desc' } })
  return { rangers, total: rangers.length }
}

export async function buildGearBookPayload() {
  const rawItems = await prisma.gearBook.findMany()
  rawItems.sort((a, b) => extractGearNumber(b.id) - extractGearNumber(a.id))

  // เสริม skillPlusNames จาก pvpScraper (batch เป็นก้อนละ 30 — ไม่ยิง Redis GET
  // ทีเดียว ~861 ครั้งพร้อมกันตอน cache miss ซึ่งเสี่ยงชน rate limit + ค่าใช้จ่าย Upstash)
  const BATCH = 30
  // fx = คีย์เอฟเฟกต์ของแต่ละชิ้น (b = พื้นฐาน, w = สลับ, s = Skill+) ใช้กรองฝั่ง client
  // คีย์คือ nameKey ของ EQUIP (แปลชื่อตามภาษาได้) — ไม่มีก็ใช้ "~ชื่อ" แทน; ชื่อดิบเก็บรวมไว้ใน fxNames ชุดเดียว
  type Fx = { b: string[]; w: string[]; s: string[] }
  const fxNames: Record<string, string> = {}
  const keyOf = (e: { name: string; nameKey?: string }) => {
    const k = e.nameKey || `~${e.name}`
    fxNames[k] ??= e.name
    return k
  }
  const uniq = (a: string[]) => [...new Set(a)]
  const items: (typeof rawItems[number] & { skillPlusNames: string[]; fx?: Fx })[] = []
  for (let i = 0; i < rawItems.length; i += BATCH) {
    const chunk = rawItems.slice(i, i + BATCH)
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const itemCode = itemCodeFromIconUrl(item.iconUrl)
        let skillPlusNames: string[] = []
        let fx: Fx | undefined
        if (itemCode) {
          try {
            const effects = await getGearEffectsAsync(itemCode)
            skillPlusNames = effects?.skillPlus.map(sp => sp.name) ?? []
            if (effects) fx = {
              b: uniq(effects.basic.map(keyOf)),
              w: uniq((effects.switchable?.allEffects ?? []).map(o => keyOf(o.effect))),
              s: uniq(effects.skillPlus.map(keyOf)),
            }
          } catch { /* ไม่มีข้อมูล → ปล่อยว่าง */ }
        }
        return { ...item, skillPlusNames, ...(fx ? { fx } : {}) }
      })
    )
    items.push(...chunkResults)
  }

  return { items, total: items.length, fxNames }
}
