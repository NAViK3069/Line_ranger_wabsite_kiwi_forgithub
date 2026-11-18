/**
 * refresh-pvp.ts — GitHub Actions script
 * Refresh PvP rankings ทุก league จาก lerico.net → บันทึกลง Neon + Redis
 *
 * Run locally : npx tsx scripts/refresh-pvp.ts
 * Run in CI   : ถูกเรียกอัตโนมัติโดย .github/workflows/daily-refresh.yml
 */

import { beginDeferredDbWrites, flushDeferredDbWrites, getMetaRangers, LEAGUES, loadTranslations } from '../src/lib/pvpScraper'
import { prisma } from '../src/lib/db'

async function main() {
  console.log(`[RefreshPvP] เริ่มต้น — ${new Date().toISOString()}`)
  console.log(`[RefreshPvP] จำนวน league: ${LEAGUES.length}`)

  // ดึงคำแปลสดก่อนเสมอ — ชื่อเรนเจอร์ถูก "ฝัง" ลงในตารางอันดับตอน scrape
  // ถ้าใช้ของที่แคชไว้ (TTL 7 วัน) เรนเจอร์ที่เพิ่งออกจะถูกบันทึกเป็นรหัสดิบ
  // เช่น u1631e-sally แล้วค้างอยู่แบบนั้นจนกว่าจะ scrape รอบถัดไปหลังแคชหมดอายุ
  console.log('[RefreshPvP] ดึงคำแปลสดจาก lerico ก่อน...')
  await loadTranslations(true)

  // เก็บคำสั่งเขียน DB ไว้ก่อน แล้วเขียนรวดเดียวตอนจบ — Neon ตื่นแค่ช่วงท้ายไม่กี่นาที
  // แทนที่จะตื่นตลอดเวลาที่ scrape ทั้ง 10 ลีค (ดู beginDeferredDbWrites ใน pvpScraper)
  beginDeferredDbWrites()

  let success = 0
  let failed = 0

  for (const league of LEAGUES) {
    try {
      console.log(`\n[RefreshPvP] กำลัง refresh ${league.label} (${league.value})...`)
      const result = await getMetaRangers(league.value, true)
      console.log(`[RefreshPvP] ✓ ${league.label}: ${result.totalPlayers} players`)
      success++
    } catch (err) {
      console.error(`[RefreshPvP] ✗ ${league.label}:`, err)
      failed++
    }
  }

  console.log(`\n[RefreshPvP] เสร็จสิ้น — สำเร็จ ${success}/${LEAGUES.length} leagues, ล้มเหลว ${failed}`)

  const written = await flushDeferredDbWrites()
  console.log(`[RefreshPvP] เขียน DB รวดเดียว ${written} แถว`)

  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('[RefreshPvP] Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
