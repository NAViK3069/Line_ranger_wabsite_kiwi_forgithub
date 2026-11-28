// GET /api/main-stage/[stage] — ศัตรูของด่านนั้นแบ่งตามช่วง (stage_ai → stage_productline) · รันเฉพาะตอน build
import { NextResponse } from 'next/server'
import { mainStageDetail } from '@/lib/mainStage'

export async function GET(_req: Request, { params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params
  if (!/^[a-z]{2}\d+$/.test(stage ?? '')) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  const detail = mainStageDetail(stage)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}
