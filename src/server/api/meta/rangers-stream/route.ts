// ====================================================
// API Route: GET /api/meta/rangers-stream?league=0
// SSE streaming — ส่งความคืบหน้าการดึง gear ทีละ batch
// ====================================================

import { NextRequest } from 'next/server'
import { getMetaRangers, LEAGUES, withTopGear } from '@/lib/pvpScraper'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return new Response('data: ' + JSON.stringify({ type: 'error', message: 'Too many requests' }) + '\n\n', {
      status: 429,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const { searchParams } = new URL(request.url)
  const leagueParam = searchParams.get('league') ?? '0'
  const league = parseInt(leagueParam, 10)

  const validLeague = LEAGUES.find((l) => l.value === league)
  if (!validLeague) {
    return new Response('data: ' + JSON.stringify({ type: 'error', message: 'Invalid league' }) + '\n\n', {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + '\n\n'))
        } catch { /* client disconnected */ }
      }

      try {
        const result = await getMetaRangers(
          league,
          false,
          (done, total) => send({ type: 'progress', done, total })
        )
        send({
          type: 'done',
          league,
          leagueName: validLeague.label,
          // เกียร์อันดับ 1 ของแต่ละช่อง — โชว์ใต้ชื่อในตาราง
          rangers: withTopGear(result.rangers, league),
          fetchedAt: result.fetchedAt,
          totalPlayers: result.totalPlayers,
          isRefreshing: false,
        })
      } catch (err) {
        console.error('Error in rangers-stream:', err)
        send({ type: 'error', message: 'Internal server error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
