// ====================================================
// API Route: GET /api/meta/ranger-detail?id=xxx&league=0
// ดึงข้อมูล Skill + Gear Ranking ของ Ranger
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRangerDetail, refreshRangerGear, LEAGUES } from '@/lib/pvpScraper'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
const getServerSession = async (_?: unknown): Promise<unknown> => null // static build: ไม่มี session
const authOptions = null

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const rangerId = searchParams.get('id') ?? ''
  const leagueParam = searchParams.get('league') ?? '0'
  const league = parseInt(leagueParam, 10)
  const forceParam = searchParams.get('force') === '1'

  if (!rangerId) {
    return NextResponse.json({ error: 'Missing ranger id' }, { status: 400 })
  }

  // Validate rangerId format to prevent injection attacks
  const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i
  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id format' }, { status: 400 })
  }

  const validLeague = LEAGUES.find((l) => l.value === league)
  if (!validLeague) {
    return NextResponse.json({ error: 'Invalid league' }, { status: 400 })
  }

  try {
    // Force re-fetch gear สำหรับ ranger + league นี้โดยเฉพาะ — แอดมินเท่านั้น
    // ท่านี้ยิง getPlayer ของ lerico ทุกคนที่ใช้เรนเจอร์ตัวนี้ แล้วเขียน Neon หนึ่งครั้ง
    // (= ปลุก compute 5 นาที) ใครก็เรียกได้ทั้งที่ไม่มีหน้าไหนในเว็บใช้ force=1 เลย
    if (forceParam) {
      const session = await getServerSession(authOptions)
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const fresh = await refreshRangerGear(rangerId, league)
      // force refresh → ไม่ cache
      return NextResponse.json(fresh, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const result = await getRangerDetail(rangerId, league)
    if (result.gearLoading) {
      return NextResponse.json(result, {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    // ข้อมูลจาก DB → CDN cache 30 นาที, browser cache ยืดให้เท่ากัน (ข้อมูลอัปเดตแค่ตอน
    // cron sync รายวัน → ไม่ทำให้ staleness แย่ลงกว่าที่ CDN ยอมรับอยู่แล้ว แต่ลด edge revalidate ซ้ำๆ)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('Error fetching ranger detail:', error)
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
