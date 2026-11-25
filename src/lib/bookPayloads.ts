// ====================================================
// Payload ของ /api/ranger-book และ /api/gear-book (รันตอน build — scripts/emit-data.ts)
// อ่านจาก .data/db/ranger-book.json + gear-book.json ที่ scripts/sync-rangers.ts สร้างจากข้อมูลเกม
// ====================================================

import { prisma } from '@/lib/db'
import { getGearEffectsAsync } from '@/lib/pvpScraper'

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

  // เสริม skillPlusNames + คีย์เอฟเฟกต์จากข้อมูลเกียร์ (ทีละก้อน 30 ชิ้น)
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
