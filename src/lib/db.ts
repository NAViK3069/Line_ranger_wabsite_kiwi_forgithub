// ====================================================
// Database แบบไฟล์ JSON (แทน Prisma + Neon)
//
// เว็บนี้เป็น static site บน GitHub Pages จึงไม่มีฐานข้อมูลตอนรันจริง
// ไฟล์นี้ใช้เฉพาะตอน build ข้อมูล (scripts/*.ts ใน GitHub Actions) เท่านั้น
// หน้าตา API เลียนแบบ Prisma ส่วนที่โค้ดเดิมใช้ (findMany / findUnique / upsert / ...)
// เพื่อให้ไลบรารีเดิม (pvpScraper, syncRangerBook, route handlers) ทำงานได้โดยแทบไม่ต้องแก้
//
//   ข้อมูลที่แอดมินแก้   → content/*.json      (commit อยู่ใน repo — แอดมินบันทึกผ่าน Worker)
//   ข้อมูลที่ scrape ได้  → .data/db/*.json    (เก็บใน branch `data` โดย workflow)
//
// เขียนลงดิสก์ตอนเรียก prisma.$disconnect() (ทุกสคริปต์เรียกตอนจบอยู่แล้ว)
// ====================================================

import fs from 'fs'
import path from 'path'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
/** แถวที่คืนจาก query — มี id เสมอ (ให้ type เข้ากับโค้ดเดิมที่เขียนกับ Prisma) */
type Out = { id: any; [key: string]: any }
type Where = Record<string, any>
type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[]

const ROOT = process.cwd()
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DB_DIR ?? '.data/db')
const CONTENT_DIR = path.resolve(ROOT, process.env.CONTENT_DIR ?? 'content')

const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'fetchedAt', 'syncedAt', 'startDate', 'endDate'])

function revive(row: Row): Row {
  for (const k of Object.keys(row)) {
    if (DATE_FIELDS.has(k) && typeof row[k] === 'string') row[k] = new Date(row[k])
  }
  return row
}

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

function matches(row: Row, where?: Where): boolean {
  if (!where) return true
  for (const [k, cond] of Object.entries(where)) {
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !(cond.in as unknown[]).some(v => same(row[k], v))) return false
      if ('not' in cond && same(row[k], cond.not)) return false
    } else if (!same(row[k], cond)) {
      return false
    }
  }
  return true
}

function pick(row: Row, select?: Record<string, boolean>): Row {
  const copy = structuredClone(row)
  if (!select) return copy
  const out: Row = {}
  for (const [k, on] of Object.entries(select)) if (on) out[k] = copy[k]
  return out
}

function sortRows(rows: Row[], orderBy?: OrderBy): Row[] {
  if (!orderBy) return rows
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap(o => Object.entries(o))
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const av = a[k] instanceof Date ? a[k].getTime() : a[k]
      const bv = b[k] instanceof Date ? b[k].getTime() : b[k]
      if (av === bv) continue
      if (av == null) return 1
      if (bv == null) return -1
      const c = av < bv ? -1 : 1
      return dir === 'desc' ? -c : c
    }
    return 0
  })
}

class Table {
  private rows: Row[] | null = null
  dirty = false
  constructor(readonly file: string, readonly defaults: Row = {}, readonly singleton = false) {}

  private load(): Row[] {
    if (this.rows) return this.rows
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      const list: Row[] = this.singleton ? (raw ? [raw] : []) : (raw ?? [])
      this.rows = list.map(revive)
    } catch {
      this.rows = []
    }
    return this.rows
  }

  save() {
    if (!this.dirty || !this.rows) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const body = this.singleton ? (this.rows[0] ?? null) : this.rows
    fs.writeFileSync(this.file, JSON.stringify(body, null, this.singleton ? 2 : 0) + '\n')
    this.dirty = false
  }

  private fresh(data: Row): Row {
    const now = new Date()
    return revive({ ...this.defaults, createdAt: now, updatedAt: now, ...structuredClone(data) })
  }

  async findMany(args: { where?: Where; select?: Record<string, boolean>; orderBy?: OrderBy; take?: number } = {}) {
    let rows = sortRows(this.load().filter(r => matches(r, args.where)), args.orderBy)
    if (args.take != null) rows = rows.slice(0, args.take)
    return rows.map(r => pick(r, args.select)) as Out[]
  }

  async findUnique(args: { where: Where; select?: Record<string, boolean> }) {
    const r = this.load().find(row => matches(row, args.where))
    return r ? (pick(r, args.select) as Out) : null
  }

  findFirst(args: { where?: Where; select?: Record<string, boolean>; orderBy?: OrderBy } = {}) {
    return this.findMany({ ...args, take: 1 }).then(r => r[0] ?? null)
  }

  async count(args: { where?: Where } = {}) {
    return this.load().filter(r => matches(r, args.where)).length
  }

  async create(args: { data: Row }) {
    const row = this.fresh(args.data)
    this.load().push(row)
    this.dirty = true
    return structuredClone(row)
  }

  async createMany(args: { data: Row[] }) {
    const rows = this.load()
    for (const d of args.data) rows.push(this.fresh(d))
    this.dirty = true
    return { count: args.data.length }
  }

  async update(args: { where: Where; data: Row }) {
    const row = this.load().find(r => matches(r, args.where))
    if (!row) throw new Error(`[db] update: not found ${JSON.stringify(args.where)}`)
    Object.assign(row, revive(structuredClone(args.data)), { updatedAt: new Date() })
    this.dirty = true
    return structuredClone(row)
  }

  async upsert(args: { where: Where; update: Row; create: Row }) {
    const row = this.load().find(r => matches(r, args.where))
    if (row) return this.update({ where: args.where, data: args.update })
    return this.create({ data: args.create })
  }

  async deleteMany(args: { where?: Where } = {}) {
    const rows = this.load()
    const keep = rows.filter(r => !matches(r, args.where))
    const count = rows.length - keep.length
    this.rows = keep
    if (count) this.dirty = true
    return { count }
  }

  async delete(args: { where: Where }) {
    const row = await this.findUnique(args)
    await this.deleteMany(args)
    return row
  }
}

const data = (name: string, defaults?: Row) => new Table(path.join(DATA_DIR, `${name}.json`), defaults)
const content = (name: string, defaults?: Row, singleton = false) =>
  new Table(path.join(CONTENT_DIR, `${name}.json`), defaults, singleton)

const tables = {
  // ── content (แอดมินแก้) ──
  gachaPool: content('gacha-pools', {
    description: null, imageUrl: null, isActive: true, isNew: false, isEvent: false, isTest: false,
    isFrog: false, sortOrder: 0, rangers: [], guaranteedRangers: [], startDate: null, endDate: null,
  }),
  gachaGearPool: content('gacha-gear-pools', {
    imageUrl: null, isActive: true, isNew: false, isEvent: false, isTest: false, sortOrder: 0,
    gears: [], guaranteedGears: [], christmasTierRates: {}, isChristmas: false,
  }),
  siteProfile: content('site-profile', {}, true),
  top40Legend: content('top40-legend', { entries: [] }, true),
  // ── data (scrape อัตโนมัติ) ──
  rangerBook: data('ranger-book', { sortOrder: 0 }),
  gearBook: data('gear-book'),
  leagueRanking: data('league-rankings'),
  rangerGear: data('ranger-gear'),
  rangerName: data('ranger-names'),
}

function flush() {
  for (const t of Object.values(tables)) t.save()
}

export const prisma = {
  ...tables,
  async $transaction(ops: Promise<unknown>[]) {
    return Promise.all(ops)
  },
  async $disconnect() {
    flush()
  },
}

export const flushDb = flush
