// ====================================================
// skillDetail — ตารางรายละเอียดสกิล / ความสามารถ จากตาราง skill / ability ของเกม (ไม่อ่านจากข้อความคำอธิบาย)
//
// ค่าของสกิลคิดตามชนิดในตาราง (ตรวจกับคำอธิบายทางการแล้วตรงกันทุกแบบ):
//   FIXED ADD  = ค่าตรงๆ                  เช่น ATK FIXED 1.5 → +150%
//   GRADE ADD  = เกรด + ค่า               เช่น ระยะเวลา GRADE ADD 2 (8★) → 10 วินาที
//   GRADE SUB  = เกรด − ค่า               เช่น SKILL_AVOID GRADE SUB 7.7 (8★) → +30%
//   GRADE MUL  = เกรด × ค่า
//   LEVEL MUL  = เลเวล × ค่า (ADD = เลเวล + ค่า · DIV = เลเวล ÷ ค่า)
//   ATTACK MUL = ATK × ค่า · HP MUL = HP × ค่า
// ชื่อผลของสกิล = ชนิดในตาราง (skillType + buffFactorType) แปลเป็นป้ายภาษาไทย/อังกฤษ
// ====================================================

import type { AbilityGame, SkillGame } from './rangerGameCalc'

type L = 'th' | 'en'
const pick = (lang: string): L => (lang === 'th' ? 'th' : 'en')
type Dict = Record<string, { th: string; en: string }>

// ── ป้ายของค่าพลัง (buffFactorType) ──
const STAT: Dict = {
  ATK: { th: 'พลังโจมตี', en: 'ATK' },
  SP_ATK: { th: 'พลังเวทโจมตี', en: 'Magic ATK' },
  ATK_TOWER: { th: 'พลังโจมตีใส่ปราสาท', en: 'ATK vs Castle' },
  ATKSPD: { th: 'ความเร็วโจมตี', en: 'ATK Speed' },
  SPEED: { th: 'ความเร็วเคลื่อนที่', en: 'Move Speed' },
  HP: { th: 'พลังชีวิต', en: 'HP' },
  NORMAL_DEF: { th: 'พลังป้องกันกาย', en: 'Physical DEF' },
  SPECIAL_DEF: { th: 'พลังป้องกันเวท', en: 'Magic DEF' },
  SKILL_RESIST: { th: 'การต้านสกิล', en: 'Skill Resistance' },
  SKILL_AVOID_CHANCE: { th: 'อัตราหลบสกิล', en: 'Skill Evade Rate' },
  SKILL_CHANCE: { th: 'อัตราใช้สกิล', en: 'Skill Use Rate' },
  AVOID_CHANCE: { th: 'อัตราหลบหลีก', en: 'Evade Rate' },
  ANTI_AVOID_PROB: { th: 'อัตราความแม่นยำ', en: 'Hit Rate' },
  ANTI_AVOID: { th: 'อัตราความแม่นยำ', en: 'Hit Rate' },
  ANTI_SK_AVOID_PROB: { th: 'ความแม่นยำของสกิล', en: 'Skill Hit Rate' },
  ANTI_SKILL_AVOID: { th: 'ความแม่นยำของสกิล', en: 'Skill Hit Rate' },
  CRITICAL_CHANCE: { th: 'อัตราคริติคอล', en: 'Critical Rate' },
  CRITICAL_POWER: { th: 'ดาเมจคริติคอล', en: 'Critical Damage' },
  SKILLRANGE: { th: 'ระยะสกิล', en: 'Skill Range' },
  ATKRANGE: { th: 'ระยะโจมตี', en: 'ATK Range' },
}
/** ค่าพลังที่เป็นตัวเลขตรง (ไม่ใช่ %) */
const FLAT_STATS = new Set(['NORMAL_DEF', 'SPECIAL_DEF'])

// ── ป้ายของชนิดสกิล (skillType) ──
const SKILL_TYPE: Dict = {
  DMG: { th: 'ความเสียหาย', en: 'Damage' },
  DOT: { th: 'ความเสียหาย (ต่อเนื่อง)', en: 'Damage (per sec)' },
  STUN: { th: 'สตัน', en: 'Stun' },
  KNOCKBACK: { th: 'กระแทกถอยหลัง', en: 'Knockback' },
  SILENCE: { th: 'ห้ามใช้สกิล', en: 'Silence' },
  HEAL: { th: 'ฟื้นฟู HP', en: 'Heal' },
  DOTHEAL: { th: 'ฟื้นฟู HP (ต่อเนื่อง)', en: 'HP Regen (per sec)' },
  UNBEAT: { th: 'บาเรียในพื้นที่', en: 'Area Shield' },
  CLEAN_UNBEAT: { th: 'ลบทักษะอมตะของศัตรู', en: 'Cancel enemy invincibility' },
  CLEANING_UNBEAT: { th: 'ลบทักษะอมตะของศัตรู (ต่อเนื่อง)', en: 'Cancel enemy invincibility (continuous)' },
  CLEAN_ENEMY: { th: 'ลบบัฟของศัตรู', en: 'Cancel enemy buffs' },
  CLEANING_ENEMY: { th: 'ลบบัฟของศัตรู (ต่อเนื่อง)', en: 'Cancel enemy buffs (continuous)' },
  CLEAN_DOTHEAL: { th: 'ลบการฟื้นฟู HP ต่อเนื่อง', en: 'Cancel HP regen' },
  CLEANING_DOTHEAL: { th: 'ลบการฟื้นฟู HP ต่อเนื่อง (ต่อเนื่อง)', en: 'Cancel HP regen (continuous)' },
  CLEAN_ALLY: { th: 'ลบดีบัฟของพรรคพวก', en: "Remove allies' debuffs" },
  CLEANING_DEBUFF: { th: 'ลบดีบัฟของพรรคพวก (ต่อเนื่อง)', en: "Remove allies' debuffs (continuous)" },
  CLEAN_POISON: { th: 'ลบความเสียหายต่อเนื่อง', en: 'Cancel damage over time' },
  CLEANING_POISON: { th: 'ลบความเสียหายต่อเนื่อง (ต่อเนื่อง)', en: 'Cancel damage over time (continuous)' },
  CLEANING_SUMMON: { th: 'ต้านสกิลอัญเชิญของศัตรู', en: 'Resist enemy summons' },
  CURSE_DEBUFF: { th: 'ทำให้สกิลลบดีบัฟใช้ไม่ได้', en: 'Nullify debuff-canceling' },
  MIRROR_PHY: { th: 'สะท้อนดาเมจสกิล (กายภาพ)', en: 'Reflect skill damage (physical)' },
  MIRROR_MAG: { th: 'สะท้อนดาเมจสกิล (เวท)', en: 'Reflect skill damage (magic)' },
  TEMPT: { th: 'ทำให้ศัตรูหลงเสน่ห์', en: 'Charm' },
  FEAR: { th: 'ทำให้ศัตรูหวาดกลัว', en: 'Fear' },
  BUBBLE: { th: 'ทำให้ศัตรูลอยขึ้นด้วยฟองสบู่', en: 'Bubble float' },
  POLYMORPH: { th: 'เปลี่ยนร่างศัตรู', en: 'Polymorph' },
  SCALE: { th: 'เปลี่ยนขนาดศัตรู', en: 'Resize enemies' },
  SUMMON: { th: 'อัญเชิญ', en: 'Summon' },
  SUMMON_ENEMY: { th: 'เปลี่ยนศัตรูเป็นพรรคพวก', en: 'Turn enemies into allies' },
  SKILL_RESET: { th: 'รีเซ็ตคูลดาวน์สกิลพรรคพวก', en: "Reset allies' skill cooldown" },
  MOVE_ENEMY1: { th: 'ดึงศัตรูมารวมกัน', en: 'Pull enemies together' },
  MOVE_ENEMY2: { th: 'ผลักศัตรูไปด้านหลัง', en: 'Push enemies back' },
  MOVE_ATTACK: { th: 'พุ่งเข้าโจมตี', en: 'Dash attack' },
  CHANGE_ENEMY: { th: 'สลับตำแหน่งกับศัตรู', en: 'Swap with enemy' },
  CHANGE_ALLY: { th: 'สลับตำแหน่งกับพรรคพวก', en: 'Swap with ally' },
  THROW_ALLY: { th: 'ส่งพรรคพวกไปด้านหน้า', en: 'Launch ally forward' },
}
const ELEMENT: Dict = {
  FIRE: { th: 'ไฟ', en: 'Fire' }, WATER: { th: 'น้ำ', en: 'Water' }, TREE: { th: 'ไม้', en: 'Wood' },
  LIGHT: { th: 'แสง', en: 'Light' }, DARK: { th: 'มืด', en: 'Dark' }, NONE: { th: 'ไร้ธาตุ', en: 'None' },
}

/** ชื่อผลของสกิล (หลัก/ย่อย) จากชนิดในตาราง */
export function skillEffectLabel(s: SkillGame, lang: string): string {
  const l = pick(lang)
  if (s.skillType === 'BUFF' || s.skillType === 'DEBUFF') {
    if (s.buffFactorType === 'CHANGE_SPLASH') return l === 'th' ? 'เปลี่ยนการโจมตีปกติเป็นโจมตีพื้นที่' : 'Normal attacks become area attacks'
    if (s.buffFactorType === 'VAMPIRE') return l === 'th' ? 'ฟื้นฟู HP ตาม ATK' : 'Recover HP by ATK'
    const stat = STAT[s.buffFactorType]?.[l] ?? s.buffFactorType
    if (s.skillType === 'BUFF') return l === 'th' ? `เพิ่ม${stat}` : `${stat} Up`
    return l === 'th' ? `ลด${stat}ศัตรู` : `Enemy ${stat} Down`
  }
  const ch = s.skillType.match(/^CHANGE_([A-Z]+)_([A-Z]+)$/)
  if (ch && ELEMENT[ch[1]]) {
    const a = ELEMENT[ch[1]][l], b = ELEMENT[ch[2]]?.[l] ?? ch[2]
    return l === 'th' ? `เปลี่ยนธาตุศัตรู ${a} → ${b}` : `Enemy element ${a} → ${b}`
  }
  return SKILL_TYPE[s.skillType]?.[l] ?? s.skillType
}

// ── ค่าตามชนิด (FIXED / GRADE / LEVEL) ──
export function resolveFactor(type: string, apply: string | undefined, f: number, grade: number, level: number): number | null {
  switch (type) {
    case 'FIXED': return f
    case 'GRADE':
      if (apply === 'SUB') return grade - f
      if (apply === 'MUL') return grade * f
      return grade + f
    case 'LEVEL':
      if (apply === 'ADD') return level + f
      if (apply === 'DIV') return f ? level / f : null
      return level * f
    default: return null
  }
}

const num = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : `${+v.toFixed(2)}`)
const pctOf = (v: number) => `${+(v * 100).toFixed(1)}%`
const signed = (v: number, s: string) => `${v >= 0 ? '+' : '−'}${s}`

/** ชนิดสกิลที่ factor = โอกาส และ buffFactor = จำนวนเป้าสูงสุด */
const CHANCE_COUNT = new Set(['BUBBLE', 'FEAR', 'SKILL_RESET'])
/** ชนิดที่ buffFactor = จำนวนเป้า */
const COUNT_TYPES = new Set(['TEMPT', 'SUMMON_ENEMY', 'BUBBLE', 'FEAR', 'SKILL_RESET', 'SUMMON'])

export interface SkillEffectRow {
  code: string
  label: string
  /** ค่าสัมประสิทธิ์ ('' = ไม่มีตัวเลข) */
  value: string
  /** ระยะเวลา (วินาที) — null = ทันที/ไม่มี */
  duration: number | null
  range: number
  eventStage: boolean
  guardian: boolean
}

function effectValue(s: SkillGame, grade: number, level: number, lang: string): string {
  const th = pick(lang) === 'th'
  if (s.factorType === 'ATTACK') return `ATK × ${pctOf(s.factor)}`
  if (s.factorType === 'HP') return `HP × ${pctOf(s.factor)}`
  const v = resolveFactor(s.factorType, s.factorApplyType, s.factor, grade, level)
  const parts: string[] = []
  if (CHANCE_COUNT.has(s.skillType) && s.factor > 0) parts.push(th ? `โอกาส ${pctOf(s.factor)}` : `${pctOf(s.factor)} chance`)
  else if (v != null && (s.skillType === 'BUFF' || s.skillType === 'DEBUFF')) {
    if (s.buffFactorType === 'CHANGE_SPLASH') parts.push(th ? `รัศมี ${num(v)}` : `radius ${num(v)}`)
    else if (FLAT_STATS.has(s.buffFactorType)) parts.push(signed(s.skillType === 'BUFF' ? v : -v, num(Math.abs(v))))
    else parts.push(signed(s.skillType === 'BUFF' ? v : -v, pctOf(Math.abs(v))))
  } else if (v != null && v !== 0) parts.push(num(v))
  if (COUNT_TYPES.has(s.skillType) && s.buffFactor > 0) parts.push(th ? `สูงสุด ${num(s.buffFactor)} ตัว` : `max ${num(s.buffFactor)}`)
  return parts.join(' · ')
}

/** แถวผลของสกิล: สกิลหลัก (ถ้ามีผลของตัวเอง) + สกิลย่อยทุกตัว */
export function skillEffectRows(skill: SkillGame, grade: number, level: number, lang: string): SkillEffectRow[] {
  const rows = [skill, ...(skill.subs ?? [])]
  return rows.map(s => {
    const d = s.subFactorType && s.subFactorType !== 'NONE'
      ? resolveFactor(s.subFactorType, s.subFactorApplyType, s.subFactor, grade, level)
      : null
    return {
      code: s.code,
      label: skillEffectLabel(s, lang),
      value: effectValue(s, grade, level, lang),
      duration: d != null && d > 0 ? +d.toFixed(2) : null,
      range: s.range,
      eventStage: !!s.affectEventStage,
      guardian: !!s.affectGuardian,
    }
  })
}

/** เป้าหมายของสกิล (skill.targetType) */
export function targetLabel(s: SkillGame, lang: string): string {
  const th = pick(lang) === 'th'
  if (s.targetType === 'SELF') return th ? 'ตนเอง' : 'Self'
  if (s.targetType === 'RSEARCH') return th ? `ศัตรูด้านหลัง (×${s.rsearchRatio ?? 1})` : `Rear enemy (×${s.rsearchRatio ?? 1})`
  return th ? 'ศัตรูด้านหน้า' : 'Front enemy'
}

// ── ความสามารถ ──
const WHEN: Dict = {
  BATTLE: { th: 'ระหว่างการต่อสู้', en: 'During battle' },
  INSTANT: { th: 'เมื่อออกสนาม / ขณะอยู่ในสนามรบ', en: 'On deploy / in battle' },
  DIE: { th: 'เมื่อเรนเจอร์ตาย', en: 'When defeated' },
}
const ON: Dict = {
  ALL: { th: 'ทุกโหมดเกม', en: 'All modes' },
  ADVENT: { th: 'สเตจแอดเวนต์', en: 'Advent stages' },
  PVP: { th: 'PVP เท่านั้น', en: 'PVP only' },
}
const CATEGORY: Dict = {
  STR: { th: 'พลัง', en: 'Strength' }, AGI: { th: 'ว่องไว', en: 'Agility' }, INT: { th: 'ปัญญา', en: 'Intelligence' },
  ALL: { th: 'ทุกสาย', en: 'All' },
}
const ACTION: Dict = {
  STRIKE_KBACK: { th: 'โจมตีกระแทกถอยหลัง', en: 'Knockback strike' },
  STRIKE_KILL: { th: 'โจมตีสังหารทันที', en: 'Instant-kill strike' },
  STRIKE_STUN: { th: 'โจมตีสตัน', en: 'Stun strike' },
  STRIKE_SILENCE: { th: 'โจมตีห้ามใช้สกิล', en: 'Silence strike' },
  STRIKE_SHIELD: { th: 'โจมตีทำลายบาเรีย', en: 'Shield-break strike' },
  CLONE: { th: 'สร้างร่างโคลน', en: 'Clone' },
  MINERAL_ADD: { th: 'เพิ่มแร่ธาตุ', en: 'Mineral bonus' },
  MINERAL_TIME: { th: 'เร่งการเพิ่มแร่ธาตุ', en: 'Mineral speed' },
  MIN_THIEF: { th: 'ขโมยแร่ธาตุ', en: 'Mineral steal' },
  GUTS: { th: 'อึด (ยืนหยัดต่อ)', en: 'Persistence' },
  REVIVE: { th: 'คืนชีพ', en: 'Revive' },
  INSTANT_MISSILE: { th: 'ยิงมิสไซล์', en: 'Missile' },
  MISSILE_DAMAGE: { th: 'เพิ่มดาเมจมิสไซล์', en: 'Missile damage' },
  MISSILE_TIME: { th: 'ลดคูลดาวน์มิสไซล์', en: 'Missile cooldown' },
  FREEZE_COOLTIME: { th: 'หยุดคูลดาวน์ศัตรู', en: 'Freeze cooldown' },
  UNIT_COOLTIME: { th: 'ลดเวลาผลิตเรนเจอร์', en: 'Ranger cooldown' },
  SKILL_COOLTIME: { th: 'ลดคูลดาวน์สกิล', en: 'Skill cooldown' },
  COPY_ALLY: { th: 'คัดลอกพรรคพวก', en: 'Copy ally' },
  HIDE: { th: 'ซ่อนตัว', en: 'Hide' },
  BLOODLUST: { th: 'กระหายเลือด', en: 'Bloodlust' },
}
const APTITUDE: Dict = {
  FLIGHT: { th: 'บินได้', en: 'Flying' },
  ANTI_FLIGHT: { th: 'โจมตีหน่วยบินได้', en: 'Hits flying units' },
  BARRIER: { th: 'บาเรียทักษะ (ลดดาเมจสกิล)', en: 'Skill barrier (reduces skill damage)' },
  LAST_BURN: { th: 'ใช้ทักษะเมื่อถูกกำจัด', en: 'Uses a skill when defeated' },
  MINERAL_BACK: { th: 'คืนแร่ธาตุเมื่อถูกกำจัด', en: 'Refunds Mineral when defeated' },
  PASS_SKILLRES: { th: 'เจาะการต้านสกิล', en: 'Pierce Skill Resistance' },
  PASS_DEFENSE: { th: 'เจาะพลังป้องกัน', en: 'Pierce DEF' },
  PASS_UNBEATABLE: { th: 'เจาะการอมตะ', en: 'Pierce invincibility' },
  WATER_GHOST: { th: 'ร่างวิญญาณ', en: 'Ghost body' },
  GHOST: { th: 'ร่างวิญญาณ', en: 'Ghost body' },
  BLANK_HAND: { th: 'มือเปล่า', en: 'Empty hand' },
  TOWER: { th: 'ปราสาท', en: 'Castle' },
}
/** ANTI_xxx = ไม่รับผลนั้น */
const ANTI: Dict = {
  TEMPO: { th: 'หยุดชั่วคราว', en: 'Tempo stop' }, DOT: { th: 'ความเสียหายต่อเนื่อง', en: 'Damage over time' },
  BLIND: { th: 'ตาบอด', en: 'Blind' }, DEATH: { th: 'สังหารทันที', en: 'Instant death' }, STUN: { th: 'สตัน', en: 'Stun' },
  ICE: { th: 'ไอเทมน้ำแข็ง', en: 'Ice item' }, POLYMORPH: { th: 'เปลี่ยนร่าง', en: 'Polymorph' }, TORNADO: { th: 'ไอเทมทอร์นาโด', en: 'Tornado item' },
  TEMPT: { th: 'หลงเสน่ห์', en: 'Charm' }, FREEZE: { th: 'หยุดศัตรูออกปฏิบัติการชั่วคราว', en: 'Deploy freeze' },
  SILENCE: { th: 'ห้ามใช้สกิล', en: 'Silence' }, METEOR: { th: 'ไอเทมอุกกาบาต', en: 'Meteor item' },
  MIRROR_DAMAGE: { th: 'ดาเมจสะท้อน', en: 'Reflected damage' }, MIN_ADD: { th: 'ขโมยแร่ธาตุ', en: 'Mineral steal' },
}

export interface AbilityRow {
  chance: string
  when: string
  mode: string
  condition: string
  effect: string
}

function conditionLabel(type: string, value: string, lang: string): string | null {
  const l = pick(lang)
  if (!type || type === 'NONE') return null
  const v = (value || '').toUpperCase()
  if (type === 'CATEGORY') {
    if (v === 'NONE') return null
    return `${l === 'th' ? 'สาย' : 'Category'}: ${CATEGORY[v]?.[l] ?? value}`
  }
  if (type === 'ELEMENT') return `${l === 'th' ? 'ธาตุ' : 'Element'}: ${ELEMENT[v]?.[l] ?? value}`
  if (type === 'SKILLTYPE') return `${l === 'th' ? 'ทักษะ' : 'Skill'}: ${SKILL_TYPE[v]?.[l] ?? value}`
  if (type === 'APTITUDETYPE') return `${l === 'th' ? 'เป้าหมาย' : 'Target'}: ${APTITUDE[v]?.[l] ?? value}`
  if (type === 'HP_SELF') return l === 'th' ? 'ตาม HP ของตัวเอง' : 'Own HP'
  return `${type}: ${value}`
}

function abilityEffect(a: AbilityGame, lang: string): string {
  const l = pick(lang)
  const anti = a.aptitudeType.match(/^ANTI_(.+)$/)
  if (anti && ANTI[anti[1]]) return l === 'th' ? `ไม่รับผล ${ANTI[anti[1]].th}` : `Immune to ${ANTI[anti[1]].en}`
  if (a.buffFactorType && a.buffFactorType !== 'NONE' && STAT[a.buffFactorType]) {
    const stat = STAT[a.buffFactorType][l]
    const v = FLAT_STATS.has(a.buffFactorType) ? num(a.buffFactor) : pctOf(a.buffFactor)
    return l === 'th' ? `เพิ่ม${stat} +${v}` : `${stat} +${v}`
  }
  // REVIVE: factor HP MUL — คืนชีพด้วย HP × buffFactor
  if (a.factorType === 'HP' && a.factorApplyType === 'MUL') {
    const base = ACTION[a.actionType]?.[l] ?? 'HP'
    return l === 'th' ? `${base} (ด้วย HP ${pctOf(a.buffFactor)})` : `${base} (HP ${pctOf(a.buffFactor)})`
  }
  if (a.actionType === 'GUTS' && a.buffFactor) return l === 'th' ? `${ACTION.GUTS.th} ${num(a.buffFactor)} วินาที` : `${ACTION.GUTS.en} ${num(a.buffFactor)}s`
  const name = (a.actionType && a.actionType !== 'NONE' ? ACTION[a.actionType]?.[l] : undefined)
    ?? (a.aptitudeType && a.aptitudeType !== 'NONE' ? APTITUDE[a.aptitudeType]?.[l] : undefined)
  const parts: string[] = []
  if (name) parts.push(name)
  if (a.aptitudeType === 'BARRIER' && a.buffFactor) parts.push(l === 'th' ? `ลดดาเมจ ${pctOf(a.buffFactor)} · คูลดาวน์ ${num(a.subBuffFactor)} วินาที` : `${pctOf(a.buffFactor)} less damage · ${num(a.subBuffFactor)}s cooldown`)
  else if (a.aptitudeType === 'MINERAL_BACK' && a.buffFactor) parts.push(l === 'th' ? `คืน ${pctOf(a.buffFactor)}` : `${pctOf(a.buffFactor)} back`)
  // ชนิดอื่น: ความหมายของ buffFactor ต่างกันไป (จำนวน/วินาที/สัดส่วน) — ไม่เดาหน่วย แสดงเฉพาะชื่อผล
  return parts.join(' · ') || '—'
}

/** แถวของความสามารถ: ตัวหลัก + ความสามารถย่อยที่มีผลของตัวเอง */
export function abilityRows(a: AbilityGame, lang: string): AbilityRow[] {
  const l = pick(lang)
  const make = (x: AbilityGame): AbilityRow => {
    const conds = [conditionLabel(x.cond1Type, x.cond1Value, lang), conditionLabel(x.cond2Type, x.cond2Value, lang)].filter(Boolean)
    return {
      chance: pctOf(x.probability),
      when: WHEN[x.activeWhenType]?.[l] ?? x.activeWhenType,
      mode: ON[x.activeOnType]?.[l] ?? x.activeOnType,
      condition: conds.length ? conds.join(' · ') : (l === 'th' ? 'ไม่มีเงื่อนไขเฉพาะ' : 'None'),
      effect: abilityEffect(x, lang),
    }
  }
  const subs = (a.subs ?? []).filter(x => abilityEffect(x, lang) !== '—')
  const main = make(a)
  if (!subs.length) return [main]
  // ตัวหลักไม่มีผลของตัวเอง → แสดงเฉพาะผลย่อย (โอกาส/จังหวะของตัวหลัก)
  const rows = subs.map(x => ({ ...make(x), chance: main.chance, when: main.when, mode: main.mode }))
  return main.effect !== '—' ? [main, ...rows] : rows
}
