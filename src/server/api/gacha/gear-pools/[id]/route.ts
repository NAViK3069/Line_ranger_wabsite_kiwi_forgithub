// ====================================================
// GET /api/gacha/gear-pools/[id] — ตู้เกียร์ 1 ตู้ + เกียร์ในตู้ (หน้าสุ่ม)
// รันเฉพาะตอน build (scripts/emit-data.ts) — เขียนไฟล์ให้ทุกตู้ที่เปิดอยู่
// ====================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

function getGearType(gearId: string): string {
  if (gearId.includes('_wpn_')) return 'wpn'
  if (gearId.includes('_amr_')) return 'amr'
  if (gearId.includes('_acc_')) return 'acc'
  return ''
}

const iconOf = (id: string) => `https://rangers.lerico.net/res/gear_icon/${id.replace(/_nm$/, '')}_icon.png`

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params

  const pool = await prisma.gachaGearPool.findUnique({
    where: { id, isActive: true },
    select: {
      id: true, name: true, imageUrl: true,
      gears: true, guaranteedGears: true,
      isChristmas: true, christmasTierRates: true,
    },
  })
  if (!pool) return NextResponse.json({ error: 'ไม่พบตู้กาชา' }, { status: 404 })

  // ── เติม imgUrl จาก gear ID โดยตรง ──
  type GearEntry = {
    id: string; name: string; grade: string; rate: number; type: string
    isChristmas?: boolean
  }
  const rawGears = (Array.isArray(pool.gears) ? pool.gears : []) as GearEntry[]
  const gears = rawGears.map((g) => ({ ...g, imgUrl: g.id ? iconOf(g.id) : null }))

  // ── guaranteed gears: ใช้ id ที่เก็บไว้โดยตรง ──
  type GuaranteedGearEntry = { id: string; name: string; grade: string }
  const rawGuaranteed = (Array.isArray(pool.guaranteedGears) ? pool.guaranteedGears : []) as GuaranteedGearEntry[]
  const guaranteedGears = rawGuaranteed.map((g) => ({
    ...g,
    type: g.id ? getGearType(g.id) : '',
    imgUrl: g.id ? iconOf(g.id) : null,
  }))

  return NextResponse.json({ ...pool, gears, guaranteedGears })
}
