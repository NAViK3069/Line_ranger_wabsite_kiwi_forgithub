// ====================================================
// API: GET /api/talent-dict
// คืน zh→en dict สำหรับแปล talent text (derived จาก lerico)
// • Source: lerico zh:PROPERTIES + en:PROPERTIES (stat names)
//           lerico zh:ABILITY + en:ABILITY (อาจมี short phrases)
// • Cache Redis 7 วัน — fetch lerico แค่ ~1 ครั้ง/สัปดาห์
// • CDN cache 24 ชม. — Browser/Vercel เสิร์ฟแทบทันที
//
// Client (TalentSection) เรียก endpoint นี้ครั้งเดียวต่อ session
// แล้วส่ง dict ไปให้ translateXxx() ใช้เป็น EN fallback ของ manual dict
// (TH dict ยังคงเป็น manual ทั้งหมด เพราะ lerico ไม่มีไทย)
// ====================================================

import { NextResponse } from 'next/server'
import { redis, REDIS_TTL, redisKey } from '@/lib/redis'
import { gameText } from '@/lib/gameData'
import { fetchCustomLocale, phraseTemplates } from '@/lib/warmycatLocale'
import type { PhraseTemplate } from '@/lib/warmycatLocale'

export const maxDuration = 30

// dict types ที่มีประโยชน์กับ talent text (zh:TALENT ของ lerico เป็น {} จึงไม่ใช้)
const DICT_TYPES = ['PROPERTIES', 'ABILITY'] as const

const CACHE_HEADERS = {
  // Browser ยืดให้เท่า CDN (7 วัน) — ลด edge request ซ้ำ
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

interface TalentDict {
  stats: Record<string, string>      // zh stat name → en
  phrases: Record<string, string>    // zh phrase → en
  templates: PhraseTemplate[]        // แม่แบบประโยคทางการ zh → th/en จาก warmycat custom.json
}

/** ข้อความ zh / en ของเกม (ไฟล์ภาษาของเกม — เดิมดึงจาก lerico) */
async function fetchLericoMap(lang: 'zh' | 'en', type: string): Promise<Record<string, string>> {
  return gameText(lang, type)
}

/** zip zh + en by shared key — เก็บเฉพาะที่ทั้งคู่มีค่า และ zh ≠ en */
function zipMaps(zhMap: Record<string, string>, enMap: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, zhVal] of Object.entries(zhMap)) {
    const enVal = enMap[key]
    if (!enVal || !zhVal) continue
    const zh = zhVal.trim()
    const en = enVal.trim()
    if (!zh || !en || zh === en) continue
    // ข้ามค่ายาวเกินไป (ไม่ใช่ phrase ที่ใช้งานได้กับ talent)
    if (zh.length > 40) continue
    // ข้าม placeholder pattern
    if (zh.includes('{') || en.includes('{')) continue
    // ข้าม newline / whitespace ภายใน
    if (/[\n\r]/.test(zh) || /[\n\r]/.test(en)) continue
    // ถ้ามีอยู่แล้ว เลือกอันที่สั้นกว่า (มัก clean กว่า)
    if (out[zh] && out[zh].length <= en.length) continue
    out[zh] = en
  }
  return out
}

async function buildDict(): Promise<TalentDict> {
  // fetch ทุก dict type คู่ขนาน
  const pairs = await Promise.all(
    DICT_TYPES.map(async (type) => {
      const [zhMap, enMap] = await Promise.all([
        fetchLericoMap('zh', type).catch(() => ({})),
        fetchLericoMap('en', type).catch(() => ({})),
      ])
      return { type, zh: zhMap, en: enMap }
    }),
  )

  const stats: Record<string, string> = {}
  const phrases: Record<string, string> = {}

  for (const { type, zh, en } of pairs) {
    const merged = zipMaps(zh, en)
    if (type === 'PROPERTIES') {
      Object.assign(stats, merged)
    } else {
      Object.assign(phrases, merged)
    }
  }

  // แม่แบบทางการของ warmycat — โหลดไม่ได้ก็ยังใช้ dict ของ lerico ได้ตามเดิม
  const templates = await fetchCustomLocale().then(phraseTemplates).catch(() => [] as PhraseTemplate[])

  return { stats, phrases, templates }
}

export async function GET() {
  // ลอง Redis ก่อน
  if (redis) {
    try {
      const cached = await redis.get<TalentDict | string>(redisKey.talentDict())
      if (cached) {
        const dict = typeof cached === 'string' ? JSON.parse(cached) as TalentDict : cached
        return NextResponse.json(dict, { headers: CACHE_HEADERS })
      }
    } catch { /* fallback */ }
  }

  try {
    const dict = await buildDict()
    // fire-and-forget cache write
    if (redis) {
      redis.set(redisKey.talentDict(), JSON.stringify(dict), { ex: REDIS_TTL.talentDict }).catch(() => {})
    }
    return NextResponse.json(dict, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[talent-dict] build failed:', err)
    // ส่ง empty dict กลับไป — TalentSection จะใช้ manual dict อย่างเดียว ยังทำงานได้
    return NextResponse.json({ stats: {}, phrases: {}, templates: [] } as TalentDict, { headers: CACHE_HEADERS })
  }
}
