// ====================================================
// syncRangerBook — core sync logic
// ใช้ร่วมกันระหว่าง:
//   • POST /api/admin/ranger-book/sync  (admin กดเอง)
//   • GET  /api/cron/ranger-sync        (Vercel Cron รายวัน)
// ====================================================

import { prisma } from '@/lib/db'
import { ensureRangerBundle, getAllRawRangers, getTier, type RawRanger } from '@/lib/rangerData'
import { buildRangerStatsResponse } from '@/lib/buildRangerStats'
import { ensureGearData, getAllGearItems, getGearEffects } from '@/lib/pvpScraper'
import { buildRangerBookPayload, buildGearBookPayload, GEAR_BOOK_CACHE_KEY } from '@/lib/bookPayloads'
import { redis, redisKey, REDIS_TTL } from './redis'
import { cleanUnitName } from './unitName'
import { gameText } from './gameData'

function extractSortOrder(unitCode: string): number {
  const m = unitCode.match(/^u(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

// ── เทียบของเดิมกับของใหม่ แล้วบอกว่าต้องเขียนอะไรบ้าง ──
// เดิมใช้ deleteMany + createMany ซึ่งเขียนใหม่ทุกแถวทุกวัน (ranger ~3,000 + gear ~500)
// ทั้งที่ข้อมูลเกมแทบไม่ขยับเลยระหว่าง patch → WAL ของ Neon บวมฟรีทุกคืน
// ตอนนี้เขียนเฉพาะแถวที่ค่าต่างจริง วันที่เกมไม่อัพเดตจะไม่มี write เลยสักแถว
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

/** ส่ง update เป็นก้อนผ่าน $transaction แทนการ await ทีละแถว
 *  วันที่เกมออก patch ใหญ่ ชื่อเรนเจอร์เปลี่ยนเป็นพันแถว การ await ทีละตัวคือรอ
 *  round-trip ไป Neon พันครั้งเรียงกัน = compute ตื่นทำงานอยู่นานเท่านั้น
 *  ก้อนละ 50 ส่งครั้งเดียวจบ ลดเวลาที่ compute ต้องตื่นลงเป็นสิบเท่า
 *  (connection_limit=1 → ยิงขนานไม่ช่วย เพราะคิวอยู่ที่ connection เดียวอยู่แล้ว) */
async function batchUpdate<T extends { id: string }>(
  rows: T[],
  op: (row: T) => Promise<unknown>,
): Promise<void> {
  const BATCH = 50
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.$transaction(rows.slice(i, i + BATCH).map(op))
  }
}

// ── Pipeline helper — เขียน entries ลง Redis เป็น batch ──
async function pipelineSave(
  entries: Array<{ key: string; value: string }>,
  ttl: number,
  label: string,
): Promise<void> {
  if (!redis || entries.length === 0) return
  const BATCH = 150
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    try {
      const pipe = redis.pipeline()
      for (const { key, value } of batch) pipe.set(key, value, { ex: ttl })
      await pipe.exec()
    } catch (e) {
      console.error(`[Sync] ${label} pipeline failed at batch ${i}:`, e)
    }
  }
  console.log(`[Sync] ${label}: cached ${entries.length} entries → Redis (TTL ${ttl}s)`)
}

// ── Pre-cache Ranger Stats ──────────────────────────
async function precacheRangerStats(rawRangers: RawRanger[]): Promise<void> {
  if (!redis) return
  const entries: Array<{ key: string; value: string }> = []
  for (const r of rawRangers) {
    if (!r.unitCode) continue
    try {
      entries.push({
        key: redisKey.rangerStats(r.unitCode),
        value: JSON.stringify(await buildRangerStatsResponse(r, r.unitCode)),
      })
    } catch (e) {
      console.warn(`[Sync] buildStats failed for ${r.unitCode}:`, e)
    }
  }
  await pipelineSave(entries, REDIS_TTL.rangerStats, 'Ranger Stats')
}

// คอลัมน์ที่ใช้ตัดสินว่า "แถวนี้เปลี่ยนไหม" — ไม่รวม syncedAt/updatedAt เพราะสองตัวนั้น
// ขยับทุกครั้งอยู่แล้วและไม่มีหน้าไหนเอาไปแสดง (ตรวจแล้ว มีแค่ใน type ไม่ได้ render)
const GEAR_FIELDS = ['name', 'grade', 'slot', 'iconUrl', 'switchableType'] as const
const RANGER_FIELDS = ['name', 'grade', 'evolution', 'type', 'role', 'element', 'elementOpen', 'sortOrder'] as const

// ── Sync Gear Book (DB + Redis) ─────────────────────
async function syncGearBook(): Promise<void> {
  // โหลด gear data จาก lerico.net แบบ force — ข้าม cache เก่า (in-memory + Redis lr:translations)
  // เพื่อให้ได้ gear ใหม่ล่าสุด (ไม่งั้นจะติด cache 7 วัน → gear ใหม่ไม่ขึ้น)
  await ensureGearData(true)

  const gearItems = getAllGearItems()
  if (gearItems.length === 0) {
    console.warn('[Sync] GearBook: no gear items found — skipping')
    return
  }

  // ── A. Upsert GearBook DB ──
  const now = new Date()

  // สำหรับ item ที่ slot = null (รูปแบบชื่อเก่า เช่น eq_2310_est_18)
  // ลอง lookup จาก Redis ที่ populate ไว้ตอน pvp scraping
  const nullSlotItems = gearItems.filter(i => !i.slot)
  const redisSlotMap = new Map<string, string>()
  const r = redis  // capture ก่อนเข้า async callback เพื่อแก้ TypeScript null-check
  if (r && nullSlotItems.length > 0) {
    await Promise.all(nullSlotItems.map(async (item) => {
      const cached = await r.get<string>(redisKey.itemSlot(item.itemCode))
      if (cached) redisSlotMap.set(item.itemCode, cached)
    }))
  }

  const records = gearItems.map(item => {
    const effects = getGearEffects(item.itemCode)
    const switchableType = effects?.switchable?.trigType ?? null
    return {
      id:             item.itemCode,
      name:           item.name,
      grade:          item.grade,
      slot:           item.slot ?? redisSlotMap.get(item.itemCode) ?? null,
      iconUrl:        `https://rangers.lerico.net/res/gear_icon/${item.itemCode}_icon.png`,
      switchableType,
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
  await batchUpdate(plan.update, row => prisma.gearBook.update({ where: { id: row.id }, data: row }))
  console.log(`[Sync] GearBook DB: ${planSummary(plan)} (จาก ${records.length} ชิ้น)`)
  // หมายเหตุ: ไม่ pre-cache GearEffects ใน Redis — ใช้ lazy cache เมื่อ user request แทน
  // (ลด ~500 Redis writes ต่อ sync)
}

// ── Main sync function ──────────────────────────────
export interface SyncResult {
  synced: number
  cached: string
  message: string
}

export async function performRangerSync(): Promise<SyncResult> {
  // 1. โหลด ranger bundle
  await ensureRangerBundle()
  const rawRangers = getAllRawRangers()

  // 2. ชื่อ English จากไฟล์ภาษาของเกม
  const nameMap = new Map<string, string>()
  for (const [key, name] of Object.entries(gameText('en', 'UNIT'))) {
    if (typeof name === 'string') nameMap.set(key, cleanUnitName(name))
  }

  // 3. Build ranger records
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

  // 4. เขียน RangerBook เฉพาะแถวที่ต่างจากของเดิม
  const prevRangers = await prisma.rangerBook.findMany({
    select: {
      id: true, name: true, grade: true, evolution: true,
      type: true, role: true, element: true, elementOpen: true, sortOrder: true,
    },
  })
  const plan = planDiff(records, prevRangers, RANGER_FIELDS)

  if (plan.remove.length) await prisma.rangerBook.deleteMany({ where: { id: { in: plan.remove } } })
  if (plan.create.length) await prisma.rangerBook.createMany({ data: plan.create })
  await batchUpdate(plan.update, row => prisma.rangerBook.update({ where: { id: row.id }, data: row }))
  const changed = plan.create.length + plan.update.length + plan.remove.length
  console.log(`[Sync] RangerBook DB: ${planSummary(plan)} (จาก ${records.length} ตัว)`)

  // 5. Invalidate cache ที่ DB อัพเดตเสร็จแล้ว (RangerBook DB เสร็จใน step 4)
  //    + translation cache (th/en) → ranger ใหม่ได้ชื่อไทยจาก lerico ทันที
  //    + talent primed flag → ranger ใหม่ได้ talent จาก warmycat ทันที
  //      (ลบแค่ primed flag พอ — request ถัดไปจะ re-populate ทั้งหมดจาก warmycat สด
  //       per-ranger key เก่าจะถูก overwrite ตอน populate, ไม่ต้องลบทีละตัว)
  //    ⚠️ ห้ามลบ gearBookAll ตรงนี้ — เพราะ gear DB ยังไม่อัพเดต (syncGearBook อยู่ step 6)
  //       ถ้าลบก่อน แล้วมีคนเปิด /gear-book → cache จะถูก rebuild ด้วย gear DB เก่า → ค้าง
  // ไม่มีแถวไหนขยับ = ของใน cache ยังตรงอยู่ ไม่ต้องล้างให้ต้องไปดึงใหม่ทั้งก้อน
  // (ล้าง translations ทีนึงแปลว่าคนถัดไปต้องรอโหลด bundle 3MB จาก lerico ใหม่)
  if (redis && changed > 0) {
    const r = redis   // capture ก่อนเข้า async callback เพื่อแก้ TypeScript null-check
    await Promise.allSettled([
      // เขียนทับด้วยของใหม่เลย ไม่ใช่ลบทิ้ง — ตอนนี้ compute ตื่นอยู่แล้วเพราะเพิ่งเขียน DB เสร็จ
      // ถ้าลบทิ้ง คนแรกที่เปิดหน้าหลังจากนี้จะต้องอ่าน ranger_book ทั้งตารางจาก Neon
      // = ปลุก compute อีกรอบ 5 นาที ทั้งที่อ่านตอนนี้ทีเดียวก็ได้ของชุดเดียวกัน
      buildRangerBookPayload()
        .then(p => r.set(redisKey.rangerBookAll(), JSON.stringify(p), { ex: REDIS_TTL.rangerBookAll }))
        .catch(e => { console.error('[Sync] warm rangerBookAll failed:', e); return r.del(redisKey.rangerBookAll()) }),
      redis.del('lr:translations:th'),
      redis.del('lr:translations:en'),
      // คนละคีย์กับสองอันบน — อันนี้เป็นคำแปลที่ตัว scraper ใช้ตอนฝังชื่อลงตารางอันดับ
      // ไม่ล้างด้วย ชื่อเรนเจอร์ใหม่จะยังเป็นรหัสดิบในหน้าเมต้า ทั้งที่ ranger book ถูกแล้ว
      redis.del(redisKey.translations()),
    ])
    console.log('[Sync] Warmed rangerBookAll + invalidated translation cache (th/en/scraper)')
  } else if (redis) {
    console.log('[Sync] ไม่มีเรนเจอร์เปลี่ยน — ข้ามการล้าง cache')
  }

  // 6. Fire-and-forget background tasks (ไม่ block response)
  // precacheRangerStats: push stats ทุก ranger เข้า Redis ระหว่าง sync
  // → cold start ถัดไป user request ใด ๆ จะ hit Redis แทน ไม่ต้องโหลด bundle 7 API จาก lerico.net
  Promise.allSettled([
    // syncGearBook เสร็จ → ค่อยลบ gearBookAll cache (ตอนนี้ gear DB ใหม่แล้ว)
    syncGearBook().then(async () => {
      if (redis) {
        const r = redis   // capture ก่อนเข้า async callback เพื่อแก้ TypeScript null-check
        await Promise.allSettled([
          // เขียนทับด้วยของใหม่ด้วยเหตุผลเดียวกับ rangerBookAll (ประหยัดการปลุก compute)
          // ⚠ ต้องใช้ GEAR_BOOK_CACHE_KEY — เดิมลบ redisKey.gearBookAll() ซึ่งเป็นคีย์ v1
          //   ที่ไม่มีใครอ่านแล้ว แคชจริง (v2) จึงค้างข้ามการ sync ไปได้นานถึง 7 วัน
          buildGearBookPayload()
            .then(p => r.set(GEAR_BOOK_CACHE_KEY, JSON.stringify(p), { ex: REDIS_TTL.gearBookAll }))
            .catch(e => { console.error('[Sync] warm gearBook failed:', e); return r.del(GEAR_BOOK_CACHE_KEY) }),
        ])
        console.log('[Sync] Warmed gearBook cache (หลัง gear DB อัพเดตเสร็จ)')
      }
    }),
    precacheRangerStats(rawRangers),
  ]).then(results => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[Sync] background task ${i} failed:`, r.reason)
    })
  })

  return {
    synced: records.length,
    cached: redis
      ? `กำลัง cache Ranger Stats + Gear Book ลง Redis ใน background...`
      : 'ไม่มี Redis (ข้าม)',
    message: `อัพเดตเรนเจอร์สำเร็จ ${records.length} ตัว (เขียนจริง ${changed} แถว)`,
  }
}
