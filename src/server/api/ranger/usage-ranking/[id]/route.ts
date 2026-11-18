// ====================================================
// API: GET /api/ranger/usage-ranking/[id]?league=0
// คืนอันดับการเลือกใช้ Awakening Ability / Talent stage ของ ranger ในลีคนั้น
// (จัดอันดับจากผู้เล่นทั้งหมดในลีค ไม่ใช่แค่ top 10/30/50/100)
//
// Client ควรเช็คก่อนเรียก route นี้ว่าเรนเจอร์มี Awakening/Talent จริงไหม
// (ผ่าน /api/ranger/awakening/[id] และ /api/ranger/talents/[id] ที่ cache ไว้อยู่แล้ว)
// เพื่อไม่ต้องเรียก route นี้เปล่าๆ สำหรับเรนเจอร์ที่ไม่มีคุณสมบัติทั้งสองอย่าง
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRangerUsage } from '@/lib/pvpUsage'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'

export const maxDuration = 60

const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i

// browser cache ยืดเท่า CDN — ข้อมูล warmycat เปลี่ยนไม่บ่อย (cache ฝั่งเราเอง 7 วันอยู่แล้ว)
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800',
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id: rawId } = await params
  const rangerId = rawId.toLowerCase().trim()
  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id' }, { status: 400 })
  }

  const league = parseInt(req.nextUrl.searchParams.get('league') ?? '0', 10)
  if (Number.isNaN(league)) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    const usage = await getRangerUsage(rangerId, league)
    // ลีคไม่รองรับ (Silver/Bronze) หรือไม่มีข้อมูล — คืน array ว่าง ให้ UI ซ่อนเอง ไม่ error
    return NextResponse.json(usage ?? { awakeningUsage: [], talentUsage: [] }, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error('[UsageRanking] error:', err)
    return NextResponse.json({ awakeningUsage: [], talentUsage: [] }, { status: 500 })
  }
}
