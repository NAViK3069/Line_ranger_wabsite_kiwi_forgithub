// ====================================================
// Public API: GET /api/gacha/gear-pools/[id]
// ดึงข้อมูล gear pool + gears สำหรับหน้าสุ่ม gacha gear
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'
const getServerSession = async (_?: unknown): Promise<unknown> => null // static build: ไม่มี session
const authOptions = null

type Ctx = { params: Promise<{ id: string }> }

// browser cache 1 นาที + CDN cache 1 นาที (stale-while-revalidate 5 นาที)
// เดิม s-maxage=86400 (1 วัน) — พอ admin แก้ตู้ CDN ยังเสิร์ฟของเก่าให้คนทั่วไปได้นานสุดถึง 1 วัน
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
}

function getGearType(gearId: string): string {
  if (gearId.includes('_wpn_')) return 'wpn'
  if (gearId.includes('_amr_')) return 'amr'
  if (gearId.includes('_acc_')) return 'acc'
  return ''
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const ip = getClientIp(request.headers)
  const rateLimitResult = apiRateLimit(ip)
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params

  try {
    // ── 1. ลอง Redis ก่อน ──
    if (redis) {
      const cached = await redis.get<string>(redisKey.gachaGearPool(id))
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data, { headers: CACHE_HEADERS })
      }
    }

    // ── 2. Redis miss → ดึงจาก DB ──
    // ปกติเห็นเฉพาะตู้ที่เปิดอยู่ แต่ถ้าไม่เจอแล้วคนขอเป็นแอดมินที่ล็อกอินอยู่ ให้ดูตู้ที่ยังปิดได้
    // เพื่อทดลองสุ่มก่อนเปิดให้คนทั่วไป — เช็ค session เฉพาะตอนหาไม่เจอเท่านั้น
    // ไม่ได้เช็คทุก request เพราะเส้นทางนี้เป็นของสาธารณะ จะกลายเป็นภาระเปล่าๆ
    const SELECT = {
      id: true, name: true, imageUrl: true,
      gears: true, guaranteedGears: true,
      isChristmas: true, christmasTierRates: true,
    } as const
    let pool = await prisma.gachaGearPool.findUnique({ where: { id, isActive: true }, select: SELECT })
    let adminPreview = false
    if (!pool) {
      const session = await getServerSession(authOptions)
      if (session) {
        pool = await prisma.gachaGearPool.findUnique({ where: { id }, select: SELECT })
        adminPreview = pool !== null
      }
    }

    if (!pool) {
      return NextResponse.json({ error: 'ไม่พบตู้กาชา' }, { status: 404 })
    }

    // ── เติม imgUrl จาก gear ID โดยตรง ──
    type GearEntry = {
      id: string; name: string; grade: string; rate: number; type: string
      isChristmas?: boolean
    }
    const rawGears = (Array.isArray(pool.gears) ? pool.gears : []) as GearEntry[]
    const gears = rawGears.map((g) => ({
      ...g,
      imgUrl: g.id
        ? `https://rangers.lerico.net/res/gear_icon/${g.id.replace(/_nm$/, '')}_icon.png`
        : null,
    }))

    // ── guaranteed gears: ใช้ id ที่เก็บใน DB โดยตรง ──
    type GuaranteedGearEntry = { id: string; name: string; grade: string }
    const rawGuaranteed = (Array.isArray(pool.guaranteedGears) ? pool.guaranteedGears : []) as GuaranteedGearEntry[]

    const guaranteedGears = rawGuaranteed.map((g) => ({
      ...g,
      type: g.id ? getGearType(g.id) : '',
      imgUrl: g.id
        ? `https://rangers.lerico.net/res/gear_icon/${g.id.replace(/_nm$/, '')}_icon.png`
        : null,
    }))

    const payload = { ...pool, gears, guaranteedGears }

    // ── 3. บันทึกใน Redis สำหรับครั้งถัดไป ──
    // ตู้ที่ยังปิดอยู่ห้ามลงแคชเด็ดขาด ไม่งั้นคนทั่วไปที่ขอ id เดียวกันจะได้ตู้ที่ยังไม่เปิดไปด้วย
    if (redis && !adminPreview) {
      redis.set(redisKey.gachaGearPool(id), JSON.stringify(payload), { ex: REDIS_TTL.gachaPool })
        .catch((e) => console.error(`[Redis] Failed to cache gacha gear pool ${id}:`, e))
    }

    // ดูแบบแอดมิน = ห้ามให้เบราว์เซอร์หรือ CDN เก็บไว้ ตู้ยังไม่เปิดให้คนทั่วไป
    return NextResponse.json(payload, { headers: adminPreview ? { 'Cache-Control': 'no-store' } : CACHE_HEADERS })
  } catch (error) {
    console.error('Error fetching gear pool:', error)
    return NextResponse.json({ error: 'Failed to fetch gear pool' }, { status: 500 })
  }
}
