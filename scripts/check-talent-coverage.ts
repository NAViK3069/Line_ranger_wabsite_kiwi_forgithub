// ====================================================
// scripts/check-talent-coverage.ts
// ตรวจ talent translation coverage โดยตรง (ไม่ผ่าน HTTP)
// • Fetch warmycat → แปลผ่าน talentTranslate → หาตัวจีนที่เหลือ
// • Exit 0 = 100% coverage / Exit 1 = มีคำขาด (พร้อม report)
// • ใช้ใน GitHub Actions weekly cron
// ====================================================

import {
  translateDescription,
  translateCondition,
  translateBuffEffect,
  translateStatLine,
} from '../src/lib/talentTranslate'

const WARMYCAT_URL = 'https://rangerbook.warmycat.com/res/Rangers_data.json'
const CJK_PATTERN = /[　-〿一-鿿＀-￯]/g

interface Issue {
  rangerId: string
  field: string
  raw: string
  remaining: string[]
}

async function main() {
  console.log('[talent-coverage] fetching warmycat data...')
  const res = await fetch(WARMYCAT_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status}`)
    process.exit(2)
  }
  const data = await res.json()
  const list = Array.isArray(data) ? data : Object.values(data)
  console.log(`[talent-coverage] ${list.length} rangers loaded`)

  const issues: Issue[] = []
  const charCount: Record<string, number> = {}

  function checkField(rangerId: string, field: string, raw: string, translated: string) {
    if (!raw) return
    const matches = translated.match(CJK_PATTERN)
    if (matches && matches.length > 0) {
      const unique = [...new Set(matches)]
      unique.forEach(c => { charCount[c] = (charCount[c] ?? 0) + 1 })
      issues.push({ rangerId, field, raw, remaining: unique })
    }
  }

  for (const ranger of list as Array<Record<string, unknown>>) {
    if (!ranger || typeof ranger !== 'object') continue
    const rangerId = String(ranger.ranger_id ?? '')
    const talent = ranger['才能'] as Record<string, unknown> | undefined
    if (!talent || typeof talent !== 'object') continue

    const primary = talent['主要才能'] as Record<string, unknown> | undefined
    if (primary && typeof primary === 'object') {
      const desc = String(primary['敘述'] ?? '').replace(/\\n/g, '\n')
      const cond = String(primary['條件'] ?? '')
      checkField(rangerId, 'description', desc, translateDescription(desc, 'en'))
      checkField(rangerId, 'condition',   cond, translateCondition(cond, 'en'))
      const buffs = Array.isArray(primary['增益效果']) ? primary['增益效果'] as Array<Record<string, unknown>> : []
      buffs.forEach((b, i) => {
        const eff = String(b['效果'] ?? '')
        checkField(rangerId, `buff[${i}]`, eff, translateBuffEffect(eff, 'en'))
      })
    }
    const enhanced = talent['強化才能']
    if (Array.isArray(enhanced)) {
      enhanced.forEach((line: string, i: number) => {
        checkField(rangerId, `enhanced[${i}]`, line, translateStatLine(line, 'en'))
      })
    }
  }

  const topChars = Object.entries(charCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([char, count]) => ({ char, count }))

  // Summary
  console.log('')
  console.log('═══════════════════════════════════════════')
  console.log(`  Total rangers:        ${list.length}`)
  console.log(`  Issues:               ${issues.length}`)
  console.log(`  Unique missing chars: ${Object.keys(charCount).length}`)
  console.log('═══════════════════════════════════════════')

  if (issues.length === 0) {
    console.log('✅ 100% coverage — no missing translations')
    process.exit(0)
  }

  console.log('')
  console.log('❌ Missing translations found:')
  console.log('')
  console.log('Top missing chars:')
  topChars.slice(0, 20).forEach(({ char, count }) => {
    console.log(`  ${char}  (${count}x)`)
  })

  console.log('')
  console.log('Sample issues (first 5):')
  issues.slice(0, 5).forEach(iss => {
    console.log(`  - ${iss.rangerId} [${iss.field}]: "${iss.raw}"`)
  })

  // เขียน report ออกเป็น JSON สำหรับ GitHub Actions
  const report = {
    summary: {
      totalRangers: list.length,
      issuesCount: issues.length,
      uniqueRemainingChars: Object.keys(charCount).length,
    },
    topUntranslatedChars: topChars,
    sampleIssues: issues.slice(0, 20),
  }
  // เขียนลง stdout ใน format ที่ GH Actions parse ได้
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs')
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `report<<EOF\n${JSON.stringify(report, null, 2)}\nEOF\n`)
  }

  process.exit(1)
}

main().catch(err => {
  console.error('[talent-coverage] error:', err)
  process.exit(2)
})
