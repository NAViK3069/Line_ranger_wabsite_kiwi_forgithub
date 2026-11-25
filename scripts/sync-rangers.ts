/**
 * sync-rangers.ts — สร้าง Ranger Book + Gear Book จากข้อมูลเกมของเราเอง (.gamedata)
 * เขียนผลลง .data/db/ranger-book.json + gear-book.json (ไม่ดึงข้อมูลจากเว็บอื่น)
 *
 * Run locally : npx tsx scripts/sync-rangers.ts
 * Run in CI   : ขั้น "Sync Ranger Book + Gear Book" ของ .github/workflows/data.yml
 */

import { performRangerSync } from '../src/lib/syncRangerBook'
import { prisma } from '../src/lib/db'

async function main() {
  console.log(`[RangerSync] เริ่มต้น — ${new Date().toISOString()}`)

  const result = await performRangerSync()
  console.log(`[RangerSync] ✓ ${result.message}`)

  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('[RangerSync] Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
