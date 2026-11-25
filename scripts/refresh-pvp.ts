/**
 * refresh-pvp.ts — ดึงอันดับ PvP ทุกลีค + ทีม/เกียร์ของผู้เล่น จาก API ของ rangers.lerico.net
 * (ข้อมูลส่วนเดียวของเว็บที่ยังมาจากเว็บอื่น — ใช้ในหน้า /meta และ popup เรนเจอร์)
 * เขียนผลลง .data/db/league-rankings.json + ranger-gear.json
 *
 * Run locally : npx tsx scripts/refresh-pvp.ts
 * Run in CI   : ขั้น "Refresh PvP rankings" ของ .github/workflows/data.yml
 */

import { beginDeferredDbWrites, flushDeferredDbWrites, getMetaRangers, LEAGUES, loadTranslations } from '../src/lib/pvpScraper'
import { prisma } from '../src/lib/db'

async function main() {
  console.log(`[RefreshPvP] เริ่มต้น — ${new Date().toISOString()}`)
  console.log(`[RefreshPvP] จำนวน league: ${LEAGUES.length}`)

  // โหลดชื่อเรนเจอร์/เกียร์จากข้อมูลเกมก่อน — ชื่อถูก "ฝัง" ลงในตารางอันดับตอน scrape
  await loadTranslations()

  // เก็บคำสั่งเขียน DB ไว้ แล้วรอให้ครบทุกคำสั่งตอนจบ (ก่อนเซฟไฟล์)
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
  console.log(`[RefreshPvP] เขียน DB ${written} แถว`)

  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('[RefreshPvP] Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
