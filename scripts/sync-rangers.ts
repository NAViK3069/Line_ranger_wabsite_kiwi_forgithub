/**
 * sync-rangers.ts — GitHub Actions script
 * Sync Ranger Book + Gear Book จาก lerico.net → บันทึกลง Neon + Redis
 *
 * Run locally : npx tsx scripts/sync-rangers.ts
 * Run in CI   : ถูกเรียกอัตโนมัติโดย .github/workflows/daily-refresh.yml
 */

import { performRangerSync } from '../src/lib/syncRangerBook'
import { prisma } from '../src/lib/db'

async function main() {
  console.log(`[RangerSync] เริ่มต้น — ${new Date().toISOString()}`)

  const result = await performRangerSync()

  console.log(`[RangerSync] ✓ ${result.message}`)
  console.log(`[RangerSync] Cache: ${result.cached}`)

  await prisma.$disconnect()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('[RangerSync] Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
