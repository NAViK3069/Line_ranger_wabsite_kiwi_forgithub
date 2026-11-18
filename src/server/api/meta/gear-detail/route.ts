// ====================================================
// API Route: GET /api/meta/gear-detail?iconUrl=...&league=X
// คืนรายชื่อ Ranger ที่ใส่เกียร์ชิ้นนี้ใน League นั้น
// พร้อมจำนวน (count) และ % จาก sampled ของ ranger แต่ละตัว
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getGearEffectsAsync, isValidLeague } from '@/lib/pvpScraper'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'
import { gearDetailRangers, rowsFromGearBatch } from '@/lib/gearAggregate'
import type { GearRanking, RangerGearRow } from '@/lib/gearAggregate'

export const maxDuration = 60

// ข้อมูลเปลี่ยนวันละครั้ง (refresh รายวัน) — CDN เก็บ 6 ชม. แล้วค่อยถามใหม่ จะได้เห็นรอบใหม่ภายในวันเดียวกัน
// (เดิม 7 วัน ทำให้หน้า Meta โชว์อันดับเกียร์ค้างได้ทั้งสัปดาห์)
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
}

interface StoredRangerStat {
  id: string
  name: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const iconUrl = searchParams.get('iconUrl') ?? ''
  const leagueParam = searchParams.get('league') ?? '0'
  const league = parseInt(leagueParam, 10)
  const effectsOnly = searchParams.get('effectsOnly') === 'true'
  // ── Level params ──
  // วิธีใหม่: 3 levels แยก (basicLevel, switchLevel, skillPlusLevel) — แต่ละตัว 0-5
  // วิธีเดิม (fallback): single `level` ใช้กับทั้ง 3 เอฟเฟกต์ — backward compat
  function parseLv(name: string): number | null {
    const v = searchParams.get(name)
    if (v === null) return null
    if (v === 'max') return 5
    const n = parseInt(v, 10)
    return isNaN(n) ? null : Math.max(0, Math.min(5, n))
  }
  const basicLv = parseLv('basicLevel')
  const switchLv = parseLv('switchLevel')
  const skillPlusLv = parseLv('skillPlusLevel')
  const hasSplit = basicLv !== null || switchLv !== null || skillPlusLv !== null

  let levels: { basic: number; switchable: number; skillPlus: number }
  if (hasSplit) {
    levels = { basic: basicLv ?? 5, switchable: switchLv ?? 5, skillPlus: skillPlusLv ?? 5 }
  } else {
    const levelParam = searchParams.get('level') ?? 'max'
    const parsedLevel = parseInt(levelParam, 10)
    const single = levelParam === 'max' ? 5 : Math.max(0, Math.min(5, isNaN(parsedLevel) ? 5 : parsedLevel))
    levels = { basic: single, switchable: single, skillPlus: single }
  }
  const isMaxAll = levels.basic === 5 && levels.switchable === 5 && levels.skillPlus === 5

  if (!iconUrl) {
    return NextResponse.json({ error: 'Missing iconUrl' }, { status: 400 })
  }
  if (!effectsOnly && !isValidLeague(league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  // extract itemCode ใช้ทั้งสอง path
  const mUrl = iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)
  const itemCode = mUrl ? mUrl[1] : null

  try {
    // ── effectsOnly: ข้าม DB query ทั้งหมด คืนแค่ effects ──
    if (effectsOnly) {
      // ลอง Redis cache เมื่อ all-max (basic=5, switch=5, skillPlus=5) เท่านั้น
      if (redis && itemCode && isMaxAll) {
        try {
          const cached = await redis.get<string>(redisKey.gearEffects(itemCode))
          if (cached) {
            return NextResponse.json({ rangers: [], effects: JSON.parse(cached) }, {
              headers: CACHE_HEADERS,
            })
          }
        } catch { /* fallback */ }
      }
      const effects = itemCode ? await getGearEffectsAsync(itemCode, levels) : null
      // เก็บลง Redis เฉพาะ all-max
      if (redis && itemCode && isMaxAll && effects) {
        redis.set(redisKey.gearEffects(itemCode), JSON.stringify(effects), {
          ex: REDIS_TTL.gearEffects,
        }).catch(() => {})
      }
      return NextResponse.json({ rangers: [], effects }, {
        headers: CACHE_HEADERS,
      })
    }

    // ── ลอง Redis ก่อน — รวบ 2 keys (rangers + effects) เป็น 1 MGET ──
    // เก็บ cachedEffects ไว้ใช้ใน path อื่นด้วย (ป้องกัน Redis GET ซ้ำ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cachedEffectsFromMget: any = null
    let stamp: string | null = null
    if (redis && itemCode) {
      try {
        const [cachedRangersRaw, cachedFxRaw, stampRaw] = await redis.mget<(string | null)[]>(
          redisKey.gearDetail(itemCode, league),
          redisKey.gearEffects(itemCode),
          redisKey.leagueStamp(league),
        )
        stamp = stampRaw != null ? String(stampRaw) : null
        // เก็บ effects จาก MGET ไว้ก่อน — ใช้ทั้งใน hit path และ DB miss path
        if (isMaxAll && cachedFxRaw) {
          cachedEffectsFromMget = typeof cachedFxRaw === 'string'
            ? JSON.parse(cachedFxRaw) : cachedFxRaw
        }
        const cachedDetail = cachedRangersRaw
          ? (typeof cachedRangersRaw === 'string' ? JSON.parse(cachedRangersRaw) : cachedRangersRaw) as { rangers: unknown; stamp?: string }
          : null
        // แคชของรอบ refresh เก่า (หรือแคชรุ่นก่อนที่ไม่มี stamp) = ไม่ใช้ — สร้างใหม่จาก Redis ด้านล่าง
        if (cachedDetail && (stamp === null || cachedDetail.stamp === stamp)) {
          const cachedRangers = cachedDetail.rangers
          let effects = cachedEffectsFromMget
          if (effects === null) {
            effects = await getGearEffectsAsync(itemCode, levels)
            if (isMaxAll && effects) {
              redis.set(redisKey.gearEffects(itemCode), JSON.stringify(effects), {
                ex: REDIS_TTL.gearEffects,
              }).catch(() => {})
            }
          }
          return NextResponse.json({ rangers: cachedRangers, effects }, {
            headers: CACHE_HEADERS,
          })
        }
      } catch { /* Redis unavailable → fallback to DB */ }
    }

    // ── แคชไม่มี/เก่า → สร้างจาก gearBatch + ชื่อเรนเจอร์ใน Redis (ตัว refresh รายวันเขียนไว้) ──
    // ตกถึง Neon เฉพาะตอน Redis ไม่มีข้อมูลลีคนี้เลยจริงๆ
    let rows: RangerGearRow[] | null = null
    let nameOf: (id: string) => string = id => id
    if (redis) {
      try {
        const [batchRaw, namesRaw] = await redis.mget<(string | null)[]>(
          redisKey.gearBatch(league), redisKey.leagueNames(league),
        )
        if (batchRaw) {
          const batch = (typeof batchRaw === 'string' ? JSON.parse(batchRaw) : batchRaw) as Record<string, { data: GearRanking; sampled: number }>
          let names = (namesRaw ? (typeof namesRaw === 'string' ? JSON.parse(namesRaw) : namesRaw) : null) as Record<string, string> | null
          // ยังไม่มีคีย์ชื่อ (ก่อน refresh รอบแรกหลังเพิ่มคีย์นี้) → เอาชื่อจากคีย์ลีคเต็มแทน ไม่งั้นจะโชว์เป็นรหัสเรนเจอร์
          if (!names) {
            const leagueRaw = await redis.get<string>(redisKey.league(league))
            const lg = (leagueRaw ? (typeof leagueRaw === 'string' ? JSON.parse(leagueRaw) : leagueRaw) : null) as { data?: StoredRangerStat[] } | null
            names = Object.fromEntries((lg?.data ?? []).map(r => [r.id, r.name]))
            redis.set(redisKey.leagueNames(league), JSON.stringify(names), { ex: REDIS_TTL.rangerGear }).catch(() => {})
          }
          const nameMap = names
          rows = rowsFromGearBatch(batch)
          nameOf = id => nameMap[id] ?? id
        }
      } catch { /* ไปต่อที่ DB */ }
    }

    if (!rows) {
      // ── Redis ไม่มีอะไรเลย → ดึงจาก DB ──
      // ดึงพร้อมกัน: gear ทุก ranger + ชื่อ ranger จาก league ranking
      const [dbRows, leagueRanking] = await Promise.all([
        prisma.rangerGear.findMany({
          where: { league },
          select: { rangerId: true, gearData: true, sampled: true },
        }),
        prisma.leagueRanking.findUnique({
          where: { id: league },
          select: { data: true },
        }),
      ])

      // สร้าง map ชื่อ ranger จาก LeagueRanking.data (RangerStat[])
      const rangerStats = (leagueRanking?.data ?? []) as unknown as StoredRangerStat[]
      const nameMap = new Map(rangerStats.map((r) => [r.id, r.name]))
      rows = dbRows.map(r => ({ rangerId: r.rangerId, gearData: r.gearData as unknown as GearRanking, sampled: r.sampled }))
      nameOf = id => nameMap.get(id) ?? id
    }

    const results = gearDetailRangers(rows, iconUrl, nameOf)

    // ── เก็บ rangers list ลง Redis (ติดเวลารอบ refresh ไว้ด้วย รอบใหม่มาแล้วจะสร้างใหม่เอง) ──
    if (redis && itemCode) {
      redis.set(redisKey.gearDetail(itemCode, league), JSON.stringify({ rangers: results, stamp: stamp ?? undefined }), {
        ex: REDIS_TTL.gearDetail,
      }).catch(() => {})
    }

    // ── ดึง effects: ใช้จาก MGET ด้านบนถ้ามี (ไม่ทำ Redis GET ซ้ำ) ──
    let effects = cachedEffectsFromMget
    if (effects === null) {
      effects = itemCode ? await getGearEffectsAsync(itemCode, levels) : null
      if (redis && itemCode && isMaxAll && effects) {
        redis.set(redisKey.gearEffects(itemCode), JSON.stringify(effects), {
          ex: REDIS_TTL.gearEffects,
        }).catch(() => {})
      }
    }

    return NextResponse.json({ rangers: results, effects }, {
      headers: CACHE_HEADERS,
    })
  } catch (error) {
    console.error('[GearDetail] Error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
