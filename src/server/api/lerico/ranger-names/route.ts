import { NextRequest, NextResponse } from 'next/server'
import { apiRateLimit, getClientIp } from '@/lib/rateLimit'
import { FRESH_CACHE_HEADERS } from '@/lib/cacheHeaders'
import { gameTranslate } from '@/lib/gameData'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = apiRateLimit(ip)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    // ข้อความจากไฟล์ภาษาของเกม (รูปแบบเดิม { "en:UNIT": { code: ข้อความ } }) — เดิมดึงจาก lerico
    const data = gameTranslate('en:UNIT')
    return NextResponse.json(data, {
      headers: {
        // ข้อมูลเกมอัปเดตเมื่อเกมออกไฟล์ใหม่ — CDN ไม่ควรยึดนาน
        ...FRESH_CACHE_HEADERS,
      },
    })
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
