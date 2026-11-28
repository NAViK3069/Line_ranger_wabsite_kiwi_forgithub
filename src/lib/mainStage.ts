// ====================================================
// Main Stage (ด่านหลัก ปกติ / Hard / Extreme) — สร้างจากข้อมูลเกมของเราทั้งหมด (Node-only, ใช้ตอน build)
//
// ตารางเกม:
//   area               พื้นที่: ar01–ar37 = ปกติ · ha01–ha20 = Hard · ea01–ea04 = Extreme (พื้นที่ N ของ Hard/Extreme
//                      ใช้ฉาก/ชื่อเดียวกับพื้นที่ปกติ N — ข้อความ ha01_nm = ar01_nm "Valley of Wind")
//   stage              ด่าน 12 ด่านต่อพื้นที่: หัวใจ, ระยะสนาม, ป้อมศัตรู, ฉาก (bgRsourceId), รางวัล 8 ช่อง + รางวัลเคลียร์ครั้งแรก 4 ช่อง,
//                      กลไก Extreme (passiveGimmick1–4 + ค่า, activeGimmick1–4 + activeStartSec / activeCoolSec)
//   stage_ai           ช่วงศัตรูของด่าน: START (เริ่ม) · FRONT (เรนเจอร์เดินถึง X% ของสนาม) · ENEMY_HP (ป้อมศัตรูเหลือ X%)
//                      · TIME (ครบ X วินาที) · SPECIAL → productionLine
//   stage_productline  ศัตรูแต่ละช่อง: เลเวล, เวลาออกครั้งแรก, ช่วงเกิดใหม่, จำนวนสูงสุด, บัฟ (ATK/HP ADD)
//   unit / unit_reinforce_rate  สเตตัสศัตรูตามเลเวล (สูตรเดียวกับเรนเจอร์ — libgame 0xd55400):
//                      ค่า = เริ่มต้น + ต่อเลเวล × (min(L, maxLevel) − 1) + ต่อเลเวลเกินเพดาน × max(0, L − maxLevel)
//   ability            กลไก Extreme: ext_pas_* (STG_PASSIVE_GIMMICK) / ext_act_* (STG_ACTIVE_GIMMICK)
// ข้อความ = ไฟล์ภาษาของเกม (lang_area AREA / STAGE <stage>_tip · lang_unit ABILITY STAGE_GIMMICK_<X>_NM/_DESC)
// ====================================================

import { gameTable } from './gameData'
import {
  ctx, makeItem, pick, texts, unitDisplayName,
  type TEnemy, type TIcon, type TItem, type TReward, type TText,
} from './infinityTower'

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (v == null ? '' : String(v))

export type StageMode = 'normal' | 'hard' | 'extreme'
export const STAGE_MODES: StageMode[] = ['normal', 'hard', 'extreme']

/** กลไกของด่าน Extreme — ข้อความ/ไอคอนอยู่ที่ MainStageIndex.gimmicks[key] */
export interface MSGimmickInfo {
  kind: 'passive' | 'active'
  title: TText; desc: TText; icon: TIcon | null
  /** ตัวคูณของเกม (ability.buffFactor) เช่น 0.5 = สเตตัสเหลือ 50% · 0.9 = แร่เหลือ 90% ต่อรอบ */
  factor: number | null
}
export interface MSGimmick { key: string; value: number | null }

export interface MSStage {
  code: string
  /** เลขด่านแบบในเกม (st157 → 157 · hs12 → 12) */
  no: number
  /** ลำดับในพื้นที่ 1–12 */
  idx: number
  boss: boolean
  needHeart: number
  distance: number | null
  soulCharge: number | null
  enemyTowerHp: number | null
  tower: string
  /** โฟลเดอร์ฉากต่อสู้ (res/<bg>/bg.png) */
  bg: string
  reward: { exp: number; coin: number; unitExp: number }
  drops: TReward[]
  first: TReward[]
  tip: TText | null
  passive: MSGimmick[]
  active: { start: number | null; cool: number | null; keys: string[] } | null
  enemyCount: number
  waveCount: number
}
/** ชิ้นส่วนสมบัติ: กลุ่มละ 3 ระดับ (areaNN_กลุ่ม_ระดับ) — รูป res/arNN_keyitem/<code>.png */
export interface MSTreasurePiece { code: string; name: TText }
/**
 * สมบัติของพื้นที่ (area.completeKeyItemCode — รูป res/arNN_keyitem/arNN_c.png)
 * ประกอบจากชิ้นส่วน 3 กลุ่ม (keyItemCode1–3) · ความสามารถ = ข้อความ KEY_ITEM arNN_key_desc
 * upgrade = อัปเกรดที่สมบัติชิ้นนี้ช่วย (area.rewardUpgradeType เช่น ENRG_PRDN = อัตราการผลิตแร่)
 */
export interface MSTreasure {
  image: string
  name: TText
  ability: TText
  upgrade: string
  groups: { code: string; pieces: MSTreasurePiece[] }[]
}
export interface MSArea {
  code: string
  mode: StageMode
  /** ลำดับพื้นที่ในโหมด 1.. */
  no: number
  /** พื้นที่ปกติที่ใช้ฉากเดียวกัน (ar14) → res/new_ar14/ar14-lm-body.sam */
  land: string
  /** ซีซั่นของพื้นที่ (area.season 1–3) — ปุ่มด่านของเกมต่างกันตามซีซั่น */
  season: number
  treasure: MSTreasure | null
  name: TText
  story: TText | null
  stages: MSStage[]
}
export interface MainStageIndex {
  modes: Record<StageMode, MSArea[]>
  items: Record<string, TItem>
  gimmicks: Record<string, MSGimmickInfo>
  ui: Record<string, TText>
}

export type MSTrigger = 'START' | 'FRONT' | 'ENEMY_HP' | 'TIME' | 'SPECIAL'
export interface MSEnemy extends TEnemy {
  /** บัฟของช่องนี้ (stage_productline.buffFactorType / ApplyType / buffFactor) */
  buff: { type: string; apply: string; value: number } | null
}
export interface MSWave { trigger: MSTrigger; value: number; delay: number; enemies: MSEnemy[] }
export interface MainStageDetail { stage: string; waves: MSWave[] }

// ── โหมดจากรหัสพื้นที่ ──
const modeOf = (areaCode: string): StageMode | null =>
  areaCode.startsWith('ar') ? 'normal' : areaCode.startsWith('ha') ? 'hard' : areaCode.startsWith('ea') ? 'extreme' : null

// ── กลไก Extreme ──
const STAT_GIMMICK: Record<string, string> = { str: 'STR', agi: 'AGI', int: 'INT', fire: 'FIRE', water: 'WATER', tree: 'TREE', light: 'LIGHT', dark: 'DARK' }
/** ไอคอนจาก atlas ของหอคอย (endless_battle_ui) ที่ความหมายตรงกัน */
const GIMMICK_ICON: Record<string, string> = {
  str: 'endless_gimmick_icon_typedown_str.png', agi: 'endless_gimmick_icon_typedown_agi.png', int: 'endless_gimmick_icon_typedown_int.png',
  fire: 'endless_gimmick_icon_elementdown_fire.png', water: 'endless_gimmick_icon_elementdown_water.png',
  tree: 'endless_gimmick_icon_elementdown_tree.png', light: 'endless_gimmick_icon_elementdown_light.png',
  dark: 'endless_gimmick_icon_elementdown_dark.png',
  mnrl: 'endless_gimmick_icon_mineralregen.png', cost: 'endless_gimmick_icon_mineralsumn.png',
}
/** กลไกที่สุ่มใช้ = ไอเทมต่อสู้ขั้น 2 ของเกม (hd/battle/battle_icon: 05 พายุหิมะ · 06 พายุฟ้าคะนอง · 07 อมตะ · 08 ไฟนรก · 09 คลั่ง) */
const ACTIVE_ICON: Record<string, string> = {
  blizzard: 'battle_icon_05_big.png', storm: 'battle_icon_06_big.png', unbeat: 'battle_icon_07_big.png',
  hellfire: 'battle_icon_08_big.png', beast: 'battle_icon_09_big.png',
}
const ACTIVE_KEY: Record<string, string> = {
  beast: 'BEAST', blizzard: 'BLIZZARD', hellfire: 'HELLFIRE', storm: 'THNDRSTRM', tower: 'TOWER', unbeat: 'UNBEAT',
}

function gimmickInfo(code: string, abilities: Map<string, Row>, abTx: ReturnType<typeof texts>): MSGimmickInfo | null {
  const ab = abilities.get(code)
  const factor = num(ab?.buffFactor)
  const m = code.match(/^ext_(pas|act)_([a-z]+)_\d+$/)
  if (!m) return null
  const [, kind, what] = m
  let key = ''
  if (kind === 'pas') {
    if (STAT_GIMMICK[what]) key = `${STAT_GIMMICK[what]}_${factor != null && factor > 1 ? 'UP' : 'DOWN'}`
    else if (what === 'mnrl') key = 'MNRL_DOWN'
    else if (what === 'cooltime' || what === 'ctime') key = 'COOLTIME_UP'
    else if (what === 'cost') key = 'SUMMON_COST_UP'
  } else key = ACTIVE_KEY[what] ?? what.toUpperCase()
  const icon: TIcon | null = kind === 'pas'
    ? (GIMMICK_ICON[what] ? { atlas: 'ui', frame: GIMMICK_ICON[what] } : null)
    : (ACTIVE_ICON[what] ? { atlas: 'battleicon', frame: ACTIVE_ICON[what] } : null)
  return {
    kind: kind === 'pas' ? 'passive' : 'active',
    title: pick(abTx, `STAGE_GIMMICK_${key}_NM`, code),
    desc: pick(abTx, `STAGE_GIMMICK_${key}_DESC`),
    icon,
    factor,
  }
}

// ── สเตตัสศัตรูตามเลเวล ──
interface StatCtx { rates: Map<string, Row> }
let statCtx: StatCtx | null = null
const stats = () => (statCtx ??= { rates: new Map(gameTable('unit_reinforce_rate').map(r => [str(r.unitCode), r])) })
function atLevel(u: Row | undefined, rate: Row | undefined, initial: string, per: string, perMax: string, L: number): number {
  const base = num(u?.[initial]) ?? 0
  if (!rate) return base
  const cap = Math.max(1, num(u?.maxLevel) ?? 1)
  const lv = Math.max(1, L)
  return Math.floor(base + (num(rate[per]) ?? 0) * (Math.min(lv, cap) - 1) + (num(rate[perMax]) ?? 0) * Math.max(0, lv - cap))
}

/**
 * ข้อความเกมที่ตัดบรรทัดไว้ (\n) — ภาษาไทยไม่เว้นวรรคระหว่างคำ: ขึ้นบรรทัดระหว่างอักษรไทยต้องต่อกันเลย
 * ("เพิ่มอัตรา\nการผลิตแร่ธาตุ" → "เพิ่มอัตราการผลิตแร่ธาตุ") · อื่นๆ ใช้ pick ตามปกติ (เป็นช่องว่าง)
 */
function pickJoin(t: ReturnType<typeof texts>, key: string, fallback = ''): TText {
  const p = pick(t, key, fallback)
  const raw = t.th[key]
  if (raw) p.th = pick({ en: {}, th: { k: raw.replace(/(\p{Script=Thai})[ \t]*(?:\\n|\r?\n)[ \t]*(?=\p{Script=Thai})/gu, '$1') } }, 'k').th
  return p
}

// ── สมบัติของพื้นที่ ──
function treasureOf(a: Row, keyTx: ReturnType<typeof texts>): MSTreasure | null {
  const code = str(a.areaCode)
  const groups = [1, 2, 3].map(i => str(a[`keyItemCode${i}`])).filter(Boolean)
  if (!groups.length) return null
  return {
    image: `https://rangers.lerico.net/res/${code}_keyitem/${code}_c.png`,
    name: pickJoin(keyTx, str(a.completeKeyItemName) || `${code}_key_nm`),
    ability: pickJoin(keyTx, str(a.completeKeyItemDesc) || `${code}_key_desc`),
    upgrade: str(a.rewardUpgradeType),
    groups: groups.map(g => ({ code: g, pieces: [1, 2, 3].map(k => ({ code: `${g}_${k}`, name: pickJoin(keyTx, `${g}_${k}`) })) })),
  }
}

// ── ดัชนี ──
export function mainStageIndex(): MainStageIndex {
  const c = ctx()
  const areaTx = texts('AREA'), stageTx = texts('STAGE'), abTx = texts('ABILITY'), keyTx = texts('KEY_ITEM')
  const abilities = new Map(gameTable('ability').map(r => [str(r.code), r]))
  const aiOf = new Map<string, Row[]>()
  for (const a of gameTable('stage_ai')) {
    const k = str(a.stageCode)
    if (!aiOf.has(k)) aiOf.set(k, [])
    aiOf.get(k)!.push(a)
  }
  const slotsOf = new Map<number, number>()
  for (const p of gameTable('stage_productline')) {
    const l = num(p.productionLine) ?? 0
    slotsOf.set(l, (slotsOf.get(l) ?? 0) + 1)
  }

  const items: Record<string, TItem> = {}
  const reward = (type: string, code: string, amount: number): TReward => {
    const key = `${type}:${code}`
    items[key] ??= makeItem(type, code, c)
    return { item: key, amount }
  }
  const gimmicks: Record<string, MSGimmickInfo> = {}
  const addGimmick = (code: string) => {
    if (!(code in gimmicks)) { const g = gimmickInfo(code, abilities, abTx); if (g) gimmicks[code] = g }
    return code in gimmicks
  }

  const stagesOf = new Map<string, Row[]>()
  for (const s of gameTable('stage')) {
    const k = str(s.areaCode)
    if (str(s.stageCode) === 'st00') continue   // บทสอน
    if (!stagesOf.has(k)) stagesOf.set(k, [])
    stagesOf.get(k)!.push(s)
  }

  const modes: Record<StageMode, MSArea[]> = { normal: [], hard: [], extreme: [] }
  const areas = gameTable('area').slice().sort((a, b) => (num(a.sort) ?? 0) - (num(b.sort) ?? 0))
  for (const a of areas) {
    const code = str(a.areaCode), mode = modeOf(code)
    if (!mode) continue
    const list = (stagesOf.get(code) ?? []).sort((x, y) => (num(x.sort) ?? 0) - (num(y.sort) ?? 0))
    if (!list.length) continue
    const n = code.slice(2)
    const storyKey = str(a.areaStoryCode)
    const story = storyKey && areaTx.en[storyKey] ? pick(areaTx, storyKey) : null
    modes[mode].push({
      code, mode, no: modes[mode].length + 1, land: `ar${n}`, season: num(a.season) ?? 1,
      treasure: treasureOf(a, keyTx),
      name: pickJoin(areaTx, str(a.areaNameCode) || `${code}_nm`, str(a.areaName)),
      story: story && story.en !== str(a.areaName) ? story : null,
      stages: list.map((s, i): MSStage => {
        const sc = str(s.stageCode)
        const drops: TReward[] = [], first: TReward[] = []
        for (let k = 1; k <= 8; k++) {
          const t = str(s[`rewardType${k}`]), cd = str(s[`rewardCode${k}`])
          if (t && cd) drops.push(reward(t, cd, num(s[`rewardAmount${k}`]) ?? 1))
        }
        for (let k = 1; k <= 4; k++) {
          const t = str(s[`firstRewardType${k}`]), cd = str(s[`firstRewardCode${k}`])
          if (t && cd) first.push(reward(t, cd, num(s[`firstRewardAmount${k}`]) ?? 1))
        }
        const passive: MSGimmick[] = []
        for (let k = 1; k <= 4; k++) {
          const g = str(s[`passiveGimmick${k}`])
          if (g && addGimmick(g)) passive.push({ key: g, value: num(s[`passiveGimmick${k}Value`]) })
        }
        const act: string[] = []
        for (let k = 1; k <= 4; k++) { const g = str(s[`activeGimmick${k}`]); if (g && addGimmick(g)) act.push(g) }
        const ai = aiOf.get(sc) ?? []
        const tipKey = `${sc}_tip`
        return {
          code: sc, no: Number(sc.replace(/^\D+/, '')) || i + 1, idx: i + 1,
          boss: (num(s.bossType) ?? 0) > 0,
          needHeart: num(s.needHeart) ?? 0,
          distance: num(s.distance), soulCharge: num(s.soulCharge), enemyTowerHp: num(s.enemyTowerHp),
          tower: str(s.enemyTowerCode), bg: str(s.bgRsourceId),
          reward: { exp: num(s.rewardExp) ?? 0, coin: num(s.rewardCoin) ?? 0, unitExp: num(s.rewardUnitExp) ?? 0 },
          drops, first,
          tip: stageTx.en[tipKey] ? pick(stageTx, tipKey) : null,
          passive,
          active: act.length ? { start: num(s.activeStartSec), cool: num(s.activeCoolSec), keys: act } : null,
          enemyCount: ai.reduce((n2, a2) => n2 + (slotsOf.get(num(a2.productionLine) ?? -1) ?? 0), 0),
          waveCount: ai.length,
        }
      }),
    })
  }

  const ui: Record<string, TText> = {}
  const prop = texts('PROPERTIES'), special = texts('SPECIAL_STAGE')
  for (const [k, t] of [['HARD_MODE_TIP_NM', stageTx], ['EXTREME_MODE_STAGE_LOCKED', prop],
    ['EXTREME_MODE_STORY_01', prop], ['EXTREME_MODE_STORY_02', prop], ['FRIEND_HOME_EXTREME_STAGE', prop],
    ['SPECIAL_AREA_DIFF_TEXT_NORMAL', special], ['SPECIAL_AREA_DIFF_TEXT_HARD', special]] as const)
    ui[k] = pick(t, k)
  return { modes, items, gimmicks, ui }
}

/** ศัตรูของด่าน แบ่งตามช่วง (stage_ai → stage_productline) · ไม่มีด่านนี้ = null */
export function mainStageDetail(stageCode: string): MainStageDetail | null {
  const c = ctx(), { rates } = stats()
  const ai = gameTable('stage_ai').filter(a => str(a.stageCode) === stageCode)
  if (!ai.length) return null
  const lines = new Map<number, Row[]>()
  const want = new Set(ai.map(a => num(a.productionLine) ?? -1))
  for (const p of gameTable('stage_productline')) {
    const l = num(p.productionLine) ?? -1
    if (!want.has(l)) continue
    if (!lines.has(l)) lines.set(l, [])
    lines.get(l)!.push(p)
  }
  const order: Record<string, number> = { START: 0, FRONT: 1, ENEMY_HP: 2, TIME: 3, SPECIAL: 4 }
  const waves = ai
    .slice()
    .sort((a, b) => (order[str(a.conditionType)] ?? 9) - (order[str(b.conditionType)] ?? 9) || (num(a.conditionValue) ?? 0) - (num(b.conditionValue) ?? 0))
    .map((a): MSWave => ({
      trigger: str(a.conditionType) as MSTrigger,
      value: num(a.conditionValue) ?? 0,
      delay: num(a.delay) ?? 0,
      enemies: (lines.get(num(a.productionLine) ?? -1) ?? [])
        .sort((x, y) => (num(x.slotNo) ?? 0) - (num(y.slotNo) ?? 0))
        .map((p): MSEnemy => {
          const code = str(p.unitCode), u = c.units.get(code), r = rates.get(code)
          const L = num(p.enemyLevel) ?? 1
          const n = (k: string) => num(p[k]) ?? 0
          const un = (k: string) => num(u?.[k]) ?? 0
          const bt = str(p.buffFactorType)
          return {
            slot: n('slotNo'), unitCode: code, name: unitDisplayName(code, c),
            type: str(u?.unitCategoryType), element: str(u?.unitElement), boss: false,
            level: L, initDelay: n('initDelay'), minSec: n('minSec'), maxSec: n('maxSec'), maxCount: n('maxCount'),
            unique: n('isUnique') === 1, range: un('attackRange'), splash: un('attackScope'),
            hp: atLevel(u, r, 'initialHp', 'hpIncreaseAmount', 'hpIncreaseAmountMax', L),
            attack: atLevel(u, r, 'initialAttack', 'attackIncreaseAmount', 'attackIncreaseAmountMax', L),
            specialAttack: atLevel(u, r, 'specialAttack', 'specialAttackDelta', 'specialAttackDeltaMax', L),
            defence: atLevel(u, r, 'defence', 'generalDefenceDelta', 'generalDefenceDeltaMax', L),
            specialDefence: atLevel(u, r, 'specialDefence', 'specialDefenceDelta', 'specialDefenceDeltaMax', L),
            critRate: un('criticalProbability'), critRatio: un('criticalRatio'), avoid: un('avoidProbability'),
            skillAvoid: un('skillAvoidProbability'), skillResist: un('skillResistance'),
            antiAvoid: un('antiAvoidProb'), antiSkillAvoid: un('antiSkillAvoidProb'),
            buff: bt ? { type: bt, apply: str(p.buffFactorApplyType), value: n('buffFactor') } : null,
          }
        }),
    }))
  return { stage: stageCode, waves }
}

/** รหัสด่านทั้งหมดที่มีศัตรู (สำหรับ emit ไฟล์รายด่าน) */
export const mainStageCodes = () => [...new Set(gameTable('stage_ai').map(a => str(a.stageCode)))].filter(s => s !== 'st00')
