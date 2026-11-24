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
  for (const g of gameTable('eqip_skl_plus_grp')) {
    const list = groups.get(g.attrNo) ?? []
    // แถวที่ต่างกันแค่ factorType นับเป็นผลเดียวกัน (ชนิดสกิล + บัฟ + เป้า เดียวกัน)
    if (!list.some(x => x.skillType === g.skillType && x.buffFactorType === g.buffFactorType && x.targetFactorType === g.targetFactorType)) list.push(g)
    groups.set(g.attrNo, list)
  }
  const spAttributes: Row[] = []
  for (const s of gameTable('unit_eqip_skl_plus_attr')) {
    const inc = (upgrades.get(s.attrNo) ?? []).slice().sort((a, b) => Number(a.upgrd_cnt) - Number(b.upgrd_cnt)).map(u => u.stat_inc_amt)
    for (const g of groups.get(s.attrNo) ?? []) {
      spAttributes.push({
        attrNo: s.attrNo, skillType: g.skillType, buffFactorType: g.buffFactorType, targetFactorType: g.targetFactorType,
        stat_inc_amt: inc, skillFactorApplyType: s.skillFactorApplyType,
        minValue: s.minValue, maxValue: s.maxValue, valueDivideGrades: s.valueDivideGrades,
      })
    }
  }
  return { equipments, attributes, spAttributes, randomOptions, unlimitEffects }
}
