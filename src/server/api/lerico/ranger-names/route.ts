import { NextRequest, NextResponse } from 'next/server'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const res = await fetch('https://rangers.lerico.net/api/v2/translate?keys=en:UNIT', {
      next: { revalidate: 3600 }
    })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        // ต้นทางรีเฟรชจาก lerico ทุกชั่วโมง (revalidate: 3600) CDN จึงไม่ควรยึดนานกว่านั้น
        ...FRESH_CACHE_HEADERS,
      },
    })
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
