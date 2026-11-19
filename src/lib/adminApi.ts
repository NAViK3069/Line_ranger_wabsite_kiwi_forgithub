// ====================================================
// Admin API (ฝั่ง browser) — แทน /api/admin/* เดิมที่เคยรันบนเซิร์ฟเวอร์ Next.js
//
// เว็บเป็น static site จึงไม่มีฐานข้อมูล ข้อมูลที่แอดมินแก้อยู่ใน content/*.json ใน repo
//   อ่าน  → Worker /api/admin/file   (อ่านไฟล์ล่าสุดจาก GitHub — ไม่ใช่ของที่ deploy ไว้ ซึ่งอาจยังเก่า)
//   เขียน → Worker /api/admin/commit (commit ขึ้น GitHub → Actions build เว็บใหม่ภายใน ~2–5 นาที)
//
// adminFetch('/api/admin/...') คืน Response หน้าตาเดียวกับ route เดิม หน้าแอดมินจึงแทบไม่ต้องแก้
// ====================================================

import { WORKER_URL, apiFetch, lericoProxy } from './staticApi'

const TOKEN_KEY = 'lr:admin_token'

interface Session { token: string; exp: number; username: string }

export function getSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Session | null
    return s && s.exp * 1000 > Date.now() ? s : null
  } catch {
    return null
  }
}

export function logout() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!WORKER_URL) return { ok: false, error: 'ยังไม่ได้ตั้งค่า NEXT_PUBLIC_WORKER_URL' }
  try {
    const res = await fetch(`${WORKER_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json() as Partial<Session> & { error?: string }
    if (!res.ok || !data.token) return { ok: false, error: data.error ?? `เข้าสู่ระบบไม่สำเร็จ (${res.status})` }
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: data.token, exp: data.exp, username: data.username }))
    return { ok: true }
  } catch {
    return { ok: false, error: 'เชื่อมต่อ Worker ไม่ได้' }
  }
}

async function worker(path: string, init: RequestInit = {}): Promise<Response> {
  const s = getSession()
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
    },
  })
  if (res.status === 401) {
    logout()
    if (typeof window !== 'undefined' && !location.pathname.startsWith('/admin/login')) location.href = '/admin/login'
  }
  return res
}

/** เช็ค token กับ Worker จริง (ใช้ตอนเปิดหน้าแอดมิน) */
export async function verifySession(): Promise<boolean> {
  if (!getSession()) return false
  try { return (await worker('/api/admin/me')).ok } catch { return false }
}

export interface WorkflowRun { name: string; status: string; conclusion: string | null; event: string; createdAt: string; updatedAt: string; url: string }
export async function getRuns(): Promise<WorkflowRun[]> {
  const res = await worker('/api/admin/runs')
  if (!res.ok) return []
  return ((await res.json()) as { runs: WorkflowRun[] }).runs
}

export async function dispatchWorkflow(workflow: 'data.yml' | 'deploy.yml'): Promise<{ ok: boolean; error?: string }> {
  const res = await worker('/api/admin/dispatch', { method: 'POST', body: JSON.stringify({ workflow }) })
  return res.ok ? { ok: true } : { ok: false, error: ((await res.json()) as { error?: string }).error }
}

// ── content store ────────────────────────────────────

type Row = Record<string, unknown> & { id: string }

async function readContent<T>(name: string): Promise<T> {
  const res = await worker(`/api/admin/file?path=${encodeURIComponent(`content/${name}.json`)}`)
  if (!res.ok) throw new Error(`อ่าน content/${name}.json ไม่ได้ (${res.status})`)
  return res.json() as Promise<T>
}

interface PendingFile { path: string; content: string; encoding?: 'utf-8' | 'base64' }

async function commit(message: string, files: PendingFile[]): Promise<void> {
  const res = await worker('/api/admin/commit', { method: 'POST', body: JSON.stringify({ message, files }) })
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `บันทึกไม่สำเร็จ (${res.status})`)
  try { window.dispatchEvent(new CustomEvent('lr:admin-committed')) } catch { /* SSR */ }
}

const contentFile = (name: string, data: unknown): PendingFile =>
  ({ path: `content/${name}.json`, content: JSON.stringify(data, null, 2) + '\n' })

/** รูป base64 → ไฟล์ใน public/content-images/<dir>/<id>.<ext> (แทนการอัปขึ้น Cloudinary) */
function imageFile(dataUri: string | null | undefined, dir: string, id: string): { url: string; file: PendingFile } | null {
  const m = typeof dataUri === 'string' ? dataUri.match(/^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/) : null
  if (!m) return null
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  // ใส่เวลาในชื่อไฟล์ — รูปเก่าถูก cache ไว้ 1 ปี ถ้าชื่อซ้ำเบราว์เซอร์จะโชว์รูปเดิม
  const name = `${id}-${Date.now().toString(36)}.${ext}`
  return { url: `/content-images/${dir}/${name}`, file: { path: `public/content-images/${dir}/${name}`, content: m[2], encoding: 'base64' } }
}

function cuid(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(8))
  return 'c' + Date.now().toString(36) + Array.from(rnd, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

const now = () => new Date().toISOString()
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ── gacha pools (ranger + gear ใช้ตรรกะเดียวกัน) ────────────

interface PoolKind {
  file: 'gacha-pools' | 'gacha-gear-pools'
  imgDir: string
  label: string
  items: string
  guaranteed: string
  extraFlags: string[]
  extraFields: string[]
  countKey: string
}
const RANGER: PoolKind = {
  file: 'gacha-pools', imgDir: 'pools', label: 'ตู้กาชา', items: 'rangers', guaranteed: 'guaranteedRangers',
  extraFlags: ['isFrog'], extraFields: [], countKey: 'rangersCount',
}
const GEAR: PoolKind = {
  file: 'gacha-gear-pools', imgDir: 'gear-pools', label: 'ตู้กาชาเกียร์', items: 'gears', guaranteed: 'guaranteedGears',
  extraFlags: ['isChristmas'], extraFields: ['christmasTierRates'], countKey: 'gearsCount',
}

const sortPools = (rows: Row[]) =>
  [...rows].sort((a, b) => (Number(a.sortOrder) - Number(b.sortOrder)) || String(b.createdAt).localeCompare(String(a.createdAt)))

function poolFields(k: PoolKind, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    name: String(body.name ?? '').trim(),
    [k.items]: body[k.items] ?? [],
    [k.guaranteed]: body[k.guaranteed] ?? [],
    isActive: body.isActive ?? true,
    isNew: body.isNew ?? false,
    isEvent: body.isEvent ?? false,
    isTest: body.isTest ?? false,
  }
  for (const f of k.extraFlags) out[f] = body[f] ?? false
  for (const f of k.extraFields) out[f] = body[f] ?? {}
  return out
}

async function poolsApi(k: PoolKind, rest: string[], method: string, body: Record<string, unknown>): Promise<Response> {
  const rows = await readContent<Row[]>(k.file)

  if (rest[0] === 'reorder' && method === 'POST') {
    const ids = body.ids as string[]
    if (!Array.isArray(ids)) return json({ error: 'ids must be array' }, 400)
    ids.forEach((id, i) => { const r = rows.find(x => x.id === id); if (r) r.sortOrder = i })
    await commit(`admin: reorder ${k.file}`, [contentFile(k.file, sortPools(rows))])
    return json({ ok: true })
  }

  const id = rest[0]
  if (!id) {
    if (method === 'GET') {
      return json({
        pools: sortPools(rows).map(p => ({
          id: p.id, name: p.name, isActive: p.isActive, isNew: p.isNew, isEvent: p.isEvent, isTest: p.isTest,
          ...Object.fromEntries(k.extraFlags.map(f => [f, p[f]])),
          [k.countKey]: Array.isArray(p[k.items]) ? (p[k.items] as unknown[]).length : 0,
          imageUrl: p.imageUrl ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt,
        })),
      })
    }
    if (method === 'POST') {
      if (!String(body.name ?? '').trim()) return json({ error: `กรุณาใส่ชื่อ${k.label}` }, 400)
      const newId = cuid()
      const img = imageFile(body.imageUrl as string, k.imgDir, newId)
      for (const r of rows) r.sortOrder = Number(r.sortOrder ?? 0) + 1
      const row: Row = {
        id: newId, ...poolFields(k, body), imageUrl: img?.url ?? (body.imageUrl as string) ?? null,
        sortOrder: 0, createdAt: now(), updatedAt: now(),
        ...(k === RANGER ? { description: null, startDate: null, endDate: null } : {}),
      }
      rows.unshift(row)
      await commit(`admin: add ${k.label} "${row.name}"`, [contentFile(k.file, sortPools(rows)), ...(img ? [img.file] : [])])
      return json({ pool: { id: row.id, name: row.name, isActive: row.isActive } }, 201)
    }
    return json({ error: 'Method not allowed' }, 405)
  }

  const row = rows.find(r => r.id === id)
  if (!row) return json({ error: `ไม่พบ${k.label}` }, 404)

  if (method === 'GET') return json(row)

  if (method === 'PUT') {
    if (!String(body.name ?? '').trim()) return json({ error: `กรุณาใส่ชื่อ${k.label}` }, 400)
    const img = imageFile(body.imageUrl as string, k.imgDir, id)
    Object.assign(row, poolFields(k, body), { imageUrl: img?.url ?? (body.imageUrl as string) ?? null, updatedAt: now() })
    await commit(`admin: update ${k.label} "${row.name}"`, [contentFile(k.file, rows), ...(img ? [img.file] : [])])
    return json({ pool: { id: row.id, name: row.name, isActive: row.isActive } })
  }

  if (method === 'PATCH') {
    const changed: Record<string, boolean> = {}
    for (const key of ['isActive', 'isNew', 'isEvent', 'isTest']) if (typeof body[key] === 'boolean') changed[key] = body[key] as boolean
    if (!Object.keys(changed).length) return json({ error: 'ไม่มีฟิลด์ที่อัปเดตได้' }, 400)
    Object.assign(row, changed, { updatedAt: now() })
    await commit(`admin: toggle ${Object.keys(changed).join(',')} on "${row.name}"`, [contentFile(k.file, rows)])
    return json({ pool: { id: row.id, isActive: row.isActive, isNew: row.isNew, isEvent: row.isEvent, isTest: row.isTest } })
  }

  if (method === 'DELETE') {
    await commit(`admin: delete ${k.label} "${row.name}"`, [contentFile(k.file, rows.filter(r => r.id !== id))])
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ── site profile / top40 ──────────────────────────────

async function siteProfileApi(method: string, body: Record<string, unknown>): Promise<Response> {
  const cur = (await readContent<Record<string, unknown> | null>('site-profile')) ?? { id: 'main' }
  if (method === 'GET') return json(cur)
  if (method === 'PUT') {
    const img = imageFile(body.profileImage as string, '', 'profile')
    const next = {
      ...cur, id: 'main',
      displayName: body.displayName ?? '', email: body.email ?? '', facebookName: body.facebookName ?? '',
      facebookUrl: body.facebookUrl ?? '', description: body.description ?? '', announcement: body.announcement ?? '',
      profileImage: img ? img.url.replace('/content-images//', '/content-images/') : (body.profileImage ?? null),
      links: body.links ?? [], updatedAt: now(),
    }
    const files = [contentFile('site-profile', next)]
    if (img) files.push({ ...img.file, path: img.file.path.replace('content-images//', 'content-images/') })
    await commit('admin: update About page', files)
    return json(next)
  }
  return json({ error: 'Method not allowed' }, 405)
}

async function top40Api(method: string, body: Record<string, unknown>): Promise<Response> {
  const cur = (await readContent<Record<string, unknown> | null>('top40-legend')) ?? { id: 'main', entries: [] }
  if (method === 'GET') return json(cur)
  if (method === 'PUT') {
    const next = { ...cur, id: 'main', entries: body.entries ?? [], updatedAt: now() }
    await commit('admin: update Top 40 Legend', [contentFile('top40-legend', next)])
    return json(next)
  }
  return json({ error: 'Method not allowed' }, 405)
}

// ── Tier List ค่าเริ่มต้น (หน้า /custom-tierlist) ──────────
// เก็บแค่แถว (ชื่อ/สี/เรนเจอร์ในแถว) + ชื่อตาราง — คลังด้านล่างของผู้ใช้มาจาก Meta PVP เสมอ

async function tierlistApi(method: string, body: Record<string, unknown>): Promise<Response> {
  const empty = { id: 'main', title: 'Line Rangers Tier List', tiers: [], updatedAt: null }
  const cur = await readContent<Record<string, unknown>>('tierlist').catch(() => empty)
  if (method === 'GET') return json(cur)
  if (method === 'PUT') {
    const tiers = (Array.isArray(body.tiers) ? body.tiers : []).map(t => {
      const r = (t ?? {}) as Record<string, unknown>
      return {
        label: String(r.label ?? '').slice(0, 40),
        bg: String(r.bg ?? '#ff7f7f'),
        fg: String(r.fg ?? '#1a1a1a'),
        items: (Array.isArray(r.items) ? r.items : []).filter((x): x is string => typeof x === 'string' && /^[\w-]{1,80}$/.test(x)),
      }
    })
    const next = { id: 'main', title: String(body.title ?? '').slice(0, 60) || empty.title, tiers, updatedAt: now() }
    await commit('admin: update default Tier List', [contentFile('tierlist', next)])
    return json(next)
  }
  return json({ error: 'Method not allowed' }, 405)
}

// ── Top 40 Legend จาก lerico สดๆ (ย้ายมาจาก /api/admin/top40-legend/fresh) ──

async function top40Fresh(): Promise<Response> {
  const [rankRes, namesRes] = await Promise.all([
    fetch(lericoProxy('https://rangers.lerico.net/api/v2/pvp/league/rank/LEGEND'), { cache: 'no-store' }),
    fetch(lericoProxy('https://rangers.lerico.net/api/v2/translate?keys=en:UNIT')),
  ])
  if (!rankRes.ok) return json({ error: `lerico league rank failed: ${rankRes.status}` }, 502)
  type Resp = {
    top100?: { rank: number; mid: string }[]
    playerInfo?: { mid: string; playerUnitTeamGroupMap?: { pvpteam?: Record<string, { unitCode: string }[]> } }[]
  }
  const rank = await rankRes.json() as Resp
  if (!rank.top100?.length || !rank.playerInfo?.length) return json({ error: 'lerico returned empty data' }, 502)

  const names = new Map<string, string>()
  if (namesRes.ok) {
    const raw = await namesRes.json() as Record<string, unknown>
    for (const [k, v] of Object.entries((raw['en:UNIT'] ?? raw) as Record<string, string>)) if (typeof v === 'string') names.set(k, v.trim())
  }
  const info = new Map(rank.playerInfo.map(p => [p.mid, p]))
  const agg = new Map<string, { players: Set<string>; total: number; minRank: number }>()
  for (const e of rank.top100) {
    for (const units of Object.values(info.get(e.mid)?.playerUnitTeamGroupMap?.pvpteam ?? {})) {
      for (const u of units) {
        if (!u.unitCode) continue
        const c = agg.get(u.unitCode) ?? { players: new Set<string>(), total: 0, minRank: e.rank }
        c.players.add(e.mid); c.total++; c.minRank = Math.min(c.minRank, e.rank)
        agg.set(u.unitCode, c)
      }
    }
  }
  const rangers = [...agg.entries()].map(([id, v]) => ({
    id, name: names.get(`${id}_nm`) ?? names.get(id) ?? id,
    imageUrl: `https://rangers.lerico.net/res/${id}/${id}-thum.png`,
    count: v.players.size, totalCount: v.total, minRank: v.minRank,
  })).sort((a, b) => b.totalCount - a.totalCount || b.count - a.count || a.minRank - b.minRank).slice(0, 40)
  return json({ rangers, fetchedAt: Date.now(), totalPlayers: rank.top100.length, source: 'lerico-fresh' })
}

// ── router ───────────────────────────────────────────

export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, 'http://static.local')
  const method = (init.method ?? 'GET').toUpperCase()
  let body: Record<string, unknown> = {}
  if (typeof init.body === 'string' && init.body) { try { body = JSON.parse(init.body) } catch { /* ignore */ } }
  const p = url.pathname.replace(/^\/api\/admin\//, '').split('/').filter(Boolean).map(decodeURIComponent)

  try {
    if (p[0] === 'gacha' && p[1] === 'pools') return await poolsApi(RANGER, p.slice(2), method, body)
    if (p[0] === 'gacha' && p[1] === 'gear-pools') return await poolsApi(GEAR, p.slice(2), method, body)
    if (p[0] === 'site-profile') return await siteProfileApi(method, body)
    if (p[0] === 'top40') return await top40Api(method, body)
    if (p[0] === 'tierlist') return await tierlistApi(method, body)
    if (p[0] === 'top40-legend' && p[1] === 'fresh') return await top40Fresh()
    if (p[0] === 'gear-book') return await apiFetch('/api/gear-book')
    if (p[0] === 'ranger-book' && p[1] === 'sync' && method === 'POST') {
      const r = await dispatchWorkflow('data.yml')
      return r.ok
        ? json({ ok: true, message: 'สั่ง sync แล้ว — GitHub Actions จะดึงข้อมูลใหม่และ build เว็บ (ราว 10–20 นาที)', cached: 'n/a' })
        : json({ error: r.error ?? 'สั่ง sync ไม่สำเร็จ' }, 502)
    }
    if (p[0] === 'ranger-book') return await apiFetch('/api/ranger-book')
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }, 500)
  }
  return json({ error: `ไม่รองรับ ${method} ${url.pathname}` }, 404)
}
