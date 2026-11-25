// ====================================================
// GET /api/meta/ranger-stats?id=u1587h-es[&level=1]
// สเตตัส + สกิล + ความสามารถของเรนเจอร์ (จากข้อมูลเกมของเราเอง — src/lib/gameData.ts)
// รันเฉพาะตอน build (scripts/emit-data.ts)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { getRawRanger } from '@/lib/rangerData'
import { buildRangerStatsResponse, type RangerStatsResponse } from '@/lib/buildRangerStats'

export type { RangerStatsResponse }

const RANGER_ID_RE = /^[a-z0-9][a-z0-9_\-]{2,50}$/i

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rangerId = searchParams.get('id') ?? ''
  const levelParam = searchParams.get('level')

  if (!RANGER_ID_RE.test(rangerId)) {
    return NextResponse.json({ error: 'Invalid ranger id format' }, { status: 400 })
  }

  let levelOverride: number | undefined
  if (levelParam != null) {
    const n = parseInt(levelParam, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 999) levelOverride = n
  }

  try {
    const raw = await getRawRanger(rangerId)
    if (!raw) {
      return NextResponse.json({ error: 'Ranger data not found' }, { status: 404 })
    }
    return NextResponse.json(await buildRangerStatsResponse(raw, rangerId, levelOverride))
  } catch (err) {
    console.error(`[RangerStats] Failed for ${rangerId}:`, err)
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
