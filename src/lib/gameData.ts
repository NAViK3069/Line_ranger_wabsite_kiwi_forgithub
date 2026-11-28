// ====================================================
// gameData.ts — ข้อมูลเกมของเว็บเราเอง (ถอดจากไฟล์ทางการของเกมรุ่นล่าสุด)
//
// ใช้ฝั่งเซิร์ฟเวอร์ / สคริปต์เท่านั้น (อ่านไฟล์ด้วย fs) — ห้าม import จาก component ฝั่งเบราว์เซอร์
//
// ที่มา: โฟลเดอร์ .gamedata/ (ไม่อยู่ใน git ของ branch หลัก)
//   • เครื่องผู้ดูแล: สคริปต์ส่วนตัวดึงไฟล์ล่าสุดจาก rangers.lerico.net/res/_raw/ มาถอด แล้วเขียนไว้ที่นี่
//   • GitHub Actions: ดึงจาก branch `gamedata` (มีแต่ JSON ที่ถอดแล้ว)
//   db/<ตาราง>.json   = แถวทั้งหมดของตาราง DB ของเกม (ชื่อคอลัมน์ตามเกม · ทศนิยม float32 เขียนแบบสั้นสุดที่ได้ค่าเดิม)
//   lang/<ไฟล์>.json  = { msgType: { ภาษา: { dataCode: ข้อความ } } } ภาษา en / th / zh-Hant
//   manifest.json     = ไฟล์ต้นทางแต่ละตัว (ชื่อ · เวลาอัปเดต · sha256) + จำนวนแถว
//
// ฟังก์ชัน gameRangersBasics / gameSkills / gameAbilities สร้างข้อมูลรูปแบบเดียวกับที่เว็บเคยใช้ (ฟิลด์ชื่อเดิม)
// โค้ดที่อ่านข้อมูลต่อจึงไม่ต้องเปลี่ยน — แต่ค่าเป็นของเกมรุ่นล่าสุดตรงๆ
// ====================================================

import fs from 'fs'
import path from 'path'

export const GAMEDATA_DIR = process.env.GAMEDATA_DIR || path.join(process.cwd(), '.gamedata')

type Row = Record<string, unknown>

const tableCache = new Map<string, Row[]>()

/** มีข้อมูลเกมให้อ่านไหม */
export function hasGameData(): boolean {
  return fs.existsSync(path.join(GAMEDATA_DIR, 'manifest.json'))
}

function readJson<T>(rel: string): T {
  const f = path.join(GAMEDATA_DIR, rel)
  if (!fs.existsSync(f)) {
    throw new Error(`[gameData] ไม่พบ ${f} — ต้องมีโฟลเดอร์ .gamedata (รันสคริปต์อัปเดตข้อมูลเกม หรือดึง branch gamedata)`)
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')) as T
}

export interface GameManifest {
  source: string
  generatedAt: string
  files: Record<string, { file: string; updated?: string; bytes: number; sha256?: string }>
  tables: Record<string, number>
  langs: string[]
  contentHash: string
}
export const gameManifest = (): GameManifest => readJson<GameManifest>('manifest.json')

/** แถวทั้งหมดของตาราง DB ของเกม (แคชไว้ในหน่วยความจำ) */
export function gameTable<T = Row>(name: string): T[] {
  let rows = tableCache.get(name)
  if (!rows) {
    rows = readJson<Row[]>(`db/${name}.json`)
    tableCache.set(name, rows)
  }
  return rows as T[]
}

// ── ข้อความในเกม (ไฟล์ภาษา) ──────────────────────────────────────
type LangFile = Record<string, Record<string, Record<string, string>>>
let langIndex: Map<string, LangFile> | null = null

/** msgType → ไฟล์ภาษาที่มีข้อความชนิดนั้น (สร้างครั้งเดียวจากไฟล์ทั้งหมดใน lang/) */
function langFiles(): Map<string, LangFile> {
  if (langIndex) return langIndex
  langIndex = new Map()
  const dir = path.join(GAMEDATA_DIR, 'lang')
  if (!fs.existsSync(dir)) throw new Error(`[gameData] ไม่พบ ${dir}`)
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as LangFile
    for (const msgType of Object.keys(data)) langIndex.set(msgType, data)
  }
  return langIndex
}

/** รหัสภาษาที่เว็บใช้ → รหัสในไฟล์เกม (zh = จีนตัวเต็ม) */
const LANG_CODE: Record<string, string> = { en: 'en', th: 'th', zh: 'zh-Hant', 'zh-hant': 'zh-Hant', 'zh-Hant': 'zh-Hant' }

/** ข้อความทั้งหมดของ msgType ในภาษานั้น เช่น gameText('th', 'UNIT')['u1317e-brown_nm'] */
export function gameText(lang: string, msgType: string): Record<string, string> {
  const code = LANG_CODE[lang] ?? lang
  return langFiles().get(msgType)?.[msgType]?.[code] ?? {}
}

/**
 * แทน /api/v2/translate?keys=en:UNIT,th:EQUIP ของ lerico — คืนรูปแบบเดียวกัน { "en:UNIT": { code: ข้อความ } }
 * ข้อความดิบจากเกม (ยังมี \n แบบตัวอักษร) — ผู้เรียกทำความสะอาดเองเหมือนเดิม
 * CUSTOM เป็นข้อความที่ lerico เขียนเอง ไม่ได้มาจากเกม → คืนว่าง
 */
export function gameTranslate(keys: string | string[]): Record<string, Record<string, string>> {
  const list = (Array.isArray(keys) ? keys : keys.split(',')).map(k => k.trim()).filter(Boolean)
  const out: Record<string, Record<string, string>> = {}
  for (const key of list) {
    const [lang, type] = key.split(':')
    out[key] = type === 'CUSTOM' ? {} : { ...gameText(lang, type) }
  }
  return out
}

/** Response แบบเดียวกับ fetch ของ lerico translate — ใช้แทนจุดที่เคยเรียก fetch ตรงๆ โดยไม่ต้องรื้อโค้ดอ่านผล */
export function gameTranslateResponse(keys: string | string[]): Response {
  return new Response(JSON.stringify(gameTranslate(keys)), { headers: { 'content-type': 'application/json' } })
}

// ── เรนเจอร์ / สกิล / ความสามารถ (รูปแบบเดิมของ Ranger Book) ─────────────────
/** รหัสว่างในเกมมีทั้ง '' / null / '0' → '' */
const code = (v: unknown): string => (v == null || v === '0' ? '' : String(v))
const iso = (v: unknown): string | null => (typeof v === 'number' && v > 0 ? new Date(v).toISOString() : null)

// ฟิลด์ของเรนเจอร์ที่เว็บใช้ — ตาราง unit (คอลัมน์ชื่อเดียวกัน) + unit_reinforce_rate (ค่าเพิ่มต่อเลเวล)
const UNIT_FIELDS = [
  'unitCode', 'unitNameCode', 'grade', 'unitType', 'productionSpeed', 'summonEnergy', 'unitCategoryType', 'attackRange',
  'attackDelay', 'unitDescriptionCode', 'initialAttack', 'specialAttack', 'defence', 'specialDefence', 'initialHp',
  'movingSpeed', 'unitSpecialAbilityType', 'antiAvoidProb', 'antiSkillAvoidProb', 'attackScope', 'projectileAttackScope',
  'maxLevel', 'criticalProbability', 'criticalRatio', 'avoidProbability', 'skillAvoidProbability', 'skillResistance',
  'attackSpeedType', 'moveSpeedType', 'guardianResourceCode', 'isTranscendentUnit', 'isHyperUnit', 'isAdventUnit',
  'extractionCrystal1Gain', 'extractionCrystal2Gain', 'extractionCrystal3Gain', 'elementOpen', 'unitElement', 'maxLeonardPoint',
] as const
const UNIT_CODE_FIELDS = [
  'iconSkillCode', 'skillCode', 'iconSkillCode2', 'skillCode2', 'iconSkillCode3', 'skillCode3', 'passiveSkillCode',
  'iconAbilityCode', 'abilityCode', 'abilityCategoryCode', 'iconAbilityCode2', 'abilityCode2', 'abilityCategoryCode2',
] as const
const REINFORCE_FIELDS = [
  'attackIncreaseAmount', 'specialAttackDelta', 'generalDefenceDelta', 'specialDefenceDelta', 'hpIncreaseAmount',
  'energyReinforcementRate', 'hpIncreaseAmountMax', 'attackIncreaseAmountMax', 'specialAttackDeltaMax',
  'generalDefenceDeltaMax', 'specialDefenceDeltaMax',
] as const

/** เรนเจอร์ทุกตัว (แทน getRangersBasics) */
export function gameRangersBasics(): Row[] {
  const rate = new Map(gameTable('unit_reinforce_rate').map(r => [r.unitCode as string, r]))
  return gameTable('unit').map(u => {
    const out: Row = {}
    for (const f of UNIT_FIELDS) out[f] = u[f] ?? null
    for (const f of UNIT_CODE_FIELDS) out[f] = code(u[f])
    // จำนวนช่องธาตุที่เปิด — เว็บเทียบเป็นข้อความ "1" / "2" มาตลอด
    out.elementOpen = u.elementOpen == null ? null : String(u.elementOpen)
    const r = rate.get(u.unitCode as string)
    for (const f of REINFORCE_FIELDS) out[f] = r?.[f] ?? 0
    // ค่าความเร็วโจมตีที่เพิ่มต่อเลเวล (ปกติ 0)
    out.attackSpeed = r?.attackSpeedReinforcementRate ?? 0
    out.created = iso(u.created)
    out.modified = iso(u.modified)
    return out
  })
}

const SKILL_FIELDS = [
  'skillCode', 'skillType', 'skillTargetConditionType', 'targetType', 'range', 'nameCode', 'descriptionCode',
  'factorType', 'factorApplyType', 'factor', 'subFactorType', 'subFactorApplyType', 'subFactor', 'buffFactorType',
  'probability', 'iconResourcePath', 'skillDelayTime',
] as const
const splitCodes = (v: unknown): string[] => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [])

/** สกิลทุกตัว (แทน getSkills) — subSkills ขยายเป็นข้อมูลสกิลย่อยเต็มตัวเหมือนเดิม */
export function gameSkills(): Row[] {
  const rows = gameTable('skill')
  const byCode = new Map(rows.map(r => [r.skillCode as string, r]))
  const build = (s: Row, depth: number): Row => {
    const out: Row = {}
    for (const f of SKILL_FIELDS) out[f] = s[f] ?? null
    out.subSkills = depth > 3 ? [] : splitCodes(s.subSkills).map(c => byCode.get(c)).filter((x): x is Row => !!x).map(x => build(x, depth + 1))
    return out
  }
  return rows.map(s => build(s, 0))
}

const ABILITY_FIELDS = [
  'gimmickType', 'actionType', 'nameCode', 'descriptionCode', 'iconResourcePath', 'searchType', 'activeOnType',
  'activeWhenType', 'activeCondition1Type', 'activeCondition1Value', 'activeCondition2Type', 'activeCondition2Value',
  'activeProbability', 'factorType', 'factorApplyType', 'buffFactorType', 'buffFactor', 'subFactorType',
  'subFactorApplyType', 'subBuffFactor',
] as const

/** ความสามารถทุกตัว + บัฟกลุ่ม (แทน /api/v2/abilities) */
export function gameAbilities(): { abilities: Row[]; groupBuffs: Row[] } {
  const rows = gameTable('ability')
  const byCode = new Map(rows.map(r => [r.code as string, r]))
  const build = (a: Row, depth: number): Row => {
    const out: Row = { abilityCode: a.code }
    for (const f of ABILITY_FIELDS) out[f] = a[f] ?? null
    out.talentType = a.aptitudeType ?? null
    out.subAbilities = depth > 3 ? [] : splitCodes(a.subAbilities).map(c => byCode.get(c)).filter((x): x is Row => !!x).map(x => build(x, depth + 1))
    return out
  }
  const groupBuffs = gameTable('group_buff').map(g => ({
    grp_id: g.grp_id, bff_factor_tp: g.bff_factor_tp, bff_apply_tp: g.bff_apply_tp,
    grp2: g.grp2, grp3: g.grp3, grp4: g.grp4, grp5: g.grp5,
    rangers: splitCodes(g.rangers), ability_cd: g.ability_cd ?? null,
  }))
  // ทุกตัว (รวมความสามารถย่อย) — ผู้ใช้ค้นตามรหัส ตัวที่ไม่มีใครอ้างก็ไม่โผล่ที่ไหน
  return { abilities: rows.map(a => build(a, 0)), groupBuffs }
}

// ── ท่าโจมตี / กระสุน / เสียง ของเรนเจอร์ (แทน projectile_data.json ของ warmycat) ─────────
// คอลัมน์ในตาราง unit ตรงๆ — ไม่มีค่าที่เดาเอง:
//   ตีปกติ   attackType · projectileStart/End(X|Y)coord · projectileStart/EndAngle · projectileMoveSpeed · projectileTarget
//   สกิล 1   skillAttackType  · skillProjectile*        · skillCode
//   สกิล 2   skillAttackType2 · skillProjectile*2       · skillCode2 (ไม่มี = skillCode3 — สกิลที่ใช้งานได้ตัวที่สองตามลำดับ)
//   ภาพ      shadowCenterX/Y · faceCenterX/Y · sizeRatio · flightYn · unitPosition
//   จังหวะโดน normalHitPointRate · skill1/2HitPointRate · attackDelay
//   เสียง     attackPreperationSound / attackSound / underAttackSound (+ skill… / skill…2)
// motion = สรุปตามกฎของเกม (ถอดจาก libgame.so — ดู src/lib/animation/gameRules.ts):
//   attackType กลุ่มที่มีกระสุน → CURVE (CCBezierBy + หมุน ANGLE_LERP) / LINEAR (CCMoveBy ไม่หมุน)
//   PUNCH / KICK / SWING / STAB / LASER / ACTION → DIRECT (ไม่มีกระสุน ท่าอยู่ในไฟล์ตัวละคร · BODY_ANIMATION)
//   NONE / ว่าง → NONE
//   enabled = กระสุนบินจริง (มีกระสุน และ moveSpeed > 0) · moveSpeed 0 = วาร์ปถึงเป้าทันที
const BULLET_TYPES = new Set(['ENERGY', 'ENERGYC', 'WEAPON', 'WEAPONC', 'DOUBLE', 'DOUBLEC', 'RETURN', 'BEAM'])
const LINEAR_TYPES = new Set(['WEAPON', 'ENERGY', 'DOUBLE'])
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown): string => (v == null ? '' : String(v))

function gameMotion(attackType: string | null, moveSpeed: number) {
  const bullet = !!attackType && BULLET_TYPES.has(attackType)
  const linear = bullet && LINEAR_TYPES.has(attackType!)
  const direct = !bullet && !!attackType && attackType !== 'NONE'
  const flies = bullet && moveSpeed > 0
  return {
    type: bullet ? (linear ? 'LINEAR' : 'CURVE') : direct ? 'DIRECT' : 'NONE',
    enabled: flies,
    rotation: bullet ? (linear ? 'FIXED' : 'ANGLE_LERP') : direct ? 'BODY_ANIMATION' : 'NONE',
    loopNormal: flies,
  }
}

let unitIndex: Map<string, Row> | null = null
/** แถวของเรนเจอร์ในตาราง unit ตามรหัส */
export function gameUnit(unitCode: string): Row | null {
  if (!unitIndex) unitIndex = new Map(gameTable('unit').map(r => [r.unitCode as string, r]))
  return unitIndex.get(unitCode) ?? null
}

/**
 * ตำแหน่งหน้าของเรนเจอร์ทุกตัว (unit.faceCenterX / faceCenterY) → { รหัส: [x, y] }
 * สัดส่วนของรูปตัวละคร (รูป -thum ของ lerico ตรงกันด้วย): x จากซ้าย · y จากล่าง (แกนแบบ cocos)
 * ตัวที่เกมไม่ได้ใส่ไว้ (0, 0 — ส่วนใหญ่เป็น NPC/มอนสเตอร์) ไม่ใส่ในผลลัพธ์
 */
export function gameRangerFaces(): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {}
  for (const u of gameTable('unit')) {
    const x = num(u.faceCenterX), y = num(u.faceCenterY)
    if (x > 0 && y > 0) out[str(u.unitCode)] = [x, y]
  }
  return out
}

/** ข้อมูลท่าโจมตีของเรนเจอร์ 1 ตัว (รูปแบบเดิมของ /data/ranger/projectile/<id>.json → unit) · ไม่มี = null */
export function gameProjectileUnit(unitCode: string): Row | null {
  const u = gameUnit(unitCode)
  if (!u) return null
  const at = (v: unknown) => (v == null || v === '' ? null : String(v))
  const nAttack = at(u.attackType), s1Attack = at(u.skillAttackType), s2Attack = at(u.skillAttackType2)
  return {
    unitCode: u.unitCode,
    guardianResourceCode: str(u.guardianResourceCode),
    unitName: str(u.unitName),
    grade: u.grade,
    resourceCode: str(u.guardianResourceCode) || u.unitCode,
    useEnemySideResource: num(u.useEnemySideResource),
    render: {
      flightYn: num(u.flightYn), sizeRatio: num(u.sizeRatio, 1), unitPosition: num(u.unitPosition),
      shadowCenter: { x: num(u.shadowCenterX), y: num(u.shadowCenterY) },
      faceCenter: { x: num(u.faceCenterX), y: num(u.faceCenterY) },
    },
    movement: { movingSpeed: num(u.movingSpeed) },
    hitTiming: {
      attackDelay: num(u.attackDelay),
      normalHitPointRate: num(u.normalHitPointRate, 100),
      skill1HitPointRate: num(u.skill1HitPointRate, 100),
      skill2HitPointRate: num(u.skill2HitPointRate, 100),
    },
    bullet: { length: u.bulLength ?? null, duration: u.bulDuration ?? null },
    normal: {
      animationPart: 'bul', attackType: nAttack, attackRange: num(u.attackRange), target: at(u.projectileTarget),
      start: { x: num(u.projectileStartXcoord), y: num(u.projectileStartYcoord) },
      secondStart: { x: num(u.projectileSecondStartX), y: num(u.projectileSecondStartY) },
      end: { x: num(u.projectileEndXcoord), y: num(u.projectileEndYcoord) },
      angle: { start: num(u.projectileStartAngle), end: num(u.projectileEndAngle) },
      moveSpeed: num(u.projectileMoveSpeed), attackScope: num(u.projectileAttackScope),
      motion: gameMotion(nAttack, num(u.projectileMoveSpeed)),
    },
    skill1: {
      animationPart: 'bul2', skillCode: code(u.skillCode), attackType: s1Attack, target: at(u.skillProjectileTarget),
      start: { x: num(u.skillProjectileStartX), y: num(u.skillProjectileStartY) },
      end: { x: num(u.skillProjectileEndX), y: num(u.skillProjectileEndY) },
      angle: { start: num(u.skillProjectileStartAngle), end: num(u.skillProjectileEndAngle) },
      moveSpeed: num(u.skillProjectileMoveSpeed),
      motion: gameMotion(s1Attack, num(u.skillProjectileMoveSpeed)),
    },
    skill2: {
      animationPart: 'bul3', skillCode: code(u.skillCode2) || code(u.skillCode3), attackType: s2Attack, target: at(u.skillProjectileTarget2),
      start: { x: num(u.skillProjectileStartX2), y: num(u.skillProjectileStartY2) },
      end: { x: num(u.skillProjectileEndX2), y: num(u.skillProjectileEndY2) },
      angle: { start: num(u.skillProjectileStartAngle2), end: num(u.skillProjectileEndAngle2) },
      moveSpeed: num(u.skillProjectileMoveSpeed2),
      motion: gameMotion(s2Attack, num(u.skillProjectileMoveSpeed2)),
    },
    effects: {
      baseAttackEffectCode: str(u.baseAttackEffectCode), specialAttackEffectCode: str(u.specialAttackEffectCode),
      skillEffectColor1: u.skillEffectColor1 || null, skillEffectColor2: u.skillEffectColor2 || null,
    },
    sounds: {
      normal: { preparation: str(u.attackPreperationSound), attack: str(u.attackSound), underAttack: str(u.underAttackSound) },
      skill1: { preparation: str(u.skillAttackPreperationSound), attack: str(u.skillAttackSound), underAttack: str(u.skillUnderAttackSound) },
      skill2: { preparation: str(u.skillAttackPreperationSound2), attack: str(u.skillAttackSound2), underAttack: str(u.skillUnderAttackSound2) },
    },
  }
}

// ── ข้อความทางการ (ช่วยจัดรูป) ─────────────────────────────────────────
export type GameLocalized = { en?: string; th?: string }
type Tri = { zh: string; th: string; en: string }
/** "\n" แบบตัวอักษร → ขึ้นบรรทัดจริง · ยุบบรรทัดว่างซ้ำ */
const normText = (s: string | undefined) => (s ?? '').replace(/\\n/g, '\n').replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()
/** ชื่อสั้นในบรรทัดเดียว (ชื่อในไฟล์ภาษาบางตัวมี \n ฝังไว้จัดหน้าในเกม) — ไทย/จีนต่อกันเลย อังกฤษเว้นวรรค */
const oneLine = (s: string | undefined, sep = ' ') => (s ?? '').replace(/\s*(?:\\n|[\r\n]+)\s*/g, sep).replace(/\s+/g, ' ').trim()
function textTri(msgType: string, key: string): Tri {
  return { zh: gameText('zh', msgType)[key] ?? '', th: gameText('th', msgType)[key] ?? '', en: gameText('en', msgType)[key] ?? '' }
}
const loc = (th: string, en: string): GameLocalized | undefined =>
  th || en ? { ...(en ? { en } : {}), ...(th ? { th } : {}) } : undefined
/**
 * คำอธิบายรูปแบบเกม: บรรทัดนำ (เงื่อนไข) ตามด้วยรายการ "* ผล" ทีละบรรทัด
 * บรรทัดที่ไม่มี * ต่อจากรายการ = ข้อความต่อของรายการก่อนหน้า (เกมตัดบรรทัดเพื่อจัดหน้า)
 * sep = ตัวเชื่อมบรรทัดที่ถูกตัด (ไทย/จีนไม่เว้นวรรค · อังกฤษเว้นวรรค)
 */
function splitDesc(text: string, sep: string): { lead: string; bullets: string[] } {
  const lead: string[] = []
  const bullets: string[] = []
  // ไม่ยุบบรรทัดว่างก่อน — บรรทัดว่างแยก "หมายเหตุท้าย" ออกจากรายการผล
  const lines = (text ?? '').replace(/\\n/g, '\n').replace(/\r/g, '').split('\n')
  let blank = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { blank = true; continue }
    // หมายเหตุท้าย (หลังบรรทัดว่าง ขึ้นต้น "-" หรือ "※" เช่น "- Eligible Skill effects: …") ไม่ใช่ผลของทาเลนต์ — จบรายการ
    if (/^※/.test(line) || (blank && bullets.length && /^-/.test(line))) break
    blank = false
    // หัวข้อของเกม: "*" (ส่วนใหญ่) · บางข้อความภาษาอังกฤษใช้ "- " (เช่น ab_tlt_1641 ขณะที่ไทย/จีนใช้ "*")
    if (/^(?:[*＊•]|-(?=\s|[A-Za-z]))/.test(line)) bullets.push(line.replace(/^(?:[*＊•]|-)\s*/, ''))
    else if (bullets.length) bullets[bullets.length - 1] += sep + line
    else lead.push(line)
  }
  return { lead: lead.join(sep).replace(/\s+/g, ' ').trim(), bullets: bullets.map(b => b.replace(/\s+/g, ' ').trim()) }
}
/** สัดส่วน → เปอร์เซ็นต์ (รูปแบบเดิมของเว็บ: จำนวนเต็มเท่าของ 100% ไม่มีทศนิยม · นอกนั้นทศนิยม 1 ตำแหน่ง) */
const pct = (v: number) => (Number.isInteger(v) ? `${v * 100}%` : `${(v * 100).toFixed(1)}%`)
const pctRange = (a: number, b: number) => (a === b ? pct(b) : `${pct(a)} ~ ${pct(b)}`)
const sec = (v: number) => `${v}秒`

// ── ทาเลนต์ (แทน 才能 ของ warmycat) ──────────────────────────────────────
// unit.talentGroup → tlnt_grp (ขั้น 1 = ทาเลนต์หลัก · ขั้น 2–4 = ทาเลนต์เสริม) → tlnt
//   ทาเลนต์หลัก = ability majorTalentAbilityCode (ab_tlt_N): โอกาสเกิด activeProbability
//                ความสามารถย่อย (_a, _b …) = ผลแต่ละข้อ ตามลำดับรายการ "*" ในคำอธิบาย
//                ข้อความ = ABILITY:<ab_tlt_N>_desc ของเกม (บรรทัดนำ = เงื่อนไข · รายการ * = ผล)
//   ทาเลนต์เสริม = enhanceType + enhanceVal → ชื่อสเตตัสทางการ EQUIP:GEAR_ATTR_<type>_nm + ค่า
export interface GameTalent {
  hasTalent: boolean
  primary?: {
    description: string
    descriptionTh?: string
    descriptionEn?: string
    triggerRate: string
    condition: string
    conditionTemplate: string
    conditionL?: GameLocalized
    buffs: { triggerRate: string; effect: string; template: string; effectL?: GameLocalized }[]
  }
  enhanced?: string[]
  enhancedL?: (GameLocalized | null)[]
  /** ค่าดิบของทาเลนต์เสริม (ชนิด + ค่า) — ใช้คำนวณค่าพลัง ไม่ต้องอ่านจากข้อความ */
  enhancedStats?: { type: string; value: number }[]
}

let abilityIndex: Map<string, Row> | null = null
const gameAbility = (c: string): Row | null => {
  if (!abilityIndex) abilityIndex = new Map(gameTable('ability').map(a => [a.code as string, a]))
  return abilityIndex.get(c) ?? null
}

export function gameTalent(unitCode: string): GameTalent {
  const u = gameUnit(unitCode)
  const groupId = u ? code(u.talentGroup) : ''
  if (!groupId) return { hasTalent: false }
  const g = gameTable('tlnt_grp').find(r => r.id === groupId)
  const tl = new Map(gameTable('tlnt').map(t => [t.keyCode as string, t]))
  const major = g ? tl.get(code(g.talentCodeStep1)) : undefined
  const ab = major ? gameAbility(code(major.majorTalentAbilityCode)) : null
  if (!g || !major || !ab) return { hasTalent: false }
  const desc = textTri('ABILITY', `${ab.code}_desc`)
  // ไม่มีข้อความทางการสักภาษา = ยูนิตฝั่งศัตรู/ทดสอบ ไม่ใช่ทาเลนต์ที่ผู้เล่นเห็น
  if (!desc.zh && !desc.th && !desc.en) return { hasTalent: false }
  const zh = splitDesc(desc.zh, ''), th = splitDesc(desc.th, ''), en = splitDesc(desc.en, ' ')
  const subs = splitCodes(ab.subAbilities).sort().map(c => gameAbility(c)).filter((x): x is Row => !!x)
  const n = Math.max(zh.bullets.length, th.bullets.length, en.bullets.length)
  const rootProb = num(ab.activeProbability, 1)
  // คำอธิบายแบบประโยคเดียว (ไม่มีรายการ *) = ผลเดียว ข้อความคือทั้งประโยค
  const items = n
    ? Array.from({ length: n }, (_, i) => ({ zh: zh.bullets[i] ?? '', th: th.bullets[i] ?? '', en: en.bullets[i] ?? '' }))
    : [{ zh: zh.lead, th: th.lead, en: en.lead }]
  const buffs = items.map((t, i) => ({
    triggerRate: pct(num(subs[i]?.activeProbability, rootProb)),
    effect: t.zh, template: t.zh,
    ...(loc(t.th, t.en) ? { effectL: loc(t.th, t.en) } : {}),
  }))
  const equipZh = gameText('zh', 'EQUIP'), equipTh = gameText('th', 'EQUIP'), equipEn = gameText('en', 'EQUIP')
  const enh = [2, 3, 4].map(s => tl.get(code(g[`talentCodeStep${s}`]))).filter((t): t is Row => !!t && !!t.enhanceType)
  const enhanced: string[] = [], enhancedL: (GameLocalized | null)[] = [], enhancedStats: { type: string; value: number }[] = []
  for (const t of enh) {
    const type = String(t.enhanceType), v = num(t.enhanceVal)
    const mul = /_MUL$/.test(type)
    const key = `GEAR_ATTR_${type}_nm`
    const valZh = mul ? `${(v * 100).toFixed(1)}%` : String(v)
    const val = mul ? `${+(v * 100).toFixed(2)}%` : String(v)
    enhanced.push(`${oneLine(equipZh[key], '') || type}+${valZh}`)
    const nTh = oneLine(equipTh[key], ''), nEn = oneLine(equipEn[key])
    enhancedL.push(loc(nTh ? `${nTh} +${val}` : '', nEn ? `${nEn} +${val}` : '') ?? null)
    enhancedStats.push({ type, value: v })
  }
  return {
    hasTalent: true,
    primary: {
      description: normText(desc.zh),
      ...(desc.th ? { descriptionTh: normText(desc.th) } : {}),
      ...(desc.en ? { descriptionEn: normText(desc.en) } : {}),
      triggerRate: pct(rootProb),
      // บรรทัดนำของคำอธิบาย = เงื่อนไขที่ผลเกิด (มีเฉพาะคำอธิบายแบบมีรายการ * — แบบประโยคเดียวไม่แยกเงื่อนไข)
      condition: n ? zh.lead : '',
      conditionTemplate: n ? zh.lead : '',
      ...(n && loc(th.lead, en.lead) ? { conditionL: loc(th.lead, en.lead) } : {}),
      buffs,
    },
    enhanced, enhancedL, enhancedStats,
  }
}

// ── ความสามารถตื่นพลัง (แทน 覺醒能力 ของ warmycat) ─────────────────────────────
// unit.awakeYn = 1 + unit.awakeAbilityGroup → awake_ability_group: สูงสุด 5 ความสามารถ (โค้ด aab… + อัตราได้รับ)
export interface GameAwakenAbility { code: string; categoryCode: string; rate: number; icon: string }
export function gameAwakenAbilities(unitCode: string): GameAwakenAbility[] {
  const u = gameUnit(unitCode)
  if (!u || Number(u.awakeYn) !== 1) return []
  const g = gameTable('awake_ability_group').find(r => r.id === u.awakeAbilityGroup)
  if (!g) return []
  const out: GameAwakenAbility[] = []
  for (let i = 1; i <= 5; i++) {
    const c = code(g[`awakeAbilityCode${i}`])
    if (!c || !c.startsWith('aab')) continue
    const a = gameAbility(c)
    out.push({
      code: c, categoryCode: code(g[`awakeAbilityCategoryCode${i}`]), rate: num(g[`awakeAbilityRate${i}`]),
      icon: typeof a?.iconResourcePath === 'string' && a.iconResourcePath ? a.iconResourcePath : `${c.slice(1)}_icon.png`,
    })
  }
  return out
}

// ── Spec+ ของเกียร์ 9★ (แทน 裝備資料庫 ของ warmycat) ────────────────────────────
// game_item_equip.specialOptionCode → eqip_spcl_opt:
//   ชื่อ titleLangCode · คำอธิบาย normalDescLangCode / specialDescLangCode (EQUIP — มี %s / {$Np} / {$Nf} ให้แทนค่า)
//   ค่าพื้นฐาน normalAttrNo (unit_eqip_attr: ชนิด + min~max) + normalAttrEnchantIncrease ต่อระดับ
//   ผลพิเศษ equipTalentCode → eqip_tlnt_attr: แถวราก (target = root) = โอกาสเกิด · แถวลูก = ผลที่เกิด
//     activeProbability (โอกาสของผล) · buffFactor (สัมประสิทธิ์) · subBuffFactor (เวลา วินาที · ≤ 0 = ไม่มีเวลา) · *EnchantIncrease ต่อระดับ
// รูปแบบตัวเลขเหมือนเดิม (หน้าเว็บอ่านค่าสูงสุดของช่วง + ค่าต่อระดับ): "50.0% ~ 60.0%" · "100%" · "1.5秒 ~ 2秒" · "-"
export interface GameGearSpec {
  hasSpec: boolean
  name?: string
  nameTh?: string
  nameEn?: string
  descTemplatesTh?: string[]
  descTemplatesEn?: string[]
  basic?: { stat: string; value: string; perLevel?: string; statL?: GameLocalized }[]
  special?: {
    description: string
    triggerRate: string
    condition: string
    triggerEffect: {
      triggerRate: string; triggerRatePerLevel?: string
      effect: string
      coef: string; coefPerLevel?: string
      time: string; timePerLevel?: string
    } | null
  } | null
}

export function gameGearSpec(itemCode: string): GameGearSpec {
  const eq = gameTable('game_item_equip').find(e => e.itemCode === itemCode)
  const so = eq ? gameTable('eqip_spcl_opt').find(s => s.specialOptionCode === eq.specialOptionCode) : undefined
  if (!eq || !so || isTestItem(itemCode)) return { hasSpec: false }
  const name = textTri('EQUIP', String(so.titleLangCode))
  const d1 = textTri('EQUIP', String(so.normalDescLangCode)), d2 = textTri('EQUIP', String(so.specialDescLangCode))
  // basic
  const attr = gameTable('unit_eqip_attr').find(a => a.attrNo === so.normalAttrNo)
  const basic: NonNullable<GameGearSpec['basic']> = []
  if (attr) {
    const type = String(attr.reinforceType)
    const mul = /_MUL$/.test(type)
    const mn = num(attr.minValue), mx = num(attr.maxValue), inc = num(so.normalAttrEnchantIncrease)
    const key = `GEAR_ATTR_${type}_nm`
    const st = textTri('EQUIP', key)
    basic.push({
      stat: oneLine(st.zh, '') || type,
      value: mul ? pctRange(mn, mx) : mn === mx ? mx.toFixed(1) : `${mn.toFixed(1)} ~ ${mx.toFixed(1)}`,
      perLevel: mul ? pct(inc) : inc.toFixed(1),
      ...(loc(oneLine(st.th, ''), oneLine(st.en)) ? { statL: loc(oneLine(st.th, ''), oneLine(st.en)) } : {}),
    })
  }
  // special
  const rows = gameTable('eqip_tlnt_attr').filter(t => t.equipTalentCode === so.equipTalentCode)
  const root = rows.find(r => r.targetAbilityCode === r.rootAbilityCode)
  const eff = rows.filter(r => r.targetAbilityCode !== r.rootAbilityCode).sort((a, b) => String(a.targetAbilityCode).localeCompare(String(b.targetAbilityCode)))[0]
  let special: GameGearSpec['special'] = null
  if (root) {
    let triggerEffect: NonNullable<GameGearSpec['special']>['triggerEffect'] = null
    if (eff) {
      const bMin = num(eff.buffFactorMin), bMax = num(eff.buffFactorMax), bInc = num(eff.buffFactorEnchantIncrease)
      const tMin = num(eff.subBuffFactorMin), tMax = num(eff.subBuffFactorMax), tInc = num(eff.subBuffFactorEnchantIncrease)
      // สัมประสิทธิ์เป็น "วินาที" เอง (เช่น ลดเวลาสถานะ) = คำอธิบายใช้ {$Nf} และผลไม่มีเวลาของตัวเอง
      const coefSec = tMax <= 0 && /\{\$\d+f\}/.test(d2.en || d2.th || d2.zh)
      triggerEffect = {
        triggerRate: pctRange(num(eff.activeProbabilityMin), num(eff.activeProbabilityMax)),
        triggerRatePerLevel: pct(num(eff.activeProbabilityEnchantIncrease)),
        effect: '',
        coef: coefSec ? (bMin === bMax ? sec(bMax) : `${sec(bMin)} ~ ${sec(bMax)}`) : pctRange(bMin, bMax),
        coefPerLevel: coefSec ? sec(bInc) : pct(bInc),
        time: tMax <= 0 ? '-' : tMin === tMax ? sec(tMax) : `${sec(tMin)} ~ ${sec(tMax)}`,
        timePerLevel: sec(tInc),
      }
    }
    special = {
      description: normText(d2.zh),
      triggerRate: pctRange(num(root.activeProbabilityMin), num(root.activeProbabilityMax)),
      // เงื่อนไข/ชื่อผลไม่มีข้อความแยกในเกม — อยู่ในคำอธิบายทางการ (descTemplates) ทั้งประโยค
      condition: '',
      triggerEffect,
    }
  }
  const th = [d1.th, d2.th].filter(Boolean), en = [d1.en, d2.en].filter(Boolean)
  return {
    hasSpec: basic.length > 0 || !!special,
    name: oneLine(name.zh, '') || undefined,
    ...(name.th ? { nameTh: oneLine(name.th, '') } : {}),
    ...(name.en ? { nameEn: oneLine(name.en) } : {}),
    ...(th.length ? { descTemplatesTh: th } : {}),
    ...(en.length ? { descTemplatesEn: en } : {}),
    basic,
    special,
  }
}

// ── สายวิวัฒนาการ (แทน evolveChain ของ /api/getRanger ของ lerico) ──────────────
/** ลิงก์ร่างถัดไปในตาราง unit — ลำดับนี้คือลำดับที่ลูกของร่างหนึ่งถูกเรียงในสาย */
const EVOLVE_LINKS = ['unitCodeAfterEvolution', 'unitCodeAfterTranscendence', 'unitCodeAfterHyper'] as const
let evolveIndex: { children: Map<string, string[]>; parent: Map<string, string> } | null = null

function evolveGraph() {
  if (evolveIndex) return evolveIndex
  const units = gameTable('unit')
  const exists = new Set(units.map(u => u.unitCode as string))
  const children = new Map<string, string[]>()
  const parent = new Map<string, string>()
  for (const u of units) {
    const id = u.unitCode as string
    const kids: string[] = []
    for (const f of EVOLVE_LINKS) {
      const next = code(u[f])
      if (next && next !== id && exists.has(next) && !kids.includes(next)) kids.push(next)
    }
    children.set(id, kids)
    for (const k of kids) if (!parent.has(k)) parent.set(k, id)
  }
  evolveIndex = { children, parent }
  return evolveIndex
}

/**
 * ทุกร่างในสายวิวัฒนาการของเรนเจอร์ตัวนี้ — เริ่มจากร่างแรกสุด ไล่ทีละชั้น (วิวัฒนาการ → ปลดร่าง → ไฮเปอร์)
 * ไม่มีสาย = [ตัวเอง]
 */
export function gameEvolveChain(unitCode: string): string[] {
  const { children, parent } = evolveGraph()
  if (!children.has(unitCode)) return []
  let root = unitCode
  const seen = new Set<string>([root])
  while (parent.has(root) && !seen.has(parent.get(root)!)) { root = parent.get(root)!; seen.add(root) }
  const out: string[] = []
  const queue = [root]
  const visited = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    out.push(id)
    for (const k of children.get(id) ?? []) if (!visited.has(k)) queue.push(k)
  }
  return out
}

// ── เกียร์ (แทน /api/v2/equipments) ──────────────────────────────
const EQUIP_FIELDS = [
  'itemCode', 'itemNameCode', 'advanceAbleYn', 'attr1', 'attr2', 'attr3', 'attr4', 'equipGrade', 'equipType',
  'extractionCrystal1Gain', 'extractionCrystal2Gain', 'extractionCrystal3Gain', 'nextItemCode', 'goodGearYn',
  'goodGearAttr', 'switchCode', 'skillPlusAttr1', 'skillPlusAttr2',
] as const
/** ไอเทมทดสอบของทีมพัฒนา (eq_acc_test_017 …) — ไม่มีในเกมจริง */
const isTestItem = (itemCode: unknown) => typeof itemCode === 'string' && /test/i.test(itemCode)
const nz = (v: unknown) => (v === undefined ? null : v)

export interface GameEquipments {
  equipments: Row[]
  attributes: Row[]
  spAttributes: Row[]
  randomOptions: Row[]
  unlimitEffects: Row[]
}

/**
 * ข้อมูลเกียร์ทั้งชุด รูปแบบเดิมของ Gear Book:
 *   equipments    = game_item_equip (ตัดไอเทมทดสอบ)
 *   attributes    = unit_eqip_attr (ค่าออปชันพื้นฐาน/สุ่ม)
 *   randomOptions = eqip_rand_opt (ออปชันที่สุ่มได้ของแต่ละกลุ่ม)
 *   unlimitEffects= eqip_unlimit (ค่าที่เพิ่มตามจำนวนครั้งที่ปลดลิมิต)
 *   spAttributes  = unit_eqip_skl_plus_attr + ชนิดสกิลที่ได้ผล (eqip_skl_plus_grp — แยกแถวตาม skillType/buffFactorType/targetFactorType)
 *                   + ค่าที่เพิ่มต่อขั้นอัปเกรด (eqip_skl_plus_upgrd เรียงตามขั้น)
 */
export function gameEquipments(): GameEquipments {
  const equipments = gameTable('game_item_equip').filter(e => !isTestItem(e.itemCode)).map(e => {
    const out: Row = {}
    for (const f of EQUIP_FIELDS) out[f] = nz(e[f])
    // เกมเขียน "false" แทน "ไม่มีเกียร์ขั้นถัดไป"
    if (out.nextItemCode === 'false') out.nextItemCode = ''
    return out
  })
  const attributes = gameTable('unit_eqip_attr').map(a => ({
    attrNo: a.attrNo, unitEquipRandOptTrigType: nz(a.unitEquipRandOptTrigType), reinforceType: a.reinforceType,
    valueDivideGrades: a.valueDivideGrades, minValue: a.minValue, maxValue: a.maxValue,
  }))
  const randomOptions = gameTable('eqip_rand_opt').map(r => ({ attrNo: r.attrNo, groupCode: r.groupCode, weight: r.weight }))
  const unlimitEffects = gameTable('eqip_unlimit').map(u => ({
    rand_opt_trig_tp: u.rand_opt_trig_tp, reinf_tp: u.reinf_tp, unlimit_cnt: u.unlimit_cnt, stat_inc_amt: u.stat_inc_amt,
  }))
  const upgrades = new Map<unknown, Row[]>()
  for (const u of gameTable('eqip_skl_plus_upgrd')) {
    const list = upgrades.get(u.attr_no) ?? []
    list.push(u)
    upgrades.set(u.attr_no, list)
  }
  const groups = new Map<unknown, Row[]>()
  // ทุกแถวของ eqip_skl_plus_grp = สกิลที่ SKILL+ ตัวนี้ได้ผล (skillType + factorType + buffFactorType ต้องตรงกับสกิล
  // หลัก (MAIN) หรือสกิลย่อย (SUB) ของเรนเจอร์) — เก็บครบทุกแถวไว้ใน matchRows ให้ฝั่งเว็บเทียบกับตาราง skill ได้ตรงๆ
  const matchRows = new Map<unknown, Row[]>()
  for (const g of gameTable('eqip_skl_plus_grp')) {
    const list = groups.get(g.attrNo) ?? []
    // แถวที่ต่างกันแค่ factorType นับเป็นผลเดียวกัน (ชนิดสกิล + บัฟ + เป้า เดียวกัน)
    if (!list.some(x => x.skillType === g.skillType && x.buffFactorType === g.buffFactorType && x.targetFactorType === g.targetFactorType)) list.push(g)
    groups.set(g.attrNo, list)
    const rows = matchRows.get(g.attrNo) ?? []
    rows.push({ skillType: g.skillType, factorType: g.factorType, buffFactorType: g.buffFactorType, target: g.targetFactorType })
    matchRows.set(g.attrNo, rows)
  }
  const spAttributes: Row[] = []
  for (const s of gameTable('unit_eqip_skl_plus_attr')) {
    const inc = (upgrades.get(s.attrNo) ?? []).slice().sort((a, b) => Number(a.upgrd_cnt) - Number(b.upgrd_cnt)).map(u => u.stat_inc_amt)
    for (const g of groups.get(s.attrNo) ?? []) {
      spAttributes.push({
        attrNo: s.attrNo, skillType: g.skillType, buffFactorType: g.buffFactorType, targetFactorType: g.targetFactorType,
        stat_inc_amt: inc, skillFactorApplyType: s.skillFactorApplyType,
        minValue: s.minValue, maxValue: s.maxValue, valueDivideGrades: s.valueDivideGrades,
        targetFactor: s.targetFactor, attrNumberGroup: s.attrNumberGroup ?? s.attrNo,
        matchRows: matchRows.get(s.attrNo) ?? [],
      })
    }
  }
  return { equipments, attributes, spAttributes, randomOptions, unlimitEffects }
}
