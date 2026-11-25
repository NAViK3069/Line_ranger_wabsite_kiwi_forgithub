// ====================================================
// syncRangerBook — สร้าง Ranger Book + Gear Book จากข้อมูลเกมของเราเอง (src/lib/gameData.ts)
// เรียกโดย scripts/sync-rangers.ts (ขั้น "Sync Ranger Book + Gear Book" ใน Daily Data)
// ผลลัพธ์เขียนลง .data/db/ranger-book.json + gear-book.json (ผ่าน src/lib/db.ts)
// ====================================================

import { prisma } from '@/lib/db'
import { ensureRangerBundle, getAllRawRangers, getTier } from '@/lib/rangerData'
import { ensureGearData, getAllGearItems, getGearEffects } from '@/lib/pvpScraper'
import { cleanUnitName } from './unitName'
import { gameTable, gameText } from './gameData'

function extractSortOrder(unitCode: string): number {
  const m = unitCode.match(/^u(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

// ── เทียบของเดิมกับของใหม่ แล้วเขียนเฉพาะแถวที่เปลี่ยน ──
// แถวที่ไม่เปลี่ยนจะคง syncedAt เดิมไว้ (วันที่เกมไม่อัปเดต ไฟล์จึงไม่ขยับ)
interface DiffPlan<T> {
  create: T[]
  update: T[]
  remove: string[]
}

/** ลายเซ็นของแถว — ต่อค่าทุกคอลัมน์ที่สนใจด้วยตัวคั่นที่ไม่มีทางโผล่ในข้อมูลจริง */
function rowSig(row: Record<string, unknown>, fields: readonly string[]): string {
  return fields.map(f => String(row[f] ?? '')).join('\u0001')
}

function planDiff<T extends { id: string }>(
  next: T[],
  prev: Array<Record<string, unknown> & { id: string }>,
  fields: readonly string[],
): DiffPlan<T> {
  const prevSig = new Map(prev.map(r => [r.id, rowSig(r, fields)]))
  const plan: DiffPlan<T> = { create: [], update: [], remove: [] }

  for (const row of next) {
    const before = prevSig.get(row.id)
    if (before === undefined) plan.create.push(row)
    else if (before !== rowSig(row as unknown as Record<string, unknown>, fields)) plan.update.push(row)
    prevSig.delete(row.id)
  }
  // ที่เหลือใน map = แถวที่หายไปจากเกมแล้ว
  plan.remove = [...prevSig.keys()]
  return plan
}

const planSummary = (p: DiffPlan<unknown>) =>
  `+${p.create.length} ~${p.update.length} -${p.remove.length}`

async function updateRows<T extends { id: string }>(rows: T[], op: (row: T) => Promise<unknown>): Promise<void> {
  for (const row of rows) await op(row)
}

// คอลัมน์ที่ใช้ตัดสินว่า "แถวนี้เปลี่ยนไหม" — ไม่รวม syncedAt/updatedAt (ขยับทุกครั้ง และไม่มีหน้าไหนแสดง)
const GEAR_FIELDS = ['name', 'grade', 'slot', 'iconUrl', 'switchableType'] as const
const RANGER_FIELDS = ['name', 'grade', 'evolution', 'type', 'role', 'element', 'elementOpen', 'sortOrder'] as const

// ── Gear Book ───────────────────────────────────────
async function syncGearBook(): Promise<number> {
  // อ่านข้อมูลเกียร์จากข้อมูลเกมใหม่เสมอ (ไม่ใช้ของที่โหลดค้างไว้)
  await ensureGearData(true)

  const gearItems = getAllGearItems()
  if (gearItems.length === 0) {
    console.warn('[Sync] GearBook: no gear items found — skipping')
    return 0
  }

  // ช่องของเกียร์ที่ชื่อรหัสไม่บอกช่อง (รุ่นเก่า เช่น eq_2310_est_18) → equipType ของเกม
  const EQUIP_SLOT: Record<string, string> = { WEAPON: 'WPN', ARMOR: 'AMR', ACC: 'ACC' }
  const slotFromGame = new Map<string, string>()
  for (const e of gameTable<{ itemCode?: string; equipType?: string }>('game_item_equip')) {
    const slot = EQUIP_SLOT[e.equipType ?? '']
    if (e.itemCode && slot) slotFromGame.set(e.itemCode, slot)
  }

  const now = new Date()
  const records = gearItems.map(item => {
    const effects = getGearEffects(item.itemCode)
    return {
      id:             item.itemCode,
      name:           item.name,
      grade:          item.grade,
      slot:           item.slot ?? slotFromGame.get(item.itemCode) ?? null,
      iconUrl:        `https://rangers.lerico.net/res/gear_icon/${item.itemCode}_icon.png`,
      switchableType: effects?.switchable?.trigType ?? null,
      syncedAt:       now,
      updatedAt:      now,
    }
  })

  const prevGear = await prisma.gearBook.findMany({
    select: { id: true, name: true, grade: true, slot: true, iconUrl: true, switchableType: true },
  })
  const plan = planDiff(records, prevGear, GEAR_FIELDS)

  if (plan.remove.length) await prisma.gearBook.deleteMany({ where: { id: { in: plan.remove } } })
  if (plan.create.length) await prisma.gearBook.createMany({ data: plan.create })
  await updateRows(plan.update, row => prisma.gearBook.update({ where: { id: row.id }, data: row }))
  console.log(`[Sync] GearBook DB: ${planSummary(plan)} (จาก ${records.length} ชิ้น)`)
  return records.length
}

// ── Ranger Book ─────────────────────────────────────
export interface SyncResult {
  synced: number
  gears: number
  message: string
}

export async function performRangerSync(): Promise<SyncResult> {
  // 1. เรนเจอร์ทั้งหมดจากข้อมูลเกม
  await ensureRangerBundle()
  const rawRangers = getAllRawRangers()

  // 2. ชื่อ English จากไฟล์ภาษาของเกม
  const nameMap = new Map<string, string>()
  for (const [key, name] of Object.entries(gameText('en', 'UNIT'))) {
    if (typeof name === 'string') nameMap.set(key, cleanUnitName(name))
  }

  // 3. สร้างแถวของ Ranger Book
  const now = new Date()
  const ELEM_ALIAS: Record<string, string> = {
    tree: 'wood', nature: 'wood', earth: 'wood', plant: 'wood',
    holy: 'light',
    shadow: 'dark',
  }
  const records = rawRangers
    .filter(r => !!r.unitCode)
    .map(r => {
      const id = r.unitCode!
      const tier = getTier(r)
      const evolution = tier === 'hyper' ? 'hyper' : tier === 'ultra' ? 'ultra' : 'normal'
      const name = nameMap.get(`${id}_nm`) || nameMap.get(id) || id
      const rawElem = ((r.unitElement as string | null) ?? '').toLowerCase()
      const element = rawElem ? (ELEM_ALIAS[rawElem] ?? rawElem) : null
      const elementOpen = (r.elementOpen as string | null) ?? null
      return {
        id, name,
        grade: typeof r.grade === 'number' ? r.grade : null,
        evolution,
        type: (r.unitCategoryType as string | null) ?? null,
        role: ((r.unitType as string | null) || null),
        element,
        elementOpen,
        sortOrder: extractSortOrder(id),
        syncedAt: now,
        updatedAt: now,
      }
    })

  // 4. เขียน Ranger Book เฉพาะแถวที่ต่างจากของเดิม
  const prevRangers = await prisma.rangerBook.findMany({
    select: {
      id: true, name: true, grade: true, evolution: true,
      type: true, role: true, element: true, elementOpen: true, sortOrder: true,
    },
  })
  const plan = planDiff(records, prevRangers, RANGER_FIELDS)

  if (plan.remove.length) await prisma.rangerBook.deleteMany({ where: { id: { in: plan.remove } } })
  if (plan.create.length) await prisma.rangerBook.createMany({ data: plan.create })
  await updateRows(plan.update, row => prisma.rangerBook.update({ where: { id: row.id }, data: row }))
  const changed = plan.create.length + plan.update.length + plan.remove.length
  console.log(`[Sync] RangerBook DB: ${planSummary(plan)} (จาก ${records.length} ตัว)`)

  // 5. Gear Book — ต้องรอให้เสร็จก่อนคืนค่า
  //    (เดิมสั่งแบบไม่รอ สคริปต์จึงเขียนไฟล์แล้วปิดตัวไปก่อน Gear Book จะได้อัปเดต)
  const gears = await syncGearBook()

  return {
    synced: records.length,
    gears,
    message: `อัปเดตเรนเจอร์ ${records.length} ตัว (เขียนจริง ${changed} แถว) · เกียร์ ${gears} ชิ้น`,
  }
}
