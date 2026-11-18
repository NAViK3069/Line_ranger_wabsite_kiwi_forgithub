// ====================================================
// PVP Tracker Scraper - Pure API version (ไม่ต้องเปิด browser)
// Rankings + Gear + Names ดึงจาก lerico.net API โดยตรง
// ====================================================

import { prisma } from './db'
import { redis, redisKey, REDIS_TTL } from './redis'
import { aggregateGearRanking } from './gearAggregate'
import {
  calcBasicEffectValue, calcSwitchableEffectValue, calcSkillPlusEffectValue,
  type BasicEffectGrowth, type SwitchableEffectGrowth, type SkillPlusEffectGrowth,
} from './gearLevelCalc'

// =========== DB helpers ===========

// โหลด league rankings: Redis → DB (fallback)
// Redis ช่วยลด DB network transfer — ทุก Vercel instance share cache เดียวกัน
async function loadLeagueRankingsFromDB(): Promise<void> {
  try {
    // ── ลองโหลดจาก Redis ก่อน ──
    if (redis) {
      let redisHits = 0
      // อ่านจาก LEAGUES ไม่ใช่ช่วงเลขตายตัว — ตัดลีคออกเมื่อไหร่ก็ไม่ไปขอคีย์ที่ไม่มีแล้ว
      const values = await redis.mget<string[]>(...LEAGUES.map(l => redisKey.league(l.value)))
      for (let i = 0; i < LEAGUES.length; i++) {
        const raw = values[i]
        if (!raw) continue
        try {
          const cached = typeof raw === 'string' ? JSON.parse(raw) : raw
          leagueCache.set(LEAGUES[i].value, cached)
          redisHits++
        } catch { /* JSON parse error → ข้ามไป */ }
      }
      if (redisHits > 0) {
        console.log(`[PvpScraper] Loaded ${redisHits} league rankings from Redis ✓`)
        return  // ได้จาก Redis แล้ว ไม่ต้อง query DB
      }
    }

    // ── Redis miss → ไม่โหลด DB ทั้งตารางแล้ว ──
    // เดิม findMany() ดึง league_rankings ทั้งตาราง (~7.5MB) ทุกครั้งที่ Redis miss
    // และฟังก์ชันนี้ถูกเรียกตอนโหลดโมดูล = ทุก cold start ของ Vercel → กิน Neon transfer มหาศาล
    // ตอนนี้เปลี่ยนเป็นโหลดทีละลีคแบบ lazy ผ่าน ensureLeagueLoaded() เฉพาะลีคที่ถูกเปิดจริง
    console.log('[PvpScraper] League rankings: Redis miss → จะโหลดทีละลีคแบบ lazy')
  } catch (err) {
    console.error('[PvpScraper] Failed to load rankings from Redis:', err)
  }
}

// ── เขียน DB แบบรวบไว้เขียนทีเดียวตอนท้าย (ใช้ตอน refresh รายวัน) ──
// Neon คิดเงินตามเวลาที่ compute ตื่น และตื่นค้างอีก 5 นาทีหลังคำสั่งสุดท้าย
// เดิมตัว refresh เขียนแถวลีค + แถวเกียร์ (100-200 แถว) ทันทีที่ scrape แต่ละลีคเสร็จ
// คำสั่งกระจายตลอดเวลาที่ scrape ทั้ง 10 ลีค → compute ตื่นตลอดทั้งรอบ
// ตอนนี้ scripts/refresh-pvp.ts เปิดโหมดนี้ → เก็บคำสั่งไว้ก่อน แล้วเขียนรวดเดียวตอนจบ (ตื่นแค่ไม่กี่นาที)
// คำสั่ง Prisma เป็น lazy (ยังไม่ยิงจนกว่าจะถูก await/then) จึงเก็บใส่คิวไว้ได้เลย
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbOp = any
let deferredDbOps: DbOp[] | null = null

export function beginDeferredDbWrites(): void {
  deferredDbOps = []
}

/** เขียนคำสั่งที่เก็บไว้ทั้งหมด เป็นก้อนละ 50 ผ่าน $transaction — คืนจำนวนแถวที่เขียน */
export async function flushDeferredDbWrites(): Promise<number> {
  const ops = deferredDbOps ?? []
  deferredDbOps = null
  const BATCH = 50
  for (let i = 0; i < ops.length; i += BATCH) {
    await prisma.$transaction(ops.slice(i, i + BATCH))
  }
  return ops.length
}

/** ยิงคำสั่งเขียนทันที หรือเก็บเข้าคิวถ้าอยู่ในโหมดรวบท้าย */
function dbWrite(op: DbOp, label: string): void {
  if (deferredDbOps) { deferredDbOps.push(op); return }
  op.catch((err: unknown) => console.error(`[PvpScraper] Failed to save ${label}:`, err))
}

// โหลด league เดียวจาก DB ถ้ายังไม่มีใน memory (lazy) — ใช้แทนการดึงทั้งตารางตอน boot
// ดึงแค่แถวเดียว (~535KB) แทนทั้งตาราง และเฉพาะลีคที่ผู้ใช้เปิดจริงเท่านั้น
async function ensureLeagueLoaded(league: number): Promise<void> {
  if (leagueCache.has(league)) return
  try {
    const row = await prisma.leagueRanking.findUnique({ where: { id: league } })
    if (!row) return
    const payload = {
      data: row.data as unknown as RangerStat[],
      teams: row.teams as unknown as TeamEntry[],
      fetchedAt: row.fetchedAt.getTime(),
      totalPlayers: row.totalPlayers,
    }
    leagueCache.set(row.id, payload)
    // เขียนกลับ Redis ด้วย — memory cache อยู่กับ instance เดียวเท่านั้น
    // ถ้าไม่เขียน ทุก instance ที่เกิดใหม่จะดึงแถวนี้ (~535KB) จาก Neon ซ้ำอีกคนละครั้ง
    // = ปลุก compute ใหม่ทุกครั้ง ทั้งที่เป็นข้อมูลชุดเดิมที่เปลี่ยนแค่วันละครั้ง
    // fetchedAt คงค่าจาก DB ไว้ เพราะ getMetaRangers ใช้ค่านี้ตัดสินความสด (ไม่ใช่เวลาที่เขียนแคช)
    if (redis) {
      redis.set(redisKey.league(league), JSON.stringify(payload), { ex: REDIS_TTL.leagueRanking })
        .catch((e) => console.error(`[Redis] Failed to warm league ${league}:`, e))
    }
  } catch (err) {
    console.error(`[PvpScraper] Failed to load league ${league} from DB:`, err)
  }
}

type BadgeRow = {
  id: string; grade: number | null; evolution: string | null; type: string | null
  element: string | null; elementOpen: string | null
}
let rangerBookMemo: Promise<BadgeRow[] | null> | null = null
function rangerBookFromRedis(): Promise<BadgeRow[] | null> {
  if (!rangerBookMemo) {
    rangerBookMemo = (async () => {
      if (!redis) return null
      try {
        const raw = await redis.get<string>(redisKey.rangerBookAll())
        if (!raw) return null
        const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { rangers?: BadgeRow[] }
        return Array.isArray(p.rangers) ? p.rangers : null
      } catch { return null }
    })()
  }
  return rangerBookMemo
}

/** ดาว/ชนิด/ธาตุ ของเรนเจอร์ที่ติดอันดับ — ดึงจาก ranger_book ที่ sync ไว้แล้ว
 *  ขอเฉพาะ id ที่ใช้จริง (52–200 แถว) ไม่ได้ดึงทั้งตาราง 3,081 แถว */
async function loadRangerBadges(ids: string[]): Promise<Map<string, {
  grade: number | null; evolution: string | null; type: string | null; element: string | null
}>> {
  const out = new Map<string, { grade: number | null; evolution: string | null; type: string | null; element: string | null }>()
  try {
    // อ่านจากแคช Ranger Book ใน Redis ก่อน (sync เขียนไว้ทั้งเล่มอยู่แล้ว) — ไม่ต้องปลุก Neon กลางรอบ scrape
    // โหลดครั้งเดียวต่อ process แล้วใช้ซ้ำทุกลีค ไม่มีค่อยตกไปถาม DB
    const book = await rangerBookFromRedis()
    const rows = book
      ? book.filter(r => ids.includes(r.id))
      : await prisma.rangerBook.findMany({
          where: { id: { in: ids } },
          select: { id: true, grade: true, evolution: true, type: true, element: true, elementOpen: true },
        })
    for (const r of rows) {
      // elementOpen: '0' = ไม่มีช่องธาตุ, '1' = มีช่องแต่ยังไม่ปลด, '2' = ปลดแล้ว
      // โชว์ธาตุเฉพาะตอนปลดแล้วเท่านั้น ให้ตรงกับที่เกมแสดง
      const hasElement = r.elementOpen === '2' && !!r.element && r.element !== 'none'
      out.set(r.id, {
        grade: r.grade, evolution: r.evolution, type: r.type,
        element: hasElement ? r.element : null,
      })
    }
  } catch (err) {
    // อ่านไม่ได้ → ไม่มีป้าย แต่ตารางอันดับยังใช้ได้ตามปกติ
    console.error('[PvpScraper] loadRangerBadges failed:', err)
  }
  return out
}

async function saveLeagueRankingToDB(
  league: number,
  data: RangerStat[],
  teams: TeamEntry[],
  totalPlayers: number,
  fetchedAt: number
): Promise<void> {
  try {
    dbWrite(prisma.leagueRanking.upsert({
      where: { id: league },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { data: data as any, teams: teams as any, totalPlayers, fetchedAt: new Date(fetchedAt) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { id: league, data: data as any, teams: teams as any, totalPlayers, fetchedAt: new Date(fetchedAt) },
    }), `ranking ${league}`)
    // ── บันทึกลง Redis ด้วย ──
    if (redis) {
      const payload = { data, teams, fetchedAt, totalPlayers }
      await redis.set(redisKey.league(league), JSON.stringify(payload), { ex: REDIS_TTL.leagueRanking })
        .catch((e) => console.error('[Redis] Failed to save league ranking:', e))
    }
  } catch (err) {
    console.error('[PvpScraper] Failed to save league ranking:', err)
  }
}

// โหลด gear: Redis batch keys (1 key/league) → DB fallback
// ใช้ batch key แทน index+individual keys เพื่อลด Redis commands
async function loadGearFromDB(): Promise<void> {
  try {
    if (redis) {
      // ── ลอง batch keys ก่อน: 1 key ต่อลีค (14 GETs รวมเป็น 1 MGET) ──
      const batchKeys = LEAGUES.map(l => redisKey.gearBatch(l.value))
      const batchValues = await redis.mget<string[]>(...batchKeys)
      let totalHits = 0
      let batchHits = 0
      for (let i = 0; i < LEAGUES.length; i++) {
        const raw = batchValues[i]
        if (!raw) continue
        try {
          const batch = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, { data: GearRanking; topSets: GearSet[]; sampled: number; fetchedAt: number }>
          for (const [rId, payload] of Object.entries(batch)) {
            // ตรวจ shape ก่อนเสมอ — กันค่าผิดชนิดจาก key ที่เคยชนกันมาเข้ามาปนใน memory cache
            // (ของเก่าที่ยังค้างใน Redis จนกว่า TTL 7 วันจะหมด ก็จะถูกกรองทิ้งตรงนี้)
            if (!payload || typeof payload !== 'object' || !('data' in payload) || !('fetchedAt' in payload)) continue
            gearMemCache.set(`${rId}:${LEAGUES[i].value}`, payload)
            totalHits++
          }
          if (totalHits > 0) batchHits++
        } catch { /* ข้ามไป */ }
      }
      if (batchHits > 0) {
        console.log(`[PvpScraper] Loaded ${totalHits} gear entries from Redis batch (${batchHits}/${LEAGUES.length} leagues) ✓`)
        // มี Redis hit แม้แต่บางส่วน → trust Redis, ไม่ต้อง findMany ทั้ง table
        // ลีคที่ขาด user จะเปิดได้แต่ gear ว่าง — GitHub Actions cron จะเติมในรอบถัดไป
        // (ลด Neon network transfer มหาศาล)
        return
      }
    }

    // ── static build: "DB" เป็นไฟล์ JSON ในเครื่อง อ่านทั้งตารางได้ฟรี ──
    // ต้องโหลดไว้ก่อน เพราะ withTopGear() (เกียร์ยอดนิยมใต้ชื่อในหน้า /meta) อ่านจาก gearMemCache เท่านั้น
    if (!redis) {
      const rows = await prisma.rangerGear.findMany()
      for (const r of rows) {
        gearMemCache.set(r.id, {
          data: r.gearData as GearRanking,
          topSets: r.topSets as GearSet[],
          sampled: r.sampled,
          fetchedAt: new Date(r.fetchedAt).getTime(),
        })
      }
      console.log(`[PvpScraper] Loaded ${rows.length} gear entries from file DB ✓`)
      return
    }

    // ── Redis ว่างเปล่า → ไม่ดึง DB ทั้งตารางแล้ว ──
    // เดิม findMany() ดึง ranger_gear ทั้งตาราง (~28MB / 7,979 แถว) ทุกครั้งที่ Redis miss
    // และฟังก์ชันนี้รันตอนโหลดโมดูล = ทุก cold start ของ Vercel → ตัวกิน Neon transfer อันดับ 1
    // ไม่จำเป็นเลยเพราะ getRangerDetail() มี lazy fallback ต่อ key อยู่แล้ว
    // (findUnique({ where: { id: `${rangerId}:${league}` } }) ~4KB ต่อครั้ง เฉพาะตัวที่เปิดจริง)
    console.log('[PvpScraper] Gear: Redis miss → จะโหลดทีละตัวแบบ lazy ตอนเปิดเรนเจอร์')
  } catch (err) {
    console.error('[PvpScraper] Failed to load gear from Redis:', err)
  }
}

// =========== Leagues ===========

export const LEAGUES = [
  { value: 0,  label: 'Legend',    pages: 2, apiName: 'LEGEND'    },
  { value: 1,  label: 'Master Ⅰ',  pages: 1, apiName: 'MASTER_1'  },
  { value: 2,  label: 'Master Ⅱ',  pages: 1, apiName: 'MASTER_2'  },
  { value: 3,  label: 'Master Ⅲ',  pages: 1, apiName: 'MASTER_3'  },
  { value: 4,  label: 'Diamond Ⅰ', pages: 1, apiName: 'DIAMOND_1' },
  { value: 5,  label: 'Diamond Ⅱ', pages: 1, apiName: 'DIAMOND_2' },
  { value: 6,  label: 'Diamond Ⅲ', pages: 1, apiName: 'DIAMOND_3' },
  { value: 7,  label: 'Gold Ⅰ',    pages: 1, apiName: 'GOLD_1'    },
  { value: 8,  label: 'Gold Ⅱ',    pages: 1, apiName: 'GOLD_2'    },
  { value: 9,  label: 'Gold Ⅲ',    pages: 1, apiName: 'GOLD_3'    },
  // Silver Ⅰ–Ⅲ (10–12) กับ Bronze (13) ถูกตัดออกแล้ว — ลีคล่างไม่มีใครดู
  // แต่กินทั้งแถวใน Neon, คีย์ใน Redis และรอบ refresh ของ cron เท่าลีคบนทุกประการ
  // ถ้าจะเอากลับ ใส่ค่าเดิมกลับมาได้เลย โค้ดที่เหลืออ่านจากอาเรย์นี้ทั้งหมด
]

/** ค่า league ที่ยังใช้งานอยู่ — ใช้ตรวจ input แทนการเขียนช่วงเลขตายตัว */
export const isValidLeague = (v: number): boolean => LEAGUES.some(l => l.value === v)

// =========== Translation API ===========
// ชื่อ Ranger: https://rangers.lerico.net/api/v2/translate?keys=en:UNIT
// ชื่อ Gear:   https://rangers.lerico.net/api/v2/translate?keys=en:EQUIP

const unitTranslateCache = new Map<string, string>()  // unitId     → ชื่อ เช่น "u001e-bella_snm" → "BELLA"
const equipTranslateCache = new Map<string, string>()  // itemCode_nm → ชื่อ เช่น "eq_2202_wpn_06_nm" → "[YSH]Hisui's Hiraikotsu"
const equipGradeCache = new Map<string, number>()       // itemCode   → equipGrade เช่น "eq_2305_acc_08" → 8
const itemSlotCache = new Map<string, string>()         // itemCode   → slot (WPN/AMR/ACC) local cache (warm-up เท่านั้น)

// =========== Equipment Effects Data ===========
// เก็บข้อมูล attributes + randomOptions + unlimitEffects + spAttributes
// สำหรับคำนวณ Effect ของเกียร์แต่ละชิ้น

interface RawEquipment {
  itemCode: string
  attr1?: number | null
  attr2?: number | null
  attr3?: number | null
  attr4?: number | null
  switchCode?: string | null
  skillPlusAttr1?: number | null
  skillPlusAttr2?: number | null
  equipGrade?: number | null
}

interface RawAttribute {
  attrNo: number
  reinforceType: string
  valueDivideGrades?: number
  minValue?: number
  maxValue?: number
  unitEquipRandOptTrigType?: string | null
}

interface RawRandomOption {
  attrNo: number
  groupCode: string
}

interface RawUnlimitEffect {
  rand_opt_trig_tp?: string
  reinf_tp?: string
  unlimit_cnt?: number
  stat_inc_amt?: number
}

interface RawSpAttribute {
  attrNo: number
  skillFactorApplyType?: string | null
  skillType?: string | null
  buffFactorType?: string | null
  targetFactorType?: string | null
  stat_inc_amt?: number[] | number
  minValue?: number
  maxValue?: number
  valueDivideGrades?: number
}

const equipDataCache      = new Map<string, RawEquipment>()
const attributesCache     = new Map<number, RawAttribute>()
const randomOptionsByGroup = new Map<string, RawRandomOption[]>()
const unlimitEffectsCache: RawUnlimitEffect[] = []
const spAttributesCache   = new Map<number, RawSpAttribute>()

// =========== Gear Effect Types (exported) ===========

export interface GearEffect {
  name: string
  value: string   // formatted e.g. "+8.4%", "+120"
  /** Translation key suffix (ใช้กับ EQUIP map) สำหรับแปลชื่อ multi-lang client-side
   *  e.g. "GEAR_ATTR_HP_INC_PCT_nm" หรือ "SKILL_PLUS_200191_nm"
   */
  nameKey?: string
  // ── raw growth params (มีแค่ตัวเดียวตาม effect kind) — ใช้คำนวณ value ใหม่ที่ level ใดๆ ฝั่ง client
  //    ผ่าน gearLevelCalc.ts (gear-book slider 0-15) โดยไม่ต้องยิง fetch ซ้ำ ──
  basicGrowth?: BasicEffectGrowth
  switchableGrowth?: SwitchableEffectGrowth
  skillPlusGrowth?: SkillPlusEffectGrowth
}

export interface GearEffects {
  itemCode: string
  basic: GearEffect[]
  switchable: {
    trigType: string | null   // trigType ของ option แรก (ไว้แสดง icon หลัก)
    effect: GearEffect | null // effect ของ option แรก (backward compat)
    allEffects: { trigType: string | null; effect: GearEffect }[]  // ทุก option พร้อม trigType
  } | null
  skillPlus: GearEffect[]
}

// ── Translation bundle type (เก็บ raw API responses เพื่อ replay ตอนโหลดจาก Redis) ──
interface TranslationBundle {
  units:    Record<string, string>
  equips:   Record<string, string>
  equipRaw: {
    equipments?:    RawEquipment[]
    attributes?:    RawAttribute[]
    spAttributes?:  RawSpAttribute[]
    randomOptions?: RawRandomOption[]
    unlimitEffects?: RawUnlimitEffect[]
  }
}

// ── Helper: apply bundle ลง in-memory caches ──
function applyTranslationBundle(bundle: TranslationBundle): void {
  // units
  unitTranslateCache.clear()
  for (const [k, v] of Object.entries(bundle.units)) unitTranslateCache.set(k, v)

  // equips (ลบ \n + collapse spaces)
  equipTranslateCache.clear()
  for (const [k, v] of Object.entries(bundle.equips)) {
    equipTranslateCache.set(k, v.replace(/\\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
  }

  // equipment raw data
  const raw = bundle.equipRaw
  equipGradeCache.clear()
  equipDataCache.clear()
  for (const eq of raw.equipments ?? []) {
    if (!eq.itemCode) continue
    equipDataCache.set(eq.itemCode, eq)
    if (eq.equipGrade != null) equipGradeCache.set(eq.itemCode, eq.equipGrade)
  }
  attributesCache.clear()
  for (const attr of raw.attributes ?? [])
    if (attr.attrNo != null) attributesCache.set(attr.attrNo, attr)
  spAttributesCache.clear()
  for (const sp of raw.spAttributes ?? [])
    if (sp.attrNo != null) spAttributesCache.set(sp.attrNo, sp)
  randomOptionsByGroup.clear()
  for (const opt of raw.randomOptions ?? []) {
    if (!opt.groupCode) continue
    const list = randomOptionsByGroup.get(opt.groupCode) ?? []
    list.push(opt)
    randomOptionsByGroup.set(opt.groupCode, list)
  }
  unlimitEffectsCache.length = 0
  for (const ue of raw.unlimitEffects ?? []) unlimitEffectsCache.push(ue)
}

export async function loadTranslations(force = false): Promise<void> {
  // ── 1. ลอง Redis ก่อน — ลด cold start overhead (3 lerico.net calls → 1 Redis read) ──
  //    force = true → ข้าม Redis ไป fetch lerico สดเลย (ใช้ตอน admin sync เพื่อดึง gear ใหม่)
  if (!force && redis) {
    try {
      const cached = await redis.get<string>(redisKey.translations())
      if (cached) {
        const bundle = typeof cached === 'string' ? JSON.parse(cached) : cached as TranslationBundle
        applyTranslationBundle(bundle)
        console.log(`[Translate] ✓ Redis cache — ${unitTranslateCache.size} units, ${equipDataCache.size} equips`)
        return
      }
    } catch { /* Redis unavailable → fallback to lerico.net */ }
  }

  // ── 2. Fetch จาก lerico.net ──
  try {
    const [unitRes, equipRes, equipDataRes] = await Promise.all([
      fetch('https://rangers.lerico.net/api/v2/translate?keys=en:UNIT', {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch('https://rangers.lerico.net/api/v2/translate?keys=en:EQUIP', {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch('https://rangers.lerico.net/api/v2/equipments', {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
    ])

    let units: Record<string, string> = {}
    let equips: Record<string, string> = {}
    let equipRaw: TranslationBundle['equipRaw'] = {}

    if (unitRes.ok) {
      const raw = await unitRes.json() as Record<string, unknown>
      units = (raw['en:UNIT'] ?? raw) as Record<string, string>
    }
    if (equipRes.ok) {
      const raw = await equipRes.json() as Record<string, unknown>
      equips = (raw['en:EQUIP'] ?? raw) as Record<string, string>
    }
    if (equipDataRes.ok) {
      equipRaw = await equipDataRes.json() as TranslationBundle['equipRaw']
    }

    const bundle: TranslationBundle = { units, equips, equipRaw }
    applyTranslationBundle(bundle)

    console.log(
      `[Translate] ✓ lerico.net — ${unitTranslateCache.size} units, ${equipTranslateCache.size} equips, ` +
      `${equipDataCache.size} items, ${attributesCache.size} attrs`
    )

    // ── 3. บันทึกลง Redis (24h TTL) — cold start ถัดไปใช้ Redis แทน lerico.net ──
    if (redis && unitTranslateCache.size > 0) {
      redis.set(redisKey.translations(), JSON.stringify(bundle), {
        ex: REDIS_TTL.translations,
      }).catch(() => {})
    }
  } catch (err) {
    console.error('[Translate] Failed to load translations:', err)
  }
}

// ชื่อ gear จาก itemCode (ลองทั้ง _nm suffix และไม่มี)
function gearName(itemCode: string): string {
  return equipTranslateCache.get(`${itemCode}_nm`)
    ?? equipTranslateCache.get(itemCode)
    ?? itemCode
}

// ชื่อ ranger จาก unitId — ลอง _nm suffix ก่อน เช่น u1556e-af_nm → "Telepath Anya"
function unitName(unitId: string): string {
  return unitTranslateCache.get(`${unitId}_nm`)
    ?? unitTranslateCache.get(unitId)
    ?? unitId
}

// icon URL จาก itemCode เช่น eq_2309_acc_08 → .../res/gear_icon/eq_2309_acc_08_icon.png
function gearIconUrl(itemCode: string): string {
  return `https://rangers.lerico.net/res/gear_icon/${itemCode}_icon.png`
}

// grade จาก equipGrade ใน /api/v2/equipments — แม่นยำกว่า currentGrade จาก player
function gearGrade(itemCode: string): number | null {
  return equipGradeCache.get(itemCode) ?? null
}

// export สำหรับใช้ใน API routes เป็น fallback กรณี grade เป็น null ใน DB
export function getEquipGrade(itemCode: string): number | null {
  return equipGradeCache.get(itemCode) ?? null
}

// =========== Gear Effects Computation ===========
// คำนวณค่า Effect ของเกียร์ที่ค่าสูงสุด (max grade) + enchant +5
//
// สูตร: value = (minValue + (maxValue-minValue)/(valueDivideGrades-1) * ValueGrade) * (currentEnchant+1)
// ที่ max grade: value = maxValue
// ที่ +5 max enchant: คูณ 6
// ถ้า valueDivideGrades === 1: ค่าคงที่ = minValue === maxValue

// สูตรคำนวณ (Basic ×enchant+1 / Switchable baseMax+step×level / SKILL+ base+sum(stat_inc_amt))
// ย้ายไป gearLevelCalc.ts (pure function ใช้ร่วมกับ client — gear-book slider คำนวณสดไม่ต้อง fetch ซ้ำ)

function attrDisplayName(reinforceType: string): string {
  return equipTranslateCache.get(`GEAR_ATTR_${reinforceType}_nm`)
    ?? equipTranslateCache.get(reinforceType)
    ?? reinforceType
}

function buildBasicEffect(attr: RawAttribute, enchant = 5): GearEffect | null {
  if (!attr.reinforceType) return null
  const growth: BasicEffectGrowth = { maxValue: attr.maxValue ?? attr.minValue ?? 0, reinforceType: attr.reinforceType }
  return {
    name: attrDisplayName(attr.reinforceType),
    value: calcBasicEffectValue(growth, enchant),
    nameKey: `GEAR_ATTR_${attr.reinforceType}_nm`,
    basicGrowth: growth,
  }
}

// unlimitLevel default 5 (max) — ดู comment สูตรใน gearLevelCalc.ts
function buildSwitchableEffect(attr: RawAttribute, unlimitLevel = 5): GearEffect | null {
  if (!attr.reinforceType) return null
  const baseMax = attr.maxValue ?? attr.minValue ?? 0
  const trigType = attr.unitEquipRandOptTrigType

  // หา unlimit step จาก unlimitEffects: จับคู่ด้วย rand_opt_trig_tp + reinf_tp
  let unlimitStep = 0
  if (trigType) {
    const matches = unlimitEffectsCache.filter(
      (ue) => ue.rand_opt_trig_tp === trigType && ue.reinf_tp === attr.reinforceType
    )
    if (matches.length > 0) {
      // per-step increment
      unlimitStep = matches[0].stat_inc_amt ?? 0
    }
  }
  const growth: SwitchableEffectGrowth = { baseMax, unlimitStep, reinforceType: attr.reinforceType }
  return {
    name: attrDisplayName(attr.reinforceType),
    value: calcSwitchableEffectValue(growth, unlimitLevel),
    nameKey: `GEAR_ATTR_${attr.reinforceType}_nm`,
    switchableGrowth: growth,
  }
}

// enchant default 5 (max) — ดู comment สูตรใน gearLevelCalc.ts
function buildSkillPlusEffect(attrNo: number, sp: RawSpAttribute, enchant = 5): GearEffect | null {
  const base = sp.maxValue ?? sp.minValue ?? 0
  // normalize stat_inc_amt เป็น array เสมอ (เลขเดี่ยว → array 5 ช่องค่าเท่ากัน สรุปผลรวมเหมือนเดิม)
  const statIncAmt = Array.isArray(sp.stat_inc_amt)
    ? sp.stat_inc_amt
    : Array(5).fill(sp.stat_inc_amt ?? 0)

  // ชื่อ SKILL+ จาก SKILL_PLUS_{attrNo}_nm
  const rawName = equipTranslateCache.get(`SKILL_PLUS_${attrNo}_nm`) ?? `SKILL_PLUS_${attrNo}`

  // format ค่า: MUL = %, ADD + duration skillType = sec, อื่นๆ = ตัวเลขปกติ
  // skillFactorApplyType มีแค่ 'ADD' | 'MUL' (ไม่มี 'SEC' ใน API จริง)
  // sec-based skills: SILENCE (ทำให้ใช้สกิลไม่ได้), TEMPT (charm), STUN, POLYMORPH
  const SEC_SKILL_TYPES = new Set(['SILENCE', 'TEMPT', 'STUN', 'POLYMORPH', 'DOT', 'DOTHEAL', 'BUBBLE'])
  // attrNo ที่ทราบว่าเป็น sec-based แต่ skillType ไม่ได้อยู่ใน SEC_SKILL_TYPES
  // (ตรวจสอบจาก gameplay: ค่า +X.X คือวินาทีที่เพิ่มให้สกิล)
  const SEC_ATTRNO = new Set([
    200191,  // Changes regular attacks to area attacks (+sec)
    200151,  // Creates a shield over an area (+sec)
    200201,  // Changes enemy types (+sec)
    200381,  // Turns enemies in range into allies (+sec)
    200431,  // Continuously cancels enemy invincibility (+sec)
    200441,  // Continuously cancels enemy buffs (+sec)
  ])
  const applyType = sp.skillFactorApplyType ?? ''
  const isPct = applyType === 'MUL'
  const isSec = applyType === 'ADD' && (SEC_SKILL_TYPES.has(sp.skillType ?? '') || SEC_ATTRNO.has(attrNo))
  const growth: SkillPlusEffectGrowth = { base, statIncAmt, isPct, isSec }

  // cleanName: แทน \\n ด้วย space และ collapse หลาย space เป็น space เดียว
  // สำคัญ: API บางตัวมี "\\n" กลางชื่อ เช่น "Applies charm effect \\nto N enemies"
  // ถ้าไม่ collapse → double-space → regex match ล้มเหลว
  // ชื่อ SKILL+ แสดง N ตัวใหญ่ตามต้นฉบับ (N = placeholder หมายเลขจาก skill description)
  const cleanName = rawName.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()

  // ทั้ง N-template และ non-N ต่างคืน { name, value } — value แสดงที่ column ขวาของ SKILL+ section
  return { name: cleanName, value: calcSkillPlusEffectValue(growth, enchant), nameKey: `SKILL_PLUS_${attrNo}_nm`, skillPlusGrowth: growth }
}

// 3-level enchant: แยกควบคุม basic / switchable / skill+ ได้อิสระ
//   • basic / skillPlus: 0-5 (สูตรคูณ enchant+1 / bonus stat_inc_amt)
//   • switchable: 0-5 (สูตร base + unlimit*lv)
// ใช้ตอน gear-book slider เลื่อนระดับรวม 0-15:
//   slider 0-5  → basic=N,  switch=0, skill+=0
//   slider 6-10 → basic=5,  switch=N-5, skill+=0
//   slider 11-15→ basic=5,  switch=5,   skill+=N-10
export interface EnchantLevels { basic: number; switchable: number; skillPlus: number }

function toLevels(input: number | EnchantLevels): EnchantLevels {
  if (typeof input === 'number') return { basic: input, switchable: input, skillPlus: input }
  return input
}

/** All 3 levels at max (5,5,5) — เกณฑ์ที่ใช้ Redis cache */
function isMaxAll(lv: EnchantLevels): boolean {
  return lv.basic === 5 && lv.switchable === 5 && lv.skillPlus === 5
}

export function getGearEffects(itemCode: string, input: number | EnchantLevels = 5): GearEffects | null {
  const eq = equipDataCache.get(itemCode)
  if (!eq) return null
  const lv = toLevels(input)

  // Basic Effects (attr1, attr2, attr3) — ใช้ lv.basic
  const basic: GearEffect[] = []
  for (const attrNo of [eq.attr1, eq.attr2, eq.attr3]) {
    if (!attrNo) continue
    const attr = attributesCache.get(attrNo)
    if (!attr) continue
    const eff = buildBasicEffect(attr, lv.basic)
    if (eff) basic.push(eff)
  }

  // Switchable Effect — ใช้ lv.switchable
  let switchable: GearEffects['switchable'] = null
  if (eq.switchCode) {
    const options = randomOptionsByGroup.get(eq.switchCode) ?? []
    const first = options[0]
    if (first) {
      const optAttr = attributesCache.get(first.attrNo)
      if (optAttr) {
        const allEffects: { trigType: string | null; effect: GearEffect }[] = []
        for (const opt of options) {
          const a = attributesCache.get(opt.attrNo)
          if (!a) continue
          const eff = buildSwitchableEffect(a, lv.switchable)
          if (eff) allEffects.push({ trigType: a.unitEquipRandOptTrigType ?? null, effect: eff })
        }
        switchable = {
          trigType: optAttr.unitEquipRandOptTrigType ?? null,
          effect: buildSwitchableEffect(optAttr, lv.switchable),
          allEffects,
        }
      }
    }
  }

  // SKILL+ (skillPlusAttr1, skillPlusAttr2) — ใช้ lv.skillPlus
  const skillPlus: GearEffect[] = []
  for (const attrNo of [eq.skillPlusAttr1, eq.skillPlusAttr2]) {
    if (!attrNo) continue
    const sp = spAttributesCache.get(attrNo)
    if (!sp) continue
    const eff = buildSkillPlusEffect(attrNo, sp, lv.skillPlus)
    if (eff) skillPlus.push(eff)
  }

  return { itemCode, basic, switchable, skillPlus }
}

// =========== League Rankings API ===========

interface LeagueApiPlayerInfo {
  mid: string
  player?: { usePvPTeamNo?: number }
  playerUnitTeamGroupMap?: {
    pvpteam?: Record<string, { unitCode: string }[]>
  }
}

async function fetchLeagueFromAPI(league: number): Promise<TeamEntry[] | null> {
  const leagueInfo = LEAGUES.find((l) => l.value === league)
  if (!leagueInfo) return null

  try {
    const res = await fetch(
      `https://rangers.lerico.net/api/v2/pvp/league/rank/${leagueInfo.apiName}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) return null

    const data = await res.json() as {
      top100?: { rank: number; mid: string }[]
      playerInfo?: LeagueApiPlayerInfo[]
    }
    if (!data.top100?.length) return null

    const infoMap = new Map((data.playerInfo ?? []).map((p) => [p.mid, p]))
    // teams = 1 entry ต่อ pvpteam slot ต่อ player (นับทุก slot)
    const teams: TeamEntry[] = []

    for (const entry of data.top100) {
      const info = infoMap.get(entry.mid)
      if (!info) continue

      const teamSlots = info.playerUnitTeamGroupMap?.pvpteam ?? {}
      // วนทุก slot (1, 2, ...) ไม่ใช่แค่ defense
      for (const units of Object.values(teamSlots)) {
        const rangerInstances: Record<string, number> = {}
        for (const unit of units) {
          if (unit.unitCode) rangerInstances[unit.unitCode] = (rangerInstances[unit.unitCode] ?? 0) + 1
        }
        const rangers = Object.keys(rangerInstances)
        if (rangers.length > 0) {
          teams.push({ rank: entry.rank, playerId: entry.mid, rangers, rangerInstances })
        }
      }
    }

    const uniquePlayers = data.top100.length
    console.log(`[API] ✓ ${leagueInfo.label}: ${uniquePlayers} players, ${teams.length} team-slots`)
    return teams.length > 0 ? teams : null
  } catch (err) {
    console.error(`[API] Failed to fetch ${leagueInfo?.apiName}:`, err)
    return null
  }
}

// =========== Player Gear API ===========

// แยก WEAPON/ARMOR/ACC ออกจาก unit object
// โครงสร้างจริงจาก API: unit.equipMap = { WEAPON: { itemCode }, ARMOR: { itemCode }, ACC: { itemCode } }
// รองรับ fallback กรณี structure ต่างกัน
function extractGearFromUnit(unit: Record<string, unknown>): { slot: string; itemCode: string }[] {
  const gear: { slot: string; itemCode: string }[] = []
  const slotDefs = [
    { key: 'WEAPON', slot: 'WPN' },
    { key: 'ARMOR',  slot: 'AMR' },
    { key: 'ACC',    slot: 'ACC' },
  ]

  // ✅ แบบหลัก (จาก getPlayer API): unit.equipMap.{WEAPON|ARMOR|ACC}.itemCode
  const equipMap = unit.equipMap as Record<string, { itemCode?: string }> | undefined
  if (equipMap && typeof equipMap === 'object') {
    for (const { key, slot } of slotDefs) {
      const val = equipMap[key]
      if (val?.itemCode) {
        gear.push({ slot, itemCode: val.itemCode })
        const c = val.itemCode
        itemSlotCache.set(c, slot)
        // NX = set only if key does NOT exist in Redis ← เขียนแค่ครั้งเดียวตลอด 30 วัน
        // ป้องกัน cold-start ทุก instance เขียนซ้ำ (ต่างจาก in-memory check ที่ instance-local)
        if (redis && !c.includes('_wpn_') && !c.includes('_amr_') && !c.includes('_acc_')) {
          redis.set(redisKey.itemSlot(c), slot, { ex: REDIS_TTL.itemSlot, nx: true }).catch(() => {})
        }
      }
    }
    if (gear.length > 0) return gear
  }

  // Fallback A: property ตรงบน unit (unit.WEAPON.itemCode)
  for (const { key, slot } of slotDefs) {
    const val = unit[key] as { itemCode?: string } | undefined
    if (val?.itemCode) {
      gear.push({ slot, itemCode: val.itemCode })
      const c = val.itemCode
      itemSlotCache.set(c, slot)
      if (redis && !c.includes('_wpn_') && !c.includes('_amr_') && !c.includes('_acc_')) {
        redis.set(redisKey.itemSlot(c), slot, { ex: REDIS_TTL.itemSlot, nx: true }).catch(() => {})
      }
    }
  }
  if (gear.length > 0) return gear

  // Fallback B: detect slot จาก itemCode pattern (_wpn_, _amr_, _acc_)
  for (const obj of [unit, ...(equipMap ? [equipMap] : [])]) {
    for (const val of Object.values(obj)) {
      if (typeof val !== 'object' || val === null) continue
      const item = val as { itemCode?: string }
      if (!item.itemCode) continue
      const slot = item.itemCode.includes('_wpn_') ? 'WPN'
        : item.itemCode.includes('_amr_') ? 'AMR'
        : item.itemCode.includes('_acc_') ? 'ACC'
        : ''
      if (slot && !gear.some((g) => g.slot === slot))
        gear.push({ slot, itemCode: item.itemCode })
    }
    if (gear.length > 0) return gear
  }

  return gear
}

// ดึง gear ของ player 1 คน — คืน Map<rangerId, gear[]> สำหรับทุก ranger ในทีม
// โครงสร้างจริง: data.playerUnitTeamGroupMap.pvpteam["1"][unit].equipMap.{WEAPON|ARMOR|ACC}.itemCode
async function fetchPlayerGearViaAPI(
  mid: string
): Promise<Map<string, { slot: string; itemCode: string }[]> | null> {
  try {
    const res = await fetch(`https://rangers.lerico.net/api/getPlayer/${mid}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as Record<string, any>
    // ✅ path จริง: playerUnitTeamGroupMap.pvpteam (ไม่ใช่ top-level pvpteam)
    const pvpteam = data?.playerUnitTeamGroupMap?.pvpteam
    if (!pvpteam) return null

    const result = new Map<string, { slot: string; itemCode: string }[]>()

    for (const slotValue of Object.values(pvpteam)) {
      const units: Record<string, unknown>[] = Array.isArray(slotValue)
        ? slotValue as Record<string, unknown>[]
        : (slotValue !== null && typeof slotValue === 'object'
            ? [slotValue as Record<string, unknown>]
            : [])

      for (const unit of units) {
        const rId = unit.unitCode as string | undefined
        if (!rId) continue
        if (result.has(rId)) continue  // เอา slot แรกที่เจอ

        const gear = extractGearFromUnit(unit)
        if (gear.length > 0) result.set(rId, gear)
      }
    }
    return result.size > 0 ? result : null
  } catch {
    return null
  }
}

// ดึง gear ของ ranger ที่ต้องการจาก player คนเดียว
// คืน array ของ gear set — 1 set ต่อ 1 instance ของ ranger (ทีม A + ทีม B รวมกัน)
// เช่น ถ้า ranger อยู่ทั้ง slot "1" และ "2" จะได้ 2 sets
async function fetchRangerGearFromPlayer(
  mid: string,
  targetRangerId: string
): Promise<{ slot: string; itemCode: string }[][] | null> {
  try {
    const res = await fetch(`https://rangers.lerico.net/api/getPlayer/${mid}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as Record<string, any>
    // ✅ path จริง: playerUnitTeamGroupMap.pvpteam
    const pvpteam = data?.playerUnitTeamGroupMap?.pvpteam
    if (!pvpteam) return null

    const allInstances: { slot: string; itemCode: string }[][] = []

    for (const slotValue of Object.values(pvpteam)) {
      const units: Record<string, unknown>[] = Array.isArray(slotValue)
        ? slotValue as Record<string, unknown>[]
        : (slotValue !== null && typeof slotValue === 'object'
            ? [slotValue as Record<string, unknown>]
            : [])

      for (const unit of units) {
        if (unit.unitCode !== targetRangerId) continue
        const gear = extractGearFromUnit(unit)
        if (gear.length > 0) allInstances.push(gear)  // เก็บแต่ละ instance แยกกัน
      }
    }
    return allInstances.length > 0 ? allInstances : null
  } catch {
    return null
  }
}

// =========== Types ===========

export interface TeamEntry {
  rank: number
  playerId: string
  rangers: string[]
  rangerInstances: Record<string, number>
}

export interface RangerStat {
  id: string
  name: string
  imageUrl: string
  count: number       // จำนวนผู้ใช้ (unique players)
  totalCount: number  // จำนวนเรนเจอร์รวม (นับ duplicate ด้วย)
  minRank: number
  // ── ป้ายในคอลัมน์ Name (ดาว / ชนิด / ธาตุ) ──
  // เติมตอน refresh จากตาราง ranger_book ที่ sync อยู่แล้วทุกวัน
  // เก็บติดมากับอันดับเลย ฝั่ง browser จึงไม่ต้องโหลด ranger book (700KB) มาเทียบเอง
  grade?: number
  evolution?: string        // normal / ultra / hyper — ใช้เลือกรูปดาว (+ = ultra, # = hyper)
  type?: string             // STR / AGI / INT
  element?: string | null   // null = ไม่มีธาตุ หรือยังไม่ปลดล็อคช่องธาตุ
}

export interface GearItem {
  slot: string
  name: string
  iconUrl: string
  grade: number | null
  count: number
}

export interface GearRanking {
  WPN: GearItem[]
  AMR: GearItem[]
  ACC: GearItem[]
}

export interface GearSet {
  WPN: string; WPNIcon: string
  AMR: string; AMRIcon: string
  ACC: string; ACCIcon: string
  count: number
}

export interface RangerDetailResult {
  id: string
  name: string
  imageUrl: string
  gear: GearRanking
  topSets: GearSet[]
  gearFromCache: boolean
  gearLoading: boolean
  usersInLeague: number
  gearSampled: number
}

export interface MetaResult {
  rangers: RangerStat[]
  fetchedAt: number
  fromCache: boolean
  isStale: boolean
  hasPartialNames: boolean
  totalPlayers: number
}

// =========== Caches ===========

// EMIT_NO_SCRAPE=1 (ตอน scripts/emit-data.ts เขียนไฟล์ JSON) → ถือว่าข้อมูลใน .data/db สดเสมอ
// ห้าม scrape lerico ใหม่ระหว่างเขียนไฟล์ — การ scrape ทำแยกใน scripts/refresh-pvp.ts แล้ว
const NO_SCRAPE      = process.env.EMIT_NO_SCRAPE === '1'
const CACHE_TTL      = NO_SCRAPE ? Infinity : 10 * 60 * 1000   // ranking stale ใน 10 นาที
const GEAR_CACHE_TTL = NO_SCRAPE ? Infinity : 2 * 60 * 60 * 1000

const leagueCache = new Map<number, {
  data: RangerStat[]
  teams: TeamEntry[]
  fetchedAt: number
  totalPlayers: number
}>()

const gearMemCache = new Map<string, {
  data: GearRanking
  topSets: GearSet[]
  sampled: number
  fetchedAt: number
}>()

const refreshingLeagues = new Set<number>()

// ── เกียร์ที่ใช้มากสุดของแต่ละช่อง (ชุดเดียวกับที่ป๊อปอัพรายละเอียดเรนเจอร์โชว์ในโหมดเมต้า) ──
// อ่านจาก gearMemCache ที่โหลดจาก Redis ตอน boot อยู่แล้ว — ไม่แตะ DB และไม่มี request เพิ่มฝั่ง browser
export interface TopGearItem { name: string; iconUrl: string; grade: number | null }
export type TopGear = Partial<Record<'WPN' | 'AMR' | 'ACC', TopGearItem>>

export function withTopGear<T extends { id: string }>(rangers: T[], league: number): (T & { topGear?: TopGear })[] {
  return rangers.map((r) => {
    const g = gearMemCache.get(`${r.id}:${league}`)?.data
    if (!g) return r
    const top: TopGear = {}
    for (const slot of ['WPN', 'AMR', 'ACC'] as const) {
      const it = g[slot]?.[0]
      if (!it) continue
      // grade ว่างในข้อมูลเก่า → หาจากรหัสเกียร์ในชื่อไฟล์ไอคอน
      const code = it.iconUrl.match(/\/gear_icon\/(.+)_icon\.png$/)?.[1]
      top[slot] = { name: it.name, iconUrl: it.iconUrl, grade: it.grade ?? (code ? getEquipGrade(code) : null) }
    }
    return Object.keys(top).length ? { ...r, topGear: top } : r
  })
}

// โหลด DB cache + translations พร้อมกัน ตอน boot
const cacheReady: Promise<void> = Promise.all([
  loadLeagueRankingsFromDB(),
  loadGearFromDB(),
  loadTranslations(),
]).then(() => {})

// export สำหรับ routes อื่นที่ต้องรอ cache พร้อมก่อนใช้ getGearEffects
export async function awaitCacheReady(): Promise<void> {
  await cacheReady
}

// ── ensureGearData: โหลดเฉพาะ gear data (ไม่รอ PVP rankings) ──
// ใช้ใน sync route เพื่อ pre-cache gear effects โดยไม่ต้องโหลด cacheReady ทั้งหมด
let gearDataLoadPromise: Promise<void> | null = null

export async function ensureGearData(force = false): Promise<void> {
  // force = true → fetch lerico สดเสมอ (ข้ามทั้ง in-memory + Redis cache)
  //   ใช้ตอน admin sync เพื่อให้ได้ gear ใหม่ล่าสุด ไม่ติด cache เก่า 7 วัน
  if (force) {
    await loadTranslations(true)
    return
  }
  if (equipDataCache.size > 0) return  // โหลดแล้ว (จาก cacheReady หรือ call ก่อนหน้า)
  if (!gearDataLoadPromise) {
    gearDataLoadPromise = loadTranslations().finally(() => { gearDataLoadPromise = null })
  }
  await gearDataLoadPromise
}

// ── getAllGearItems: คืน list เกียร์ทั้งหมดจาก cache ──
export interface GearBookItem {
  itemCode: string
  name: string
  grade: number | null
  slot: string | null   // "WPN" | "AMR" | "ACC" | null
}

export function getAllGearItems(): GearBookItem[] {
  const items: GearBookItem[] = []
  for (const itemCode of equipDataCache.keys()) {
    const name = equipTranslateCache.get(`${itemCode}_nm`)
      ?? equipTranslateCache.get(itemCode)
      ?? itemCode
    const grade = equipGradeCache.get(itemCode) ?? null
    const slot = itemCode.includes('_wpn_') ? 'WPN'
      : itemCode.includes('_amr_') ? 'AMR'
      : itemCode.includes('_acc_') ? 'ACC'
      : itemSlotCache.get(itemCode) ?? null   // fallback: ใช้ slot ที่เรียนรู้จาก pvp data (สำหรับ item เก่า เช่น eq_2310_est_18)
    items.push({ itemCode, name, grade, slot })
  }
  return items
}

// async wrapper ของ getGearEffects
// ลำดับ: Redis cache → in-memory cache → โหลด lerico.net ใหม่
let equipmentsLoadPromise: Promise<void> | null = null

export async function getGearEffectsAsync(itemCode: string, input: number | EnchantLevels = 5): Promise<GearEffects | null> {
  const lv = toLevels(input)
  // ── 1. ตรวจ Redis ก่อน (pre-cached ตอน sync — ไม่ต้องการ lerico.net เลย) ──
  // ⚠️ cache เก็บเฉพาะตอน level all-max (basic=5, switch=5, skillPlus=5)
  //    ถ้าไม่ใช่ all-max → ข้าม cache (ไม่งั้นจะได้ค่า max กลับเสมอ)
  if (redis && isMaxAll(lv)) {
    try {
      const cached = await redis.get<string>(redisKey.gearEffects(itemCode))
      if (cached !== null) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached as GearEffects | null
      }
    } catch {
      // Redis error → fall through to normal path
    }
  }

  // ── 2. ตรวจ in-memory cache (โหลดแล้ว) ──
  await cacheReady
  if (!equipDataCache.get(itemCode)) {
    // ── 3. Cache miss → reload translations จาก lerico.net ──
    if (!equipmentsLoadPromise) {
      console.log(`[GearEffects] cache miss for ${itemCode} — reloading translations`)
      equipmentsLoadPromise = loadTranslations().finally(() => { equipmentsLoadPromise = null })
    }
    await equipmentsLoadPromise
  }
  return getGearEffects(itemCode, lv)
}

// =========== Public helpers ===========

export function getCachedTeams(league: number): TeamEntry[] {
  return leagueCache.get(league)?.teams ?? []
}

export function isLeagueRefreshing(league: number): boolean {
  return refreshingLeagues.has(league)
}

export function isGearRefreshing(_league: number): boolean {
  return false // gear refresh รวมอยู่ใน ranking refresh แล้ว
}

export function getMetaRangersFromCache(league: number): MetaResult | null {
  const cached = leagueCache.get(league)
  if (!cached) return null
  return {
    rangers: cached.data,
    fetchedAt: cached.fetchedAt,
    fromCache: true,
    isStale: Date.now() - cached.fetchedAt > CACHE_TTL,
    hasPartialNames: false,
    totalPlayers: cached.totalPlayers,
  }
}

// =========== getMetaRangers (public) ===========
// 1 pack = rankings + gear + names ในลีคนั้น ดึงพร้อมกันทั้งหมด

export async function getMetaRangers(
  league: number,
  force = false,
  onProgress?: (done: number, total: number) => void
): Promise<MetaResult> {
  await cacheReady
  // ดึงลีคนี้จาก DB ถ้า Redis miss (แถวเดียว) — กันไม่ให้ต้องไป scrape lerico ใหม่ทั้งลีคโดยไม่จำเป็น
  if (!force) await ensureLeagueLoaded(league)

  const cached = leagueCache.get(league)
  if (cached && !force && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return {
      rangers: cached.data,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
      isStale: false,
      hasPartialNames: false,
      totalPlayers: cached.totalPlayers,
    }
  }

  // ── ลอง Redis ก่อน scrape (ทั้ง force=true และ false) ──
  // force=false → freshness = Redis TTL (12h)
  // force=true  → freshness = 1h (cooldown ป้องกัน scrape ถี่เกิน แม้แต่ cron/admin)
  if (redis) {
    try {
      const raw = await redis.get<string>(redisKey.league(league))
      if (raw) {
        const redisData = typeof raw === 'string' ? JSON.parse(raw) : raw
        const FRESH_MS = force
          ? 60 * 60 * 1000                    // force=true: cooldown 1h
          : REDIS_TTL.leagueRanking * 1000    // force=false: TTL เต็ม (12h)
        if (redisData.fetchedAt && Date.now() - redisData.fetchedAt < FRESH_MS) {
          leagueCache.set(league, redisData)
          return {
            rangers: redisData.data,
            fetchedAt: redisData.fetchedAt,
            fromCache: true,
            isStale: false,
            hasPartialNames: false,
            totalPlayers: redisData.totalPlayers,
          }
        }
      }
    } catch { /* Redis unavailable → ดำเนินการ scrape ต่อ */ }
  }

  // ถ้ากำลัง refresh อยู่แล้ว — คืน cache เก่าทันที (ไม่รอ)
  if (refreshingLeagues.has(league)) {
    if (cached) {
      return {
        rangers: cached.data,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        isStale: true,
        hasPartialNames: false,
        totalPlayers: cached.totalPlayers,
      }
    }
    // ยังไม่มี cache เลย — รอจนเสร็จ
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!refreshingLeagues.has(league)) { clearInterval(check); resolve() }
      }, 500)
    })
    const c = leagueCache.get(league)
    if (c) return { rangers: c.data, fetchedAt: c.fetchedAt, fromCache: true, isStale: false, hasPartialNames: false, totalPlayers: c.totalPlayers }
    throw new Error('League data unavailable')
  }

  refreshingLeagues.add(league)
  const leagueInfo = LEAGUES.find((l) => l.value === league) ?? LEAGUES[0]
  console.log(`[PvpScraper] Fetching pack: ${leagueInfo.label}...`)

  try {
    // ── Step 1: ดึง Rankings ──
    const allTeams = await fetchLeagueFromAPI(league)
    if (!allTeams || allTeams.length === 0) {
      throw new Error(`No teams returned from API for ${leagueInfo.label}`)
    }

    // ── Step 2: ดึง Gear ทุก player พร้อมกัน (batch 10) + retry ──
    const playerIds = [...new Set(allTeams.map((t) => t.playerId).filter(Boolean))]
    const gearByPlayer = new Map<string, Map<string, { slot: string; itemCode: string }[]>>()

    const BATCH = 10
    const failedIds: string[] = []

    for (let i = 0; i < playerIds.length; i += BATCH) {
      const batch = playerIds.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map(fetchPlayerGearViaAPI))
      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value) {
          gearByPlayer.set(batch[j], r.value)
        } else {
          failedIds.push(batch[j])
        }
      }
      onProgress?.(Math.min(i + BATCH, playerIds.length), playerIds.length)
    }

    // Retry รอบเดียวสำหรับ player ที่ fail
    if (failedIds.length > 0) {
      console.log(`[PvpScraper] Retrying ${failedIds.length} failed players...`)
      await new Promise((r) => setTimeout(r, 1000))
      for (let i = 0; i < failedIds.length; i += BATCH) {
        const batch = failedIds.slice(i, i + BATCH)
        const results = await Promise.allSettled(batch.map(fetchPlayerGearViaAPI))
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (r.status === 'fulfilled' && r.value) gearByPlayer.set(batch[j], r.value)
        }
      }
    }

    console.log(`[PvpScraper] ${leagueInfo.label}: got gear from ${gearByPlayer.size}/${playerIds.length} players`)

    // ── Step 3: Aggregate stats + gear ──
    // count   = unique players ที่มี ranger นี้ในทีมใดก็ได้
    // totalCount = รวมทุก slot ทุก player (อาจเกินจำนวน players)
    const rangerMap    = new Map<string, { playerIds: Set<string>; totalCount: number; minRank: number }>()
    const rangerGearMaps = new Map<string, Map<string, { slot: string; name: string; iconUrl: string; grade: number | null; count: number }>>()
    const rangerSetMaps  = new Map<string, Map<string, GearSet>>()
    // นับ instance ของ ranger ที่มี gear (1 slot = 1 ตัว — ไม่ใช่ 1 คน)
    const rangerGearCounts = new Map<string, number>()

    for (const team of allTeams) {
      const playerGear = gearByPlayer.get(team.playerId)

      for (const rangerId of team.rangers) {
        // นับ usage stats
        const instances = team.rangerInstances?.[rangerId] ?? 1
        const ex = rangerMap.get(rangerId)
        if (ex) {
          ex.playerIds.add(team.playerId)
          ex.totalCount += instances
          ex.minRank = Math.min(ex.minRank, team.rank)
        } else {
          rangerMap.set(rangerId, { playerIds: new Set([team.playerId]), totalCount: instances, minRank: team.rank })
        }

        // เก็บ gear — นับต่อ instance (ต่อ slot = ต่อตัว) ไม่ใช่ต่อ player
        // allTeams มี 1 entry ต่อ pvpteam slot ต่อ player — ดังนั้นแต่ละ iteration = 1 ตัว
        if (!playerGear) continue
        const rangerGear = playerGear.get(rangerId)
        if (!rangerGear || rangerGear.length === 0) continue

        if (!rangerGearMaps.has(rangerId)) {
          rangerGearMaps.set(rangerId, new Map())
          rangerSetMaps.set(rangerId, new Map())
          rangerGearCounts.set(rangerId, 0)
        }
        rangerGearCounts.set(rangerId, (rangerGearCounts.get(rangerId) ?? 0) + 1)

        const gm = rangerGearMaps.get(rangerId)!
        let wpn: string | undefined, amr: string | undefined, acc: string | undefined

        for (const g of rangerGear) {
          const key = `${g.slot}::${g.itemCode}`
          const exGear = gm.get(key)
          if (exGear) {
            exGear.count++
          } else {
            gm.set(key, { slot: g.slot, name: gearName(g.itemCode), iconUrl: gearIconUrl(g.itemCode), grade: gearGrade(g.itemCode), count: 1 })
          }
          if (g.slot === 'WPN') wpn = g.itemCode
          else if (g.slot === 'AMR') amr = g.itemCode
          else if (g.slot === 'ACC') acc = g.itemCode
        }

        if (wpn && amr && acc) {
          const sm = rangerSetMaps.get(rangerId)!
          const setKey = `${wpn}::${amr}::${acc}`
          const exSet = sm.get(setKey)
          if (exSet) {
            exSet.count++
          } else {
            sm.set(setKey, {
              WPN: gearName(wpn), WPNIcon: gearIconUrl(wpn),
              AMR: gearName(amr), AMRIcon: gearIconUrl(amr),
              ACC: gearName(acc), ACCIcon: gearIconUrl(acc),
              count: 1,
            })
          }
        }
      }
    }

    // ── Step 4: Build RangerStat[] ──
    const sorted = Array.from(rangerMap.entries())
      .map(([id, s]) => ({ id, count: s.playerIds.size, totalCount: s.totalCount, minRank: s.minRank }))
      .sort((a, b) => b.totalCount - a.totalCount || a.minRank - b.minRank)

    const fetchedAt = Date.now()
    // totalPlayers = unique players จาก top100 (ไม่ใช่จำนวน team-slots)
    const uniquePlayerCount = new Set(allTeams.map((t) => t.playerId)).size
    const badges = await loadRangerBadges(sorted.map((r) => r.id))

    const result: RangerStat[] = sorted.map((r) => {
      const b = badges.get(r.id)
      return {
        id: r.id,
        name: unitName(r.id),
        imageUrl: `https://rangers.lerico.net/res/${r.id}/${r.id}-thum.png`,
        count: r.count,
        totalCount: r.totalCount,
        minRank: r.minRank,
        ...(b?.grade != null ? { grade: b.grade } : {}),
        ...(b?.evolution ? { evolution: b.evolution } : {}),
        ...(b?.type ? { type: b.type } : {}),
        ...(b?.element ? { element: b.element } : {}),
      }
    })

    // ── Step 5: Commit ranking cache + DB ──
    leagueCache.set(league, { data: result, teams: allTeams, fetchedAt, totalPlayers: uniquePlayerCount })
    saveLeagueRankingToDB(league, result, allTeams, uniquePlayerCount, fetchedAt)
      .catch((err) => console.error('[PvpScraper] Failed to save ranking:', err))

    // ── Step 6: Commit gear cache + DB ──
    // รวม gear ทุก ranger ของลีคนี้ไว้ใน batch เดียว → Redis 1 write ต่อลีค (แทน N writes)
    const gearBatch: Record<string, { data: GearRanking; topSets: GearSet[]; sampled: number; fetchedAt: number }> = {}

    for (const [rId, gm] of rangerGearMaps) {
      const buildSlot = (slot: string): GearItem[] =>
        Array.from(gm.values())
          .filter((g) => g.slot === slot)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)

      const ranking: GearRanking = {
        WPN: buildSlot('WPN'),
        AMR: buildSlot('AMR'),
        ACC: buildSlot('ACC'),
      }
      const topSets = Array.from((rangerSetMaps.get(rId) ?? new Map()).values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      const sampled = rangerGearCounts.get(rId) ?? 0
      const gearKey = `${rId}:${league}`

      gearMemCache.set(gearKey, { data: ranking, topSets, sampled, fetchedAt })
      gearBatch[rId] = { data: ranking, topSets, sampled, fetchedAt }

      dbWrite(prisma.rangerGear.upsert({
        where: { id: gearKey },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: { gearData: ranking as any, topSets: topSets as any, sampled, fetchedAt: new Date(fetchedAt) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: { id: gearKey, rangerId: rId, league, gearData: ranking as any, topSets: topSets as any, sampled, fetchedAt: new Date(fetchedAt) },
      }), `gear ${gearKey}`)
    }

    // ── เขียน batch key เดียวต่อลีค (แทน N individual keys + index) ──
    if (redis && Object.keys(gearBatch).length > 0) {
      redis.set(redisKey.gearBatch(league), JSON.stringify(gearBatch), { ex: REDIS_TTL.rangerGear })
        .catch((e) => console.error(`[Redis] Failed to save gear batch for league ${league}:`, e))
      // อันดับเกียร์ทั้งลีค + ชื่อเรนเจอร์ + เวลารอบนี้ — คำนวณจากข้อมูลที่เพิ่ง scrape ใน memory
      // เดิม route ไปอ่าน rangerGear ทั้งลีคจาก Neon ตอนแคช 7 วันหมด → ข้อมูลค้างได้ทั้งสัปดาห์ + ปลุก compute
      const rows = Object.entries(gearBatch).map(([rangerId, v]) => ({ rangerId, gearData: v.data, sampled: v.sampled }))
      const rankingPayload = aggregateGearRanking(rows, getEquipGrade)
      const names = Object.fromEntries(result.map(r => [r.id, r.name]))
      Promise.all([
        redis.set(redisKey.gearRanking(league), JSON.stringify(rankingPayload), { ex: REDIS_TTL.rangerGear }),
        redis.set(redisKey.leagueNames(league), JSON.stringify(names), { ex: REDIS_TTL.rangerGear }),
        redis.set(redisKey.leagueStamp(league), String(fetchedAt), { ex: REDIS_TTL.rangerGear }),
      ]).catch((e) => console.error(`[Redis] Failed to save gear summary for league ${league}:`, e))
    }

    console.log(`[PvpScraper] ✓ ${leagueInfo.label}: ${result.length} rangers (${uniquePlayerCount} players), gear for ${rangerGearMaps.size} rangers`)
    return { rangers: result, fetchedAt, fromCache: false, isStale: false, hasPartialNames: false, totalPlayers: uniquePlayerCount }

  } finally {
    refreshingLeagues.delete(league)
  }
}

// =========== refreshRangerGear (public) ===========
// Force re-fetch gear สำหรับ ranger คนเดียว — ดึง getPlayer สำหรับทุก player ที่ใช้ ranger นี้

export async function refreshRangerGear(rangerId: string, league: number): Promise<RangerDetailResult> {
  await cacheReady
  await ensureLeagueLoaded(league)   // Redis miss → ดึงเฉพาะลีคนี้จาก DB (แทนการดึงทั้งตารางตอน boot)

  const leagueData = leagueCache.get(league)
  if (!leagueData) throw new Error('ยังไม่มีข้อมูล League — กรุณารอสักครู่')

  // หา unique players ที่มี ranger นี้ในทีม
  const playerIds = [...new Set(
    leagueData.teams
      .filter((t) => t.rangers.includes(rangerId))
      .map((t) => t.playerId)
  )]

  if (playerIds.length === 0) throw new Error(`ไม่พบ Ranger นี้ใน League`)

  console.log(`[PvpScraper] refreshRangerGear ${rangerId}:${league} — ${playerIds.length} players`)

  // ดึง gear เฉพาะ ranger ตัวนี้จากแต่ละ player (batch 10 + retry)
  const BATCH = 10
  const failedIds: string[] = []
  const gearResults: { slot: string; itemCode: string }[][] = []

  for (let i = 0; i < playerIds.length; i += BATCH) {
    const batch = playerIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((mid) => fetchRangerGearFromPlayer(mid, rangerId))
    )
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled' && r.value) gearResults.push(...r.value)
      else failedIds.push(batch[j])
    }
  }

  if (failedIds.length > 0) {
    console.log(`[PvpScraper] Retrying ${failedIds.length} failed players...`)
    await new Promise((r) => setTimeout(r, 1000))
    for (let i = 0; i < failedIds.length; i += BATCH) {
      const batch = failedIds.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map((mid) => fetchRangerGearFromPlayer(mid, rangerId))
      )
      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value) gearResults.push(...r.value)
      }
    }
  }

  console.log(`[PvpScraper] refreshRangerGear: ${gearResults.length} instances from ${playerIds.length} players`)

  // Aggregate
  const gm = new Map<string, { slot: string; name: string; iconUrl: string; grade: number | null; count: number }>()
  const sm = new Map<string, GearSet>()

  for (const gear of gearResults) {
    let wpn: string | undefined, amr: string | undefined, acc: string | undefined
    for (const g of gear) {
      const key = `${g.slot}::${g.itemCode}`
      const ex = gm.get(key)
      if (ex) { ex.count++ }
      else gm.set(key, { slot: g.slot, name: gearName(g.itemCode), iconUrl: gearIconUrl(g.itemCode), grade: gearGrade(g.itemCode), count: 1 })
      if (g.slot === 'WPN') wpn = g.itemCode
      else if (g.slot === 'AMR') amr = g.itemCode
      else if (g.slot === 'ACC') acc = g.itemCode
    }
    if (wpn && amr && acc) {
      const setKey = `${wpn}::${amr}::${acc}`
      const exSet = sm.get(setKey)
      if (exSet) { exSet.count++ }
      else sm.set(setKey, {
        WPN: gearName(wpn), WPNIcon: gearIconUrl(wpn),
        AMR: gearName(amr), AMRIcon: gearIconUrl(amr),
        ACC: gearName(acc), ACCIcon: gearIconUrl(acc),
        count: 1,
      })
    }
  }

  const buildSlot = (slot: string): GearItem[] =>
    Array.from(gm.values()).filter((g) => g.slot === slot).sort((a, b) => b.count - a.count).slice(0, 10)

  const ranking: GearRanking = { WPN: buildSlot('WPN'), AMR: buildSlot('AMR'), ACC: buildSlot('ACC') }
  const topSets = Array.from(sm.values()).sort((a, b) => b.count - a.count).slice(0, 5)
  const sampled = gearResults.length
  const fetchedAt = Date.now()
  const gearKey = `${rangerId}:${league}`

  gearMemCache.set(gearKey, { data: ranking, topSets, sampled, fetchedAt })
  prisma.rangerGear.upsert({
    where: { id: gearKey },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: { gearData: ranking as any, topSets: topSets as any, sampled, fetchedAt: new Date(fetchedAt) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: { id: gearKey, rangerId, league, gearData: ranking as any, topSets: topSets as any, sampled, fetchedAt: new Date(fetchedAt) },
  }).catch((err: unknown) => console.error(`[PvpScraper] Failed to save gear ${gearKey}:`, err))
  // เขียน individual key ด้วย — getRangerDetail() อ่านคีย์นี้ก่อนตก DB แล้ว
  // ถ้าไม่เขียน คีย์เดิม (หรือ sentinel "ไม่มีข้อมูล") จะค้างทับของใหม่ที่เพิ่ง refresh ไปอีก 7 วัน
  if (redis) {
    redis.set(
      redisKey.gear(rangerId, league),
      JSON.stringify({ data: ranking, topSets, sampled, fetchedAt }),
      { ex: REDIS_TTL.rangerGear },
    ).catch((e) => console.error(`[Redis] Failed to save gear ${gearKey}:`, e))
  }

  // นับ unique players (ไม่ใช่ team-slots)
  const usersInLeague = new Set(
    leagueData.teams.filter((t) => t.rangers.includes(rangerId)).map((t) => t.playerId)
  ).size

  return {
    id: rangerId,
    name: unitName(rangerId),
    imageUrl: `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png`,
    gear: ranking,
    topSets,
    gearFromCache: false,
    gearLoading: false,
    usersInLeague,
    gearSampled: sampled,
  }
}

// =========== getRangerDetail (public) ===========
// Gear ดึงพร้อม ranking แล้ว — คืนจาก cache เสมอ ไม่มี on-demand scrape

export async function getRangerDetail(
  rangerId: string,
  league: number
): Promise<RangerDetailResult> {
  await cacheReady
  await ensureLeagueLoaded(league)   // Redis miss → ดึงเฉพาะลีคนี้จาก DB (แทนการดึงทั้งตารางตอน boot)

  const leagueData = leagueCache.get(league)
  if (!leagueData) throw new Error('ยังไม่มีข้อมูล League — กรุณารอสักครู่')

  const gearKey = `${rangerId}:${league}`
  let memGear = gearMemCache.get(gearKey)

  // ── ไม่มีใน memory → Redis ต่อตัว แล้วค่อยถึง DB ──
  // เดิมตกไป Neon ทันทีทุกครั้งที่ instance เพิ่งเกิด (ซึ่งเป็นเรื่องปกติของ serverless)
  // ทุกครั้งที่แตะ Neon = ปลุก compute ไว้อีก 5 นาที → หน้า popup เมต้าคนเดียวก็ทำให้
  // compute ตื่นค้างได้ทั้งวัน กิน CU-hrs ฟรีหมดโดยที่ข้อมูลเปลี่ยนแค่วันละครั้ง
  // ตอนนี้ DB ถูกแตะแค่ครั้งแรกต่อ ranger+ลีคต่อ 7 วัน ที่เหลืออ่านจาก Redis
  let knownEmpty = false
  if (!memGear && redis) {
    try {
      const raw = await redis.get<string>(redisKey.gear(rangerId, league))
      if (raw) {
        const c = typeof raw === 'string' ? JSON.parse(raw) : raw
        // sentinel "ไม่มีข้อมูลใน DB" — จำผลว่างไว้ด้วย ไม่งั้นเรนเจอร์ที่ไม่มีแถวเกียร์
        // จะยิง findUnique ซ้ำทุก request ตลอดไป (เป็น DB touch ที่ไม่เคยได้อะไรกลับมา)
        if (c && typeof c === 'object' && 'data' in c) {
          memGear = c as { data: GearRanking; topSets: GearSet[]; sampled: number; fetchedAt: number }
          gearMemCache.set(gearKey, memGear)
        } else if (c && typeof c === 'object' && 'none' in c) {
          knownEmpty = true
        }
      }
    } catch { /* Redis ล่ม → ตกไป DB ตามปกติ */ }
  }

  // ลอง DB ถ้าไม่มีทั้งใน memory และ Redis
  if (!memGear && !knownEmpty) {
    try {
      const dbRow = await prisma.rangerGear.findUnique({ where: { id: gearKey } })
      if (dbRow) {
        memGear = {
          data: dbRow.gearData as unknown as GearRanking,
          topSets: dbRow.topSets as unknown as GearSet[],
          sampled: dbRow.sampled,
          fetchedAt: dbRow.fetchedAt.getTime(),
        }
        gearMemCache.set(gearKey, memGear)
      }
      if (redis) {
        redis.set(
          redisKey.gear(rangerId, league),
          JSON.stringify(memGear ?? { none: 1 }),
          { ex: REDIS_TTL.rangerGear },
        ).catch(() => {})
      }
    } catch { /* ok */ }
  }

  const gearFresh = !!(memGear && Date.now() - memGear.fetchedAt < GEAR_CACHE_TTL)
  // นับ unique players (ไม่ใช่ team-slots — teams มีหลาย entry ต่อ player)
  const usersInLeague = new Set(
    leagueData.teams.filter((t) => t.rangers.includes(rangerId)).map((t) => t.playerId)
  ).size
  const emptyGear: GearRanking = { WPN: [], AMR: [], ACC: [] }

  // ถ้ายังไม่มีเลย และ league กำลัง refresh อยู่ → บอกว่ากำลังโหลด
  const stillLoading = !memGear && refreshingLeagues.has(league)

  return {
    id: rangerId,
    name: unitName(rangerId),
    imageUrl: `https://rangers.lerico.net/res/${rangerId}/${rangerId}-thum.png`,
    gear: memGear?.data ?? emptyGear,
    topSets: memGear?.topSets ?? [],
    gearFromCache: !!memGear && gearFresh,
    gearLoading: stillLoading,
    usersInLeague,
    gearSampled: memGear?.sampled ?? 0,
  }
}
