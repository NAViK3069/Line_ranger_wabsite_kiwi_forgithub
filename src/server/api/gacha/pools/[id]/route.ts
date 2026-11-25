// ====================================================
// GET /api/gacha/pools/[id] — ตู้เรนเจอร์ 1 ตู้ + เรนเจอร์ในตู้ (หน้าสุ่ม)
// รันเฉพาะตอน build (scripts/emit-data.ts) — เขียนไฟล์ให้ทุกตู้ที่เปิดอยู่
// ====================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params

  const pool = await prisma.gachaPool.findUnique({
    where: { id, isActive: true },
    select: { id: true, name: true, imageUrl: true, rangers: true, guaranteedRangers: true, isFrog: true },
  })
  if (!pool) return NextResponse.json({ error: 'ไม่พบตู้กาชา' }, { status: 404 })

  type RangerEntry = { name: string; grade: string; rate: number; rangerId?: string; imgUrl?: string | null }
  type GuaranteedEntry = { name: string; grade: string; rangerId?: string }

  const rawRangers = (Array.isArray(pool.rangers) ? pool.rangers : []) as RangerEntry[]
  const rawGuaranteed = (Array.isArray(pool.guaranteedRangers) ? pool.guaranteedRangers : []) as GuaranteedEntry[]

  // รูปเรนเจอร์จาก rangerId ของแต่ละแถว (ทั้งตู้ปกติและตู้กบ)
  const toImgUrl = (rangerId?: string) =>
    rangerId ? `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png` : null

  const rangers = rawRangers.map((r) => ({ ...r, imgUrl: toImgUrl(r.rangerId) }))
  const guaranteedRangers = rawGuaranteed.map((r) => ({ ...r, imgUrl: toImgUrl(r.rangerId) }))

  return NextResponse.json({ ...pool, rangers, guaranteedRangers, isFrog: pool.isFrog })
}
