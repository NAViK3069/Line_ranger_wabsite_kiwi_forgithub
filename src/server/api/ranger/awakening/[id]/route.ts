// ====================================================
// GET /api/ranger/awakening/[id]
// คืนความสามารถตื่นพลัง (Awakening Abilities) ของเรนเจอร์ จากข้อมูลเกมของเรา
//   unit.awakeYn = 1 + unit.awakeAbilityGroup → awake_ability_group (สูงสุด 5 ความสามารถ — src/lib/gameData.ts)
//   ชื่อ / คำอธิบาย = ABILITY:<code>_nm / _desc ของไฟล์ภาษาเกม (en + zh · ไทยฝั่ง client ใช้ tAbility จากชุดแปลเดียวกัน)
//   ไอคอน = ability.iconResourcePath (ไฟล์รูปยังโหลดจาก lerico /res)
// เดิมใช้ Rangers_data.json + 能力.json ของ warmycat — ตรวจแล้วโค้ด/ชื่อ/คำอธิบาย/ไอคอนตรงกันทุกตัว
// ====================================================

import { NextResponse } from 'next/server'
import { gameAwakenAbilities, gameText } from '@/lib/gameData'

const LERICO_ICON = (icon: string) => `https://rangers.lerico.net/res/ability_icon/${icon}`

export interface AwakenAbility {
  code: string      // e.g. "aab213_lastatk"
  nameEn: string    // ชื่ออังกฤษทางการ (ABILITY:<code>_nm)
  descEn: string    // คำอธิบายอังกฤษทางการ
  nameZh: string    // ชื่อจีน (TH fallback via tAbility())
  descZh: string    // คำอธิบายจีน (TH fallback via tAbilityDesc())
  iconUrl: string   // from lerico res
}

export interface AwakenAbilityResponse {
  rangerId: string
  abilities: AwakenAbility[]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || !/^[a-z0-9_-]+$/i.test(id))
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const en = gameText('en', 'ABILITY'), zh = gameText('zh', 'ABILITY')
  const abilities: AwakenAbility[] = gameAwakenAbilities(id.toLowerCase()).map(a => ({
    code: a.code,
    nameEn: en[`${a.code}_nm`] ?? '',
    descEn: en[`${a.code}_desc`] ?? '',
    nameZh: zh[`${a.code}_nm`] ?? '',
    descZh: zh[`${a.code}_desc`] ?? '',
    iconUrl: LERICO_ICON(a.icon),
  }))
  const payload: AwakenAbilityResponse = { rangerId: id, abilities }
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=604800, s-maxage=604800' },
  })
}
