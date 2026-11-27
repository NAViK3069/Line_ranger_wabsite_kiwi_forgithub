// ====================================================
// Infinity Tower (โหมด endless ของเกม) — สร้างจากข้อมูลเกมของเราทั้งหมด (Node-only, ใช้ตอน build)
//
// ตารางเกม:
//   endless_floor_renewal       ชั้น 1–330: ประเภทด่าน, กลไก (gimmick), ระยะสนาม, เวลา, บอส, รางวัลผ่านชั้น
//   new_endless_floor_mission   ภารกิจ 3 ข้อต่อชั้น (missionCode + missionValue + รางวัล)
//   endless_ai                  ชั้น → productionLine (ชุดศัตรู)
//   endless_product_line        ศัตรูแต่ละช่อง: เวลาออกครั้งแรก, ช่วงเกิดใหม่, จำนวนสูงสุด, สเตตัส
//   mini_gacha_info             หีบ (MINI_GACHA) → box_cd = รูปไอคอน pop_gift_icon_<box_cd>.png
//   unit / game_item            ชื่อ/ชนิด/ธาตุของศัตรู · ชนิดไอเทมรางวัล
// ข้อความ = ไฟล์ภาษาของเกม (lang_area ENDLESS, lang_etc ITEM/MINI_GACHA, lang_unit UNIT) — ไม่มีการแต่งเอง
//
// จาก libgame.so (12.4.2):
//   ตัวโหลดชั้น 0x128af60 อ่านคอลัมน์ข้างบน → กลไกเก็บเป็น dictionary key 1 = gimmickMineralMax,
//   2 = gimmickMineralRegen, 3 = gimmickUnitDebuff (CCFloat) และ 4 = gimmickElement ("fire_up" → แยกที่ "_")
//   หน้าต่างกลไกของเกม (0x128bd00) แสดงแค่ไอคอน + endless_gimmick_title_%d / desc_%d (ไม่มีตัวเลข)
//   ไอคอน: endless_gimmick_icon_mineralmax / mineralregen / unitdebuff / endless_gimmick_icon_%s_%s.png
//   ค่ากลไก = ตัวคูณ (ชั้นแรก 0.8 → ชั้นสูง 0.4 ยิ่งน้อยยิ่งยาก) → แสดงเป็น "ลดลง (1 − ค่า) × 100%"
//
// ข้อความที่ซ้ำกันทุกชั้น (ภารกิจ / กลไก / ไอเทม / ประเภทด่าน / ชื่อชั้น) เก็บครั้งเดียว แล้วชั้นอ้างด้วย key
// ====================================================

import { gameTable, gameText } from './gameData'

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (v == null ? '' : String(v))

export interface TText { en: string; th: string }
/** รูปจาก atlas ของเกม (plist + png) หรือไฟล์รูปเดี่ยว */
export type TIcon = { atlas: AtlasKey; frame: string } | { url: string }
/** atlas ที่หน้าใช้ — client แปลงเป็น URL เอง (lerico ผ่าน Worker / ของเราใน /gameres) */
export type AtlasKey = 'main' | 'mission' | 'ui' | 'popup' | 'minigacha' | 'endlesspopup'

/** ไอเทมรางวัล (เก็บครั้งเดียวใน TowerIndex.items — key = "<rewardType>:<code>") */
export interface TItem { type: string; code: string; name: TText; icon: TIcon | null }
export interface TReward { item: string; amount: number }
/** ภารกิจ: ข้อความ/ไอคอนอยู่ที่ TowerIndex.missions[code] · value แทน %d */
export interface TMission { no: number; code: string; value: number | null; reward: TReward }
/** กลไก (เก็บครั้งเดียวใน TowerIndex.gimmicks — key = kind หรือ "element:<ธาตุ>_<up|down>") */
export interface TGimmickInfo {
  kind: 'mineralMax' | 'mineralRegen' | 'unitDebuff' | 'element'
  element?: string; dir?: 'up' | 'down'
  title: TText; desc: TText; icon: TIcon
}
/** กลไกของชั้น · value = ตัวคูณของเกม (0.4 = เหลือ 40% → ลด 60%) · กลไกธาตุไม่มีตัวเลข */
export interface TGimmick { key: string; value: number | null }
export type TBattle = 'OFFENCE' | 'TIMEATTACK' | 'SIEGE' | 'BOSS'
export interface TBattleInfo { title: TText; desc: TText; gate: TIcon; icon: TIcon }
export interface TFloor {
  no: number; code: string; battle: TBattle
  /** ชื่อชั้นของเกม (fl<N>_nm) — key ใน TowerIndex.names */
  name: string
  needHeart: number; distance: number | null
  /** ชาวเมืองที่ต้องช่วย (ด่านช่วยเหลือ) · เวลาจำกัด (วินาที) */
  saveCount: number | null; timeLimit: number | null
  /** ช่วงเวลาที่ชาวเมือง (Sally) โผล่ — วินาที */
  sally: [number, number] | null
  boss: { unitCode: string; name: TText; moveTime: number | null; backRate: number | null } | null
  enemyTowerHp: number | null
  reward: { exp: number; coin: number; unitExp: number; item: TReward | null }
  missions: TMission[]
  gimmicks: TGimmick[]
  enemyCount: number
}
export interface TEnemy {
  slot: number; unitCode: string; name: TText; type: string; element: string; boss: boolean
  level: number; initDelay: number; minSec: number; maxSec: number; maxCount: number; unique: boolean
  range: number; splash: number
  hp: number; attack: number; specialAttack: number; defence: number; specialDefence: number
  critRate: number; critRatio: number; avoid: number; skillAvoid: number; skillResist: number
  antiAvoid: number; antiSkillAvoid: number
}
export interface TowerIndex {
  floors: TFloor[]
  battles: Record<TBattle, TBattleInfo>
  names: Record<string, TText>
  missions: Record<string, { text: TText; icon: TIcon }>
  gimmicks: Record<string, TGimmickInfo>
  items: Record<string, TItem>
  /** ข้อความหัวข้อจากเกม (ENDLESS_*) */
  ui: Record<string, TText>
}

// ── ข้อความ ──
const clean = (s: string) => s.replace(/\\n|\r?\n/g, ' ').replace(/[ \t]+/g, ' ').trim()
type Tx = { en: Record<string, string>; th: Record<string, string> }
const texts = (msgType: string): Tx => ({ en: gameText('en', msgType), th: gameText('th', msgType) })
function pick(t: Tx, key: string, fallback = ''): TText {
  const en = t.en[key] ?? '', th = t.th[key] ?? ''
  return { en: clean(en || fallback), th: clean(th || en || fallback) }
}

// ── ไอคอน ──
const BATTLE_ICON: Record<TBattle, string> = {
  OFFENCE: 'endless_battle_victory_icon_offense.png',
  TIMEATTACK: 'endless_battle_victory_icon_timeattack.png',
  SIEGE: 'endless_battle_victory_icon_tower.png',
  BOSS: 'endless_battle_victory_icon_boss.png',
}
/** ข้อความประเภทด่านของเกม (ENDLESS_<X>_TITLE / _DESC) */
const BATTLE_KEY: Record<TBattle, string> = { OFFENCE: 'NORMAL', TIMEATTACK: 'TIMEATTACK', SIEGE: 'SIEGE', BOSS: 'BOSS' }
/** ไอคอนของขวัญตามชนิดไอเทม (common_popup_ui: pop_gift_icon_NN — เลขตามชนิดไอเทมของเกม) */
const GIFT_ICON: Record<string, string> = { COIN: 'pop_gift_icon_02.png', HEART: 'pop_gift_icon_03.png', P_GACHA: 'pop_gift_icon_05.png', SCND_HEART: 'pop_gift_icon_07.png', RUBY: 'pop_gift_icon_00.png' }
/** ไอเทมพื้นฐาน → รหัสในตาราง game_item (ชื่อ ITEM ni-xx_nm) */
const ITEM_CODE: Record<string, string> = { COIN: 'ni-01', RUBY: 'ni-02', HEART: 'ni-04', P_GACHA: 'ni-06', SCND_HEART: 'ni-08' }
const thumb = (code: string) => `https://rangers.lerico.net/res/${code}/${code}-thum.png`

interface Ctx {
  area: Tx; item: Tx; mini: Tx; unitTx: Tx
  boxOf: Map<string, string>; units: Map<string, Row>
  /** ตัวละคร (ส่วนหลังขีดของรหัส) → คีย์ชื่อ UNIT ที่มีข้อความ */
  bySuffix: Map<string, string[]>
}
let ctxCache: Ctx | null = null
function ctx(): Ctx {
  if (ctxCache) return ctxCache
  const unitTx = texts('UNIT')
  const bySuffix = new Map<string, string[]>()
  for (const k of Object.keys(unitTx.en)) {
    const m = k.match(/^(?:u\d+[a-z]?|g\d+)-(.+)_nm$/)
    if (!m) continue
    if (!bySuffix.has(m[1])) bySuffix.set(m[1], [])
    bySuffix.get(m[1])!.push(k)
  }
  ctxCache = {
    area: texts('ENDLESS'), item: texts('ITEM'), mini: texts('MINI_GACHA'), unitTx,
    boxOf: new Map(gameTable('mini_gacha_info').map(r => [str(r.gacha_id), str(r.box_cd)])),
    units: new Map(gameTable('unit').map(r => [str(r.unitCode), r])),
    bySuffix,
  }
  return ctxCache
}

/**
 * ชื่อยูนิต (ข้อความเกมทั้งหมด):
 *   1. UNIT <unitNameCode> ของตัวเอง
 *   2. ตัวอื่นที่ใช้ตัวละครเดียวกัน (ส่วนหลังขีด เช่น u81029-drpaimon ↔ u90236-drpaimon = "Dr. Paimon")
 *      ศัตรูส่วนใหญ่ในหอคอยไม่มีข้อความของตัวเอง · ถ้าได้หลายชื่อ ใช้ของยูนิตศัตรู/NPC (u8xxxx/u9xxxx) ถ้าเหลือชื่อเดียว
 *   3. unit.unitName (ชื่อในฐานข้อมูล — บางตัวเป็นชื่อภายใน เช่น u81029 = "THOR" จึงใช้เป็นทางสุดท้าย)
 */
function unitDisplayName(code: string, c: Ctx): TText {
  const u = c.units.get(code)
  const nameCode = str(u?.unitNameCode) || `${code}_nm`
  if (c.unitTx.en[nameCode]) return pick(c.unitTx, nameCode)
  const suffix = code.replace(/^[a-z]\d+[a-z]?-/, '')
  const same = (c.bySuffix.get(suffix) ?? []).filter(k => k !== nameCode)
  const names = (keys: string[]) => new Set(keys.map(k => clean(c.unitTx.en[k])))
  let keys = same
  if (names(keys).size > 1) keys = same.filter(k => /^u[89]\d/.test(k))
  if (keys.length && names(keys).size === 1) return pick(c.unitTx, keys[0])
  const db = str(u?.unitName) || code
  return { en: db, th: db }
}

function makeItem(type: string, code: string, c: Ctx): TItem {
  let name: TText = { en: code, th: code }, icon: TIcon | null = null
  if (type === 'MINI_GACHA') {
    name = pick(c.mini, `${code}_nm`, code)
    const box = c.boxOf.get(code)
    if (box) icon = { atlas: 'minigacha', frame: `pop_gift_icon_${box}.png` }
  } else if (type === 'UNIT') {
    name = unitDisplayName(code, c)
    icon = { url: thumb(code) }
  } else if (type === 'EV_MTRL') {
    name = pick(c.item, `${code}_nm`, code)
    icon = { url: `https://rangers.lerico.net/res/evolve_items/evolve_material_${code}.png` }
  } else {
    name = pick(c.item, `${ITEM_CODE[type] ?? code}_nm`, type)
    if (GIFT_ICON[type]) icon = { atlas: 'popup', frame: GIFT_ICON[type] }
  }
  return { type, code, name, icon }
}

function gimmicksOf(f: Row, c: Ctx, dict: Record<string, TGimmickInfo>): TGimmick[] {
  const out: TGimmick[] = []
  const plain: [TGimmickInfo['kind'], string, number, string][] = [
    ['mineralMax', 'gimmickMineralMax', 1, 'endless_gimmick_icon_mineralmax.png'],
    ['mineralRegen', 'gimmickMineralRegen', 2, 'endless_gimmick_icon_mineralregen.png'],
    ['unitDebuff', 'gimmickUnitDebuff', 3, 'endless_gimmick_icon_unitdebuff.png'],
  ]
  for (const [kind, col, n, icon] of plain) {
    const v = num(f[col])
    if (v == null) continue
    dict[kind] ??= { kind, title: pick(c.area, `endless_gimmick_title_${n}`), desc: pick(c.area, `endless_gimmick_desc_${n}`), icon: { atlas: 'ui', frame: icon } }
    out.push({ key: kind, value: v })
  }
  const el = str(f.gimmickElement)
  const m = el.match(/^([a-z]+)_(up|down)$/)
  if (m) {
    const [, element, dir] = m
    const suffix = `element${dir}_${element}`, key = `element:${el}`
    dict[key] ??= {
      kind: 'element', element, dir: dir as 'up' | 'down',
      title: pick(c.area, `endless_gimmick_title_4_${suffix}`), desc: pick(c.area, `endless_gimmick_desc_4_${suffix}`),
      icon: { atlas: 'ui', frame: `endless_gimmick_icon_${suffix}.png` },
    }
    out.push({ key, value: null })
  }
  return out
}

/** productionLine ของแต่ละชั้น (endless_ai: season 0, conditionType START) */
const lineOf = () => new Map(gameTable('endless_ai').map(r => [str(r.stageCode), num(r.productionLine) ?? 0]))

export function towerIndex(): TowerIndex {
  const c = ctx()
  const floors = gameTable('endless_floor_renewal').slice().sort((a, b) => (num(a.floorOrder) ?? 0) - (num(b.floorOrder) ?? 0))
  const missionsOf = new Map<string, Row[]>()
  for (const m of gameTable('new_endless_floor_mission')) {
    const k = str(m.floorCode)
    if (!missionsOf.has(k)) missionsOf.set(k, [])
    missionsOf.get(k)!.push(m)
  }
  const lines = lineOf()
  const enemyCount = new Map<number, number>()
  for (const p of gameTable('endless_product_line')) {
    const l = num(p.productionLine) ?? 0
    enemyCount.set(l, (enemyCount.get(l) ?? 0) + 1)
  }

  const names: Record<string, TText> = {}
  const missionDict: TowerIndex['missions'] = {}
  const gimmickDict: Record<string, TGimmickInfo> = {}
  const items: Record<string, TItem> = {}
  const reward = (type: string, code: string, amount: number): TReward => {
    const key = `${type}:${code}`
    items[key] ??= makeItem(type, code, c)
    return { item: key, amount }
  }

  const out: TFloor[] = floors.map(f => {
    const code = str(f.floorCode), battle = str(f.battleType) as TBattle
    const bossCode = str(f.bossUnitCode)
    const rewardType = str(f.rewardType)
    const ms = (missionsOf.get(code) ?? []).sort((a, b) => (num(a.missionNo) ?? 0) - (num(b.missionNo) ?? 0))
    const sMin = num(f.sallyProduceMinSec), sMax = num(f.sallyProduceMaxSec)
    const nm = pick(c.area, `${code}_nm`)
    names[nm.en] ??= nm
    return {
      no: num(f.floorOrder) ?? 0, code, battle, name: nm.en,
      needHeart: num(f.needHeart) ?? 0,
      distance: num(f.distance),
      saveCount: num(f.saveCount),
      timeLimit: num(f.saveTimeout),
      sally: sMin != null && sMax != null && (sMin > 0 || sMax > 0) ? [sMin, sMax] : null,
      boss: bossCode ? { unitCode: bossCode, name: unitDisplayName(bossCode, c), moveTime: num(f.bossMoveTime), backRate: num(f.bossBackRate) } : null,
      enemyTowerHp: num(f.enemyTowerHp),
      reward: {
        exp: num(f.rewardExp) ?? 0, coin: num(f.rewardCoin) ?? 0, unitExp: num(f.rewardUnitExp) ?? 0,
        item: rewardType ? reward(rewardType, str(f.rewardCode), num(f.rewardCount) ?? 0) : null,
      },
      missions: ms.map(m => {
        const mc = str(m.missionCode)
        missionDict[mc] ??= { text: pick(c.area, mc, mc), icon: { atlas: 'mission', frame: `endless_battle_icon_${mc}.png` } }
        return { no: num(m.missionNo) ?? 0, code: mc, value: num(m.missionValue), reward: reward(str(m.rewardType), str(m.rewardCode), num(m.rewardAmount) ?? 0) }
      }),
      gimmicks: gimmicksOf(f, c, gimmickDict),
      enemyCount: enemyCount.get(lines.get(code) ?? -1) ?? 0,
    }
  })

  const battles = {} as Record<TBattle, TBattleInfo>
  for (const b of Object.keys(BATTLE_KEY) as TBattle[]) {
    battles[b] = {
      title: pick(c.area, `ENDLESS_${BATTLE_KEY[b]}_TITLE`),
      desc: pick(c.area, `ENDLESS_${BATTLE_KEY[b]}_DESC`),
      gate: { atlas: 'main', frame: b === 'BOSS' ? 'endless_main_tower_boss.png' : 'endless_main_tower_basic.png' },
      icon: { atlas: 'main', frame: BATTLE_ICON[b] },
    }
  }
  const ui: Record<string, TText> = {}
  for (const k of ['ENDLESS_GIMMICK', 'ENDLESS_TIP_MISSION_TITLE', 'ENDLESS_ENTRY_ACQUIRABLE_REWARD', 'ENDLESS_FLOOR_NUMBER',
    'ENDLESS_TIP_BOSS_ICON', 'SALLY_SAVE', 'INFINITY_TOWER_STORY_01', 'INFINITY_TOWER_STORY_02'])
    ui[k] = pick(c.area, k)
  return { floors: out, battles, names, missions: missionDict, gimmicks: gimmickDict, items, ui }
}

/** ศัตรูของชั้นหนึ่ง (เรียงตามช่อง) · ไม่มีชั้นนี้ = null */
export function towerEnemies(floorCode: string): TEnemy[] | null {
  const c = ctx()
  const line = lineOf().get(floorCode)
  if (line == null) return null
  const floor = gameTable('endless_floor_renewal').find(f => str(f.floorCode) === floorCode)
  const bossCode = str(floor?.bossUnitCode)
  return gameTable('endless_product_line')
    .filter(p => num(p.productionLine) === line)
    .sort((a, b) => (num(a.slotNo) ?? 0) - (num(b.slotNo) ?? 0))
    .map(p => {
      const code = str(p.unitCode), u = c.units.get(code)
      const n = (k: string) => num(p[k]) ?? 0
      return {
        slot: n('slotNo'), unitCode: code, name: unitDisplayName(code, c),
        type: str(u?.unitCategoryType), element: str(u?.unitElement), boss: !!bossCode && code === bossCode,
        level: n('enemyLevel'), initDelay: n('initDelay'), minSec: n('minSec'), maxSec: n('maxSec'), maxCount: n('maxCount'),
        unique: n('isUnique') === 1, range: n('attackScope'), splash: n('attackSplash'),
        hp: n('hp'), attack: n('attack'), specialAttack: n('specialAttack'), defence: n('defence'), specialDefence: n('specialDefence'),
        critRate: n('criticalProbability'), critRatio: n('criticalRatio'), avoid: n('avoidProbability'),
        skillAvoid: n('skillAvoidProbability'), skillResist: n('skillResistance'),
        antiAvoid: n('antiAvoidProb'), antiSkillAvoid: n('antiSkillAvoidProb'),
      }
    })
}

/** รหัสชั้นทั้งหมด (สำหรับ emit ไฟล์ศัตรูรายชั้น) */
export const towerFloorCodes = () => gameTable('endless_floor_renewal').map(f => str(f.floorCode))
