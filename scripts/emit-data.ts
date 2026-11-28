/**
 * emit-data.ts — เขียนข้อมูลทั้งหมดของเว็บเป็นไฟล์ JSON static ใน public/data/
 *
 * หลักการ: เรียก route handler เดิม (src/server/api/**) ด้วย request ปลอม แล้วเซฟ response ลงไฟล์
 * ตามกฎใน src/lib/staticApi.ts → dataFile() ฝั่ง browser จะอ่านไฟล์เดียวกันนี้ผ่าน apiFetch()
 *
 * Run locally :
 *   npx tsx scripts/emit-data.ts                 ← ทั้งหมด (ต้องมี .data/db จาก sync/refresh ก่อน)
 *   npx tsx scripts/emit-data.ts --content-only  ← เฉพาะข้อมูลที่แอดมินแก้ (gacha, top40, about) — เร็ว ไม่ต่อเน็ต
 *
 * ที่มาของข้อมูล:
 *   • ข้อมูลเกม (เรนเจอร์ / สกิล / เกียร์ / ข้อความ) → .gamedata (ข้อมูลที่ถอดเอง — src/lib/gameData.ts)
 *   • Ranger/Gear Book + อันดับ PvP → .data/db/*.json (scripts/sync-rangers.ts + scripts/refresh-pvp.ts)
 *   • ดึงสดจากเว็บอื่นระหว่าง emit: อัตราใช้ตื่นพลัง/ทาเลนต์ PvP (warmycat) + รายชื่อโฟลเดอร์ /res (lerico)
 */

process.env.EMIT_NO_SCRAPE = '1'

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { NextRequest } from 'next/server'
import { dataFile, emptyFallback, gearEffectsFile, gearUsersFile, itemCodeFromIconUrl, resRootFile, resRootUnitsFile } from '../src/lib/staticApi'
import { towerFloorCodes } from '../src/lib/infinityTower'
import { mainStageCodes } from '../src/lib/mainStage'
import { isHiddenRanger } from '../src/lib/hiddenRangers'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'public', 'data')
const CONTENT_ONLY = process.argv.includes('--content-only')
// --only=leagues,gear (คั่นด้วย ,) → เขียนเฉพาะส่วนนั้น: global | leagues | gear | rangers | evolve | res
const ONLY = new Set((process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean))
const want = (section: string) => ONLY.size === 0 || ONLY.has(section)
const CONCURRENCY = 16

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (req: any, ctx?: any) => Promise<Response> | Response

let written = 0
let skipped = 0
let failed = 0

function writeFile(rel: string, body: unknown) {
  const f = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body))
  written++
}

const route = async (rel: string): Promise<Handler> =>
  (await import(pathToFileURL(path.join(ROOT, 'src', 'server', 'api', rel, 'route.ts')).href)).GET

/** เรียก handler ด้วย URL แบบเดียวกับที่ browser เคยเรียก แล้วเขียนไฟล์ตาม dataFile() */
async function emit(handler: Handler, apiUrl: string, params?: Record<string, string>, opts: { allowEmpty?: boolean } = {}) {
  const url = new URL(apiUrl, 'http://localhost')
  const file = dataFile(url.pathname, url.searchParams)
  if (!file) throw new Error(`no dataFile mapping for ${apiUrl}`)
  try {
    const res = await handler(new NextRequest(url), { params: Promise.resolve(params ?? {}) })
    if (res.status !== 200) {
      if (res.status !== 404) { failed++; console.warn(`  ✗ ${res.status} ${apiUrl}`) } else skipped++
      return
    }
    const text = await res.text()
    // ไม่เขียนไฟล์ที่เป็นแค่ "ค่าว่าง" — browser ใช้ emptyFallback() แทนเมื่อเจอ 404 (ลดจำนวนไฟล์ได้หลายพัน)
    const fb = emptyFallback(url.pathname, url.searchParams)
    if (!opts.allowEmpty && fb !== undefined && isEmptyLike(JSON.parse(text), fb)) { skipped++; return }
    writeFile(file, text)
  } catch (err) {
    failed++
    console.warn(`  ✗ ${apiUrl}:`, err instanceof Error ? err.message : err)
  }
}

function isEmptyLike(v: any, fb: any): boolean {
  if (!v || typeof v !== 'object') return true
  // ค่าว่าง = {} (ไม่มีคีย์ให้เทียบ) → ว่างก็ต่อเมื่อผลลัพธ์ไม่มีคีย์เลย
  if (Object.keys(fb).length === 0) return Object.keys(v).length === 0
  for (const [k, def] of Object.entries(fb)) {
    const x = v[k]
    if (Array.isArray(def) ? (Array.isArray(x) && x.length > 0) : (x !== undefined && x !== def)) return false
  }
  return true
}

async function pool<T>(items: T[], fn: (item: T) => Promise<void>, label: string) {
  let i = 0
  let done = 0
  const t0 = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
      if (++done % 500 === 0) console.log(`  … ${label} ${done}/${items.length}`)
    }
  }))
  console.log(`  ✓ ${label}: ${items.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

const readDb = (name: string): any[] => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.data', 'db', `${name}.json`), 'utf8')) ?? [] } catch { return [] }
}

// ── ส่วนที่แอดมินแก้ (gacha / top40 / about) ─────────────────────
async function emitContent() {
  console.log('[emit] content')
  const content = (n: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', `${n}.json`), 'utf8'))

  for (const kind of ['pools', 'gear-pools'] as const) {
    const list = await route(`gacha/${kind}`)
    await emit(list, `/api/gacha/${kind}`)
    await emit(list, `/api/gacha/${kind}?test=true`)
    const one = await route(`gacha/${kind}/[id]`)
    const rows = content(kind === 'pools' ? 'gacha-pools' : 'gacha-gear-pools') as { id: string; isActive: boolean }[]
    for (const r of rows.filter(r => r.isActive)) await emit(one, `/api/gacha/${kind}/${r.id}`, { id: r.id })
  }
  await emit(await route('top40'), '/api/top40')
  await emit(await route('custom-assets'), '/api/custom-assets')

  const profile = content('site-profile')
  writeFile(dataFile('/api/site-profile', new URLSearchParams())!, profile)
  // เทียร์ลิสต์ที่แอดมินจัด = ค่าเริ่มต้นของหน้า /custom-tierlist
  writeFile(dataFile('/api/tierlist', new URLSearchParams())!, content('tierlist'))
}

// ── ข้อมูลเกม (scrape อัตโนมัติ) ─────────────────────────────────
async function emitGameData() {
  const { LEAGUES, getGearEffectsAsync, awaitCacheReady } = await import('../src/lib/pvpScraper')
  const { gearDetailRangers } = await import('../src/lib/gearAggregate')
  await awaitCacheReady()

  const rangerIds: string[] = readDb('ranger-book').map((r: any) => r.id)
  const gearRows: any[] = readDb('gear-book')
  console.log(`[emit] game data — ${rangerIds.length} rangers, ${gearRows.length} gears, ${LEAGUES.length} leagues`)

  // ── ไฟล์รวม (ไม่มีพารามิเตอร์) ──
  if (want('global')) {
  console.log('[emit] global files')
  await emit(await route('ranger-book'), '/api/ranger-book')
  await emit(await route('gear-book'), '/api/gear-book')
  await emit(await route('ranger-abilities'), '/api/ranger-abilities')
  await emit(await route('ranger-faces'), '/api/ranger-faces')
  // Infinity Tower: ทุกชั้น + ศัตรูรายชั้น (ข้อมูลเกม endless_*)
  await emit(await route('infinity-tower'), '/api/infinity-tower')
  const towerFloor = await route('infinity-tower/[floor]')
  for (const floor of towerFloorCodes()) await emit(towerFloor, `/api/infinity-tower/${floor}`, { floor })
  // Main Stage: พื้นที่/ด่านทั้งหมด + ศัตรูรายด่าน (ข้อมูลเกม area / stage / stage_ai / stage_productline)
  await emit(await route('main-stage'), '/api/main-stage')
  const mainStage = await route('main-stage/[stage]')
  // ตาราง stage_* ยังไม่อยู่ใน branch gamedata (ก่อนส่งข้อมูลรอบแรก) → ข้ามไป ไม่ให้ทั้ง emit ล้ม
  let stageCodes: string[] = []
  try { stageCodes = mainStageCodes() } catch (e) { console.warn('  ! main-stage: ไม่มีตารางด่าน —', e instanceof Error ? e.message : e) }
  for (const stage of stageCodes) await emit(mainStage, `/api/main-stage/${stage}`, { stage })
  await emit(await route('lerico/ranger-names'), '/api/lerico/ranger-names')
  await emit(await route('lerico/equip-names'), '/api/lerico/equip-names')
  const tr = await route('translations/[lang]')
  for (const lang of ['en', 'th']) {
    await emit(tr, `/api/translations/${lang}`, { lang })
    await emit(tr, `/api/translations/${lang}?only=names`, { lang })
  }
  const sfx = await route('ranger-skill-effects')
  for (const lang of ['en', 'th']) await emit(sfx, `/api/ranger-skill-effects?lang=${lang}`)

  }

  // ── ต่อลีค ──
  if (want('leagues')) {
  console.log('[emit] leagues')
  const rangersRoute = await route('meta/rangers')
  const gearRanking = await route('meta/gear-ranking')
  const rangerDetail = await route('meta/ranger-detail')
  const rangerGear = readDb('ranger-gear')
  const leagueRows = readDb('league-rankings')
  for (const lg of LEAGUES) {
    await emit(rangersRoute, `/api/meta/rangers?league=${lg.value}`)
    await emit(gearRanking, `/api/meta/gear-ranking?league=${lg.value}`)
    const lgRow = leagueRows.find((r: any) => r.id === lg.value)
    const ranked: string[] = (lgRow?.data ?? []).map((r: any) => r.id)
    await pool(ranked, id => emit(rangerDetail, `/api/meta/ranger-detail?id=${encodeURIComponent(id)}&league=${lg.value}`, undefined, { allowEmpty: true }), `ranger-detail L${lg.value}`)

    // เรนเจอร์ที่ใช้เกียร์แต่ละชิ้น (gear-detail แบบไม่ใช่ effectsOnly)
    const rows = rangerGear.filter((r: any) => r.league === lg.value)
      .map((r: any) => ({ rangerId: r.rangerId, gearData: r.gearData, sampled: r.sampled }))
    const names = new Map<string, string>((lgRow?.data ?? []).map((r: any) => [r.id, r.name]))
    const used = new Set<string>()
    for (const r of rows) for (const slot of ['WPN', 'AMR', 'ACC']) for (const g of r.gearData?.[slot] ?? []) used.add(g.iconUrl)
    for (const iconUrl of used) {
      const code = itemCodeFromIconUrl(iconUrl)
      if (!code) continue
      const list = gearDetailRangers(rows, iconUrl, id => names.get(id) ?? id)
      if (list.length) writeFile(gearUsersFile(lg.value, code), list)
    }
  }

  }

  // ── ต่อเกียร์: effects ทุกระดับ 0–5 ──
  if (want('gear')) {
  console.log('[emit] gear effects')
  const codes = [...new Set(gearRows.map((g: any) => itemCodeFromIconUrl(g.iconUrl)).filter(Boolean) as string[])]
  await pool(codes, async (code) => {
    const byLevel: Record<string, unknown> = {}
    for (let lv = 0; lv <= 5; lv++) byLevel[lv] = await getGearEffectsAsync(code, lv)
    if (byLevel['5']) writeFile(gearEffectsFile(code), byLevel)
  }, 'gear effects')
  const spec = await route('gear/spec-plus/[id]')
  await pool(codes, code => emit(spec, `/api/gear/spec-plus/${code}`, { id: code }), 'spec-plus')

  }

  // ── ต่อเรนเจอร์ ──
  if (want('rangers')) {
  console.log('[emit] per-ranger files')
  const stats = await route('meta/ranger-stats')
  const talents = await route('ranger/talents/[id]')
  const awakening = await route('ranger/awakening/[id]')
  const projectile = await route('ranger/projectile/[id]')
  const usage = await route('ranger/usage-ranking/[id]')
  await pool(rangerIds, async (id) => {
    const e = encodeURIComponent(id)
    await emit(stats, `/api/meta/ranger-stats?id=${e}`)
    await emit(stats, `/api/meta/ranger-stats?id=${e}&level=1`)
    await emit(talents, `/api/ranger/talents/${e}`, { id })
    await emit(awakening, `/api/ranger/awakening/${e}`, { id })
    await emit(projectile, `/api/ranger/projectile/${e}`, { id })
    for (const lg of LEAGUES) await emit(usage, `/api/ranger/usage-ranking/${e}?league=${lg.value}`, { id })
  }, 'rangers')
  }

  if (want('evolve')) await emitEvolve(rangerIds)
  if (want('res')) await emitResRoot()
}

// ── สายวิวัฒนาการ: จากข้อมูลเกม (ลิงก์ร่างถัดไปในตาราง unit — src/lib/gameData.ts) ──
//    เดิมถาม getRanger ของ lerico ทีละตัวแล้วแคชไว้ — ตรวจแล้วได้สายเดียวกันทุกตัว
async function emitEvolve(rangerIds: string[]) {
  console.log('[emit] evolve chains')
  const { getRawRanger, getTierInfo } = await import('../src/lib/rangerData')
  const { gameEvolveChain, gameText } = await import('../src/lib/gameData')
  const { cleanUnitName } = await import('../src/lib/unitName')
  const nameData = gameText('en', 'UNIT')
  const nameOf = (id: string) => cleanUnitName(nameData[`${id}_nm`] ?? id)

  const done = new Set<string>()
  for (const id of rangerIds) {
    const ids = gameEvolveChain(id)
    if (ids.length < 2 || done.has(id)) continue
    const chain = await Promise.all(ids.map(async cid => {
      const raw = await getRawRanger(cid)
      const tier = raw ? getTierInfo(raw) : null
      return { id: cid, name: nameOf(cid), grade: typeof raw?.grade === 'number' ? raw.grade : null, tierIconKey: tier?.tierIconKey ?? '', tierLabel: tier?.tierLabel ?? '' }
    }))
    for (const cid of new Set([id, ...ids])) {
      writeFile(dataFile(`/api/ranger/evolve/${encodeURIComponent(cid)}`, new URLSearchParams())!, { chain })
      done.add(cid)
    }
  }
  console.log(`  ✓ evolve: ${done.size} rangers in chains`)
}

// ── หน้า /res: รายการโฟลเดอร์ชั้นบนสุด (ตัดโฟลเดอร์ว่างออก — ต้องเปิดดูทีละโฟลเดอร์ ~950 ครั้ง) ──
async function emitResRoot() {
  console.log('[emit] /res root listing')
  const { parseResIndex, isUnitDir } = await import('../src/lib/resIndex')
  const ORIGIN = 'https://rangers.lerico.net/res/'
  const get = async (p: string, showUnits = false) => {
    const r = await fetch(ORIGIN + p, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) throw new Error(String(r.status))
    return parseResIndex(await r.text(), showUnits)
  }
  try {
    const entries = await get('')
    const dirs = entries.filter(e => e.kind === 'dir')
    const keep = new Set<string>()
    await pool(dirs, async (d) => {
      try { if ((await get(`${d.name}/`)).length > 0) keep.add(d.name) } catch { keep.add(d.name) }
    }, 'res dirs')
    writeFile(resRootFile, { path: '', entries: entries.filter(e => (e.kind !== 'dir' || keep.has(e.name)) && !isHiddenRanger(e.name)) })

    // โหมดขั้นสูงของหน้า /res: โฟลเดอร์เรนเจอร์ (u…/g…) ที่มีไฟล์ให้ดูจริง — ตัดโฟลเดอร์ว่าง / มีแต่ .db ทิ้งเหมือนกัน
    const units = (await get('', true)).filter(e => e.kind === 'dir' && isUnitDir(e.name))
    const keepUnits = new Set<string>()
    await pool(units, async (d) => {
      try { if ((await get(`${d.name}/`)).length > 0) keepUnits.add(d.name) } catch { keepUnits.add(d.name) }
    }, 'res unit dirs')
    // เรนเจอร์ที่เจ้าของเว็บซ่อนไว้ (src/lib/hiddenRangers.ts) ไม่ใส่ในรายการ
    writeFile(resRootUnitsFile, { path: '', entries: units.filter(e => keepUnits.has(e.name) && !isHiddenRanger(e.name)) })
  } catch (err) {
    failed++
    console.warn('  ✗ res root:', err)
  }
}

async function main() {
  const t0 = Date.now()
  fs.mkdirSync(OUT, { recursive: true })
  if (ONLY.size === 0 || ONLY.has('content')) await emitContent()
  if (!CONTENT_ONLY && !(ONLY.size === 1 && ONLY.has('content'))) await emitGameData()
  console.log(`\n[emit] เสร็จ ${((Date.now() - t0) / 1000).toFixed(0)}s — เขียน ${written} ไฟล์, ข้าม ${skipped}, ล้มเหลว ${failed}`)
  const { flushDb } = await import('../src/lib/db')
  flushDb()
  process.exit(0)
}

main().catch((err) => {
  console.error('[emit] Fatal:', err)
  process.exit(1)
})
