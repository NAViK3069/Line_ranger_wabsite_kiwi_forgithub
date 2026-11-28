// ====================================================
// GET /api/translations/[lang]
// คืนข้อความทุกประเภทในภาษาที่ระบุ (ไฟล์ภาษาของเกมรุ่นล่าสุด — src/lib/gameData.ts)
//
// ?only=names → คืนเฉพาะชื่อเรนเจอร์ ({ "<id>_nm": "ชื่อ" })
//   bundle เต็มหนัก ~3MB แต่ชื่อเรนเจอร์ล้วนๆ ~180KB
//   ใช้ตอนค้นหาข้ามภาษา (อยู่โหมด EN แล้วพิมพ์ไทย) ซึ่งไม่ต้องใช้อย่างอื่นเลย
//
// รันเฉพาะตอน build (scripts/emit-data.ts)
// ====================================================

import { NextRequest, NextResponse } from 'next/server'
import { gameText } from '@/lib/gameData'

const SUPPORTED_LANGS = ['en', 'th'] as const
type Lang = typeof SUPPORTED_LANGS[number]

// CUSTOM = ข้อความที่ lerico เขียนเอง (ไม่ได้มาจากเกม) — คืนว่างเสมอ (ไม่มีหน้าไหนใช้ แต่คงคีย์ไว้ให้หน้าตา JSON เดิม)
const TRANSLATION_TYPES = ['UNIT', 'EQUIP', 'SKILL', 'ABILITY', 'PROPERTIES', 'CUSTOM'] as const

interface TranslationBundle {
  lang: Lang
  units:      Record<string, string>
  equips:     Record<string, string>
  skills:     Record<string, string>
  abilities:  Record<string, string>
  properties: Record<string, string>
  custom:     Record<string, string>
}

function fetchOneType(lang: Lang, type: string): Record<string, string> {
  if (type === 'CUSTOM') return {}
  // ทำความสะอาด: ลบ \n, collapse spaces
  //   ชื่อ (_nm) ภาษาไทย/จีน: เกมตัดบรรทัดกลางคำเพื่อจัดหน้า → ต่อกันเลย ไม่เว้นวรรค
  //   (เช่น SKILL+ "เพิ่มความเร็ว\nการเคลื่อนที่ N%" → "เพิ่มความเร็วการเคลื่อนที่ N%") · คำอธิบาย/อังกฤษ เว้นวรรคตามเดิม
  const joinTight = lang !== 'en'
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(gameText(lang, type))) {
    if (typeof v === 'string') {
      const sep = joinTight && k.endsWith('_nm') ? '' : ' '
      out[k] = v.replace(/\s*(?:\\n|\n)\s*/g, sep).replace(/\s+/g, ' ').trim()
    }
  }
  return out
}

// ชื่อเรนเจอร์ = unit key ที่ลงท้าย _nm
function namesOnly(units: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(units)) if (k.endsWith('_nm')) out[k] = v
  return out
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params
  const lang = rawLang.toLowerCase() as Lang

  if (!SUPPORTED_LANGS.includes(lang)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  const [units, equips, skills, abilities, properties, custom] = TRANSLATION_TYPES.map(t => fetchOneType(lang, t))

  if (req.nextUrl.searchParams.get('only') === 'names') return NextResponse.json(namesOnly(units))

  const bundle: TranslationBundle = { lang, units, equips, skills, abilities, properties, custom }
  return NextResponse.json(bundle)
}
