// ====================================================
// Public API: GET /api/gacha/pools/[id]
// ดึงข้อมูล pool + rangers สำหรับหน้าสุ่ม gacha
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { redis, redisKey, REDIS_TTL } from '@/lib/redis'
const getServerSession = async (_?: unknown): Promise<unknown> => null // static build: ไม่มี session
const authOptions = null

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const ip = getClientIp(request.headers)
  const rateLimitResult = apiRateLimit(ip)
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params

  // browser cache 1 นาที + CDN cache 1 นาที (stale-while-revalidate 5 นาที)
  // เดิม s-maxage=86400 (1 วัน) — พอ admin แก้ตู้ CDN ยังเสิร์ฟของเก่าให้คนทั่วไปได้นานสุดถึง 1 วัน
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
  }

  try {
    // ── 1. ลอง Redis ก่อน ──
    if (redis) {
      const cached = await redis.get<string>(redisKey.gachaPool(id))
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached
        return NextResponse.json(data, { headers: cacheHeaders })
      }
    }

    // ── 2. Redis miss → ดึงจาก DB ──
    // ปกติเห็นเฉพาะตู้ที่เปิดอยู่ แต่ถ้าไม่เจอแล้วคนขอเป็นแอดมินที่ล็อกอินอยู่ ให้ดูตู้ที่ยังปิดได้
    // เพื่อทดลองสุ่มก่อนเปิดให้คนทั่วไป — เช็ค session เฉพาะตอนหาไม่เจอเท่านั้น
    // ไม่ได้เช็คทุก request เพราะเส้นทางนี้เป็นของสาธารณะ จะกลายเป็นภาระเปล่าๆ
    const SELECT = { id: true, name: true, imageUrl: true, rangers: true, guaranteedRangers: true, isFrog: true } as const
    let pool = await prisma.gachaPool.findUnique({ where: { id, isActive: true }, select: SELECT })
    let adminPreview = false
    if (!pool) {
      const session = await getServerSession(authOptions)
      if (session) {
        pool = await prisma.gachaPool.findUnique({ where: { id }, select: SELECT })
        adminPreview = pool !== null
      }
    }

    if (!pool) {
      return NextResponse.json({ error: 'ไม่พบตู้กาชา' }, { status: 404 })
    }

    type RangerEntry = { name: string; grade: string; rate: number; rangerId?: string; imgUrl?: string | null }
    type GuaranteedEntry = { name: string; grade: string; rangerId?: string }

    const rawRangers = (Array.isArray(pool.rangers) ? pool.rangers : []) as RangerEntry[]
    const rawGuaranteed = (Array.isArray(pool.guaranteedRangers) ? pool.guaranteedRangers : []) as GuaranteedEntry[]

    // ── ใช้ rangerId จาก entry โดยตรง (ทั้งตู้ปกติและตู้กบ) ──
    const toImgUrl = (rangerId?: string) =>
      rangerId ? `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png` : null

    const rangers = rawRangers.map((r) => ({ ...r, imgUrl: toImgUrl(r.rangerId) }))
    const guaranteedRangers = rawGuaranteed.map((r) => ({ ...r, imgUrl: toImgUrl(r.rangerId) }))

    const payload = { ...pool, rangers, guaranteedRangers, isFrog: pool.isFrog }

    // ── 3. บันทึกใน Redis สำหรับครั้งถัดไป ──
    // ตู้ที่ยังปิดอยู่ห้ามลงแคชเด็ดขาด ไม่งั้นคนทั่วไปที่ขอ id เดียวกันจะได้ตู้ที่ยังไม่เปิดไปด้วย
    if (redis && !adminPreview) {
      redis.set(redisKey.gachaPool(id), JSON.stringify(payload), { ex: REDIS_TTL.gachaPool })
        .catch((e) => console.error(`[Redis] Failed to cache gacha pool ${id}:`, e))
    }

    // ดูแบบแอดมิน = ห้ามให้เบราว์เซอร์หรือ CDN เก็บไว้ ตู้ยังไม่เปิดให้คนทั่วไป
    return NextResponse.json(payload, { headers: adminPreview ? { 'Cache-Control': 'no-store' } : cacheHeaders })
  } catch (error) {
    console.error('Error fetching pool:', error)
    return NextResponse.json({ error: 'Failed to fetch pool' }, { status: 500 })
  }
}
