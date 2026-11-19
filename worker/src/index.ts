// ====================================================
// Line Ranger Kiwi — Cloudflare Worker
//
// หน้าที่ (ทุกอย่างที่ static site บน GitHub Pages ทำเองไม่ได้):
//   1. GET  /lerico/<path>        proxy ไป rangers.lerico.net (ต้นทางไม่มี CORS) + cache ที่ edge
//   2. POST /api/admin/login          ล็อกอินแอดมิน → token (HMAC, หมดอายุ 12 ชม.)
//   3. GET  /api/admin/me             เช็คว่า token ยังใช้ได้
//   4. GET  /api/admin/file?path=     อ่านไฟล์ล่าสุดใน repo (content/*.json)
//   5. POST /api/admin/commit         commit ไฟล์หลายไฟล์ทีเดียวขึ้น GitHub → Actions build เว็บใหม่เอง
//   6. POST /api/admin/dispatch       สั่งรัน workflow (เช่น sync ข้อมูลเกมทันที)
//   7. GET  /api/admin/runs           สถานะ workflow ล่าสุด (โชว์ในหน้าแอดมินว่า build เสร็จหรือยัง)
//
// ความลับทั้งหมดเก็บเป็น Worker Secret (ไม่อยู่ใน repo):
//   ADMIN_PASSWORD, SESSION_SECRET, GITHUB_TOKEN
// ค่าทั่วไปอยู่ใน wrangler.toml [vars]: ADMIN_USERNAME, GITHUB_REPO, GITHUB_BRANCH, ALLOWED_ORIGINS
// ====================================================

export interface Env {
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
  GITHUB_TOKEN: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  ALLOWED_ORIGINS: string
  /** (ชั่วคราว ก่อนมีโดเมน) เช่น https://navik3069.github.io/Line_ranger_wabsite_kiwi_forgithub */
  PAGES_ORIGIN?: string
  /** สถิติคนเข้าเว็บ (Cloudflare Web Analytics) — token สิทธิ์ Account Analytics: Read (secret) */
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  /** (ไม่บังคับ) site tag ของ Web Analytics — ถ้าบัญชีมีหลายเว็บ */
  CF_RUM_SITE_TAG?: string
}

const LERICO = 'https://rangers.lerico.net'
const TOKEN_TTL_SEC = 12 * 60 * 60
const GH = 'https://api.github.com'

// ── helpers ──────────────────────────────────────────

const te = new TextEncoder()

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u8) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, te.encode(data)))
}

/** เทียบสตริงแบบเวลาคงที่ (กันเดารหัสจากเวลาตอบ) — เทียบ HMAC ของทั้งสองฝั่ง ความยาวเท่ากันเสมอ */
async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac(secret, a), hmac(secret, b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i)
  return diff === 0 && ha.length === hb.length
}

async function makeToken(env: Env, user: string): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  const payload = b64url(te.encode(JSON.stringify({ u: user, exp })))
  return { token: `${payload}.${await hmac(env.SESSION_SECRET, payload)}`, exp }
}

async function verifyToken(env: Env, req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  if (!(await safeEqual(sig, await hmac(env.SESSION_SECRET, payload), env.SESSION_SECRET))) return null
  try {
    const { u, exp } = JSON.parse(b64urlDecode(payload)) as { u: string; exp: number }
    return exp > Date.now() / 1000 ? u : null
  } catch {
    return null
  }
}

function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

async function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'line-ranger-kiwi-worker',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

async function ghJson<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await gh(env, path, init)
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

// ── 1. lerico proxy ──────────────────────────────────

async function lericoProxy(req: Request, url: URL, ctx: ExecutionContext): Promise<Response> {
  const path = url.pathname.slice('/lerico'.length)
  // อนุญาตเฉพาะไฟล์เกม (/res/) และ API ข้อมูล (/api/) — กันใช้ Worker เป็น open proxy
  if (!path.startsWith('/res/') && !path.startsWith('/api/')) {
    return new Response('Not allowed', { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  const isFile = path.startsWith('/res/')
  // ไฟล์เกมเปลี่ยนแค่ตอนเกมอัปเดต → 30 วัน / API ข้อมูล → 10 นาที
  const ttl = isFile ? 30 * 24 * 3600 : 600
  const target = `${LERICO}${path}${url.search}`

  const cache = caches.default
  const cacheKey = new Request(target, { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const upstream = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: req.headers.get('Accept') ?? '*/*' },
    cf: { cacheTtl: ttl, cacheEverything: true },
  })
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/octet-stream')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', upstream.ok ? `public, max-age=${ttl}${isFile ? ', immutable' : ''}` : 'no-store')
  const res = new Response(upstream.body, { status: upstream.status, headers })
  // เก็บ cache ที่ edge (ใช้ได้เมื่อ Worker ผูกกับโดเมนของตัวเอง — บน *.workers.dev จะข้ามไปเฉยๆ)
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}

// ── 2–7. admin ───────────────────────────────────────

interface CommitFile { path: string; content?: string; encoding?: 'utf-8' | 'base64'; delete?: boolean }

/** ไฟล์ที่แอดมินแก้ได้ — จำกัดไว้ กันกรณี token หลุดแล้วโดนแก้ workflow / โค้ด */
const WRITABLE = [/^content\/[\w.-]+\.json$/, /^public\/content-images\/[\w./-]+\.(png|jpe?g|webp|gif)$/]
const isWritable = (p: string) => !p.includes('..') && WRITABLE.some(re => re.test(p))
const READABLE = [/^content\/[\w.-]+\.json$/]

async function commitFiles(env: Env, message: string, files: CommitFile[]): Promise<{ sha: string; url: string }> {
  const branch = env.GITHUB_BRANCH
  const ref = await ghJson<{ object: { sha: string } }>(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${branch}`)
  const head = await ghJson<{ tree: { sha: string } }>(env, `/repos/${env.GITHUB_REPO}/git/commits/${ref.object.sha}`)
  const tree = await Promise.all(files.map(async f => {
    if (f.delete) return { path: f.path, mode: '100644', type: 'blob', sha: null }
    const blob = await ghJson<{ sha: string }>(env, `/repos/${env.GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: f.content ?? '', encoding: f.encoding ?? 'utf-8' }),
    })
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha }
  }))
  const newTree = await ghJson<{ sha: string }>(env, `/repos/${env.GITHUB_REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: head.tree.sha, tree }),
  })
  const commit = await ghJson<{ sha: string; html_url: string }>(env, `/repos/${env.GITHUB_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  })
  await ghJson(env, `/repos/${env.GITHUB_REPO}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })
  return { sha: commit.sha, url: commit.html_url }
}

async function admin(req: Request, url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const route = url.pathname.slice('/api/admin'.length)

  if (route === '/login' && req.method === 'POST') {
    const { username, password } = await req.json() as { username?: string; password?: string }
    const okUser = await safeEqual(username ?? '', env.ADMIN_USERNAME, env.SESSION_SECRET)
    const okPass = await safeEqual(password ?? '', env.ADMIN_PASSWORD, env.SESSION_SECRET)
    if (!okUser || !okPass) {
      // หน่วงเล็กน้อยกันการเดารหัสรัวๆ (ใช้คู่กับ Rate limiting rule ของ Cloudflare)
      await new Promise(r => setTimeout(r, 800))
      return json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401, cors)
    }
    return json({ ...(await makeToken(env, env.ADMIN_USERNAME)), username: env.ADMIN_USERNAME }, 200, cors)
  }

  const user = await verifyToken(env, req)
  if (!user) return json({ error: 'Unauthorized' }, 401, cors)

  if (route === '/me') return json({ username: user }, 200, cors)

  if (route === '/file' && req.method === 'GET') {
    const path = url.searchParams.get('path') ?? ''
    if (!READABLE.some(re => re.test(path))) return json({ error: 'Path not allowed' }, 403, cors)
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`, {
      headers: { Accept: 'application/vnd.github.raw+json' },
    })
    if (res.status === 404) return json({ error: 'Not found' }, 404, cors)
    if (!res.ok) return json({ error: `GitHub ${res.status}` }, 502, cors)
    return new Response(res.body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } })
  }

  if (route === '/commit' && req.method === 'POST') {
    const { message, files } = await req.json() as { message?: string; files?: CommitFile[] }
    if (!Array.isArray(files) || files.length === 0 || files.length > 30) return json({ error: 'files: 1–30 ไฟล์' }, 400, cors)
    const bad = files.find(f => !isWritable(f.path))
    if (bad) return json({ error: `แก้ไฟล์นี้ไม่ได้: ${bad.path}` }, 403, cors)
    const result = await commitFiles(env, `${message || 'admin: update content'}\n\nvia admin panel (${user})`, files)
    return json({ ok: true, ...result }, 200, cors)
  }

  if (route === '/dispatch' && req.method === 'POST') {
    const { workflow } = await req.json() as { workflow?: string }
    if (workflow !== 'data.yml' && workflow !== 'deploy.yml') return json({ error: 'Unknown workflow' }, 400, cors)
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: env.GITHUB_BRANCH }),
    })
    if (!res.ok) return json({ error: `GitHub ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502, cors)
    return json({ ok: true }, 200, cors)
  }

  if (route === '/analytics' && req.method === 'GET') {
    return analytics(url, env, cors)
  }

  if (route === '/runs' && req.method === 'GET') {
    const data = await ghJson<{ workflow_runs: Array<Record<string, unknown>> }>(env, `/repos/${env.GITHUB_REPO}/actions/runs?per_page=6`)
    return json({
      runs: data.workflow_runs.map(r => ({
        name: r.name, status: r.status, conclusion: r.conclusion, event: r.event,
        createdAt: r.created_at, updatedAt: r.updated_at, url: r.html_url,
      })),
    }, 200, cors)
  }

  return json({ error: 'Not found' }, 404, cors)
}

// ── สถิติคนเข้าเว็บ: Cloudflare Web Analytics (RUM) ผ่าน GraphQL Analytics API ──
// แบ่งช่วงเวลาเป็นก้อนละ ≤ 30 วัน (จำกัดช่วงต่อคำขอ) แล้วรวมผล · cache ที่ edge 10 นาที

interface RumRow { count: number; sum?: { visits?: number }; dimensions: Record<string, string> }
type Top = { name: string; views: number; visits: number }

const RUM_QUERY = `query($acc: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $acc }) {
    daily: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 100, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    pages: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 20, orderBy: [count_DESC]) { count sum { visits } dimensions { name: requestPath } }
    refs: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 20, orderBy: [count_DESC]) { count sum { visits } dimensions { name: refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 20, orderBy: [count_DESC]) { count sum { visits } dimensions { name: countryName } }
    devices: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10, orderBy: [count_DESC]) { count sum { visits } dimensions { name: deviceType } }
  } }
}`

async function analytics(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return json({ error: 'not_configured' }, 503, cors)
  const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30

  const cacheKey = new Request(`https://analytics.cache/${env.CF_ACCOUNT_ID}/${days}`)
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', ...cors } })

  const DAY = 86400000
  const end = Date.now()
  const start = end - days * DAY
  const chunks: [number, number][] = []
  for (let a = start; a < end; a += 30 * DAY) chunks.push([a, Math.min(a + 30 * DAY, end)])

  const daily = new Map<string, { views: number; visits: number }>()
  const tops: Record<'pages' | 'refs' | 'countries' | 'devices', Map<string, Top>> = { pages: new Map(), refs: new Map(), countries: new Map(), devices: new Map() }

  for (const [a, b] of chunks) {
    const and: Record<string, unknown>[] = [{ datetime_geq: new Date(a).toISOString() }, { datetime_lt: new Date(b).toISOString() }]
    if (env.CF_RUM_SITE_TAG) and.push({ siteTag: env.CF_RUM_SITE_TAG })
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: RUM_QUERY, variables: { acc: env.CF_ACCOUNT_ID, filter: { AND: and } } }),
    })
    const data = await res.json() as { data?: { viewer?: { accounts?: Record<string, RumRow[]>[] } }; errors?: { message: string }[] }
    if (!res.ok || data.errors?.length) {
      return json({ error: data.errors?.map(e => e.message).join('; ') || `Cloudflare ${res.status}` }, 502, cors)
    }
    const acc = data.data?.viewer?.accounts?.[0] ?? {}
    for (const r of acc.daily ?? []) {
      const d = daily.get(r.dimensions.date) ?? { views: 0, visits: 0 }
      d.views += r.count; d.visits += r.sum?.visits ?? 0
      daily.set(r.dimensions.date, d)
    }
    for (const k of Object.keys(tops) as (keyof typeof tops)[]) {
      for (const r of acc[k] ?? []) {
        const name = r.dimensions.name || ''
        const t = tops[k].get(name) ?? { name, views: 0, visits: 0 }
        t.views += r.count; t.visits += r.sum?.visits ?? 0
        tops[k].set(name, t)
      }
    }
  }

  // ทุกวันในช่วง (วันที่ไม่มีคนเข้า = 0) เรียงจากเก่า→ใหม่
  const series: { date: string; views: number; visits: number }[] = []
  for (let t = start; t <= end; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10)
    if (series.at(-1)?.date === date) continue
    series.push({ date, ...(daily.get(date) ?? { views: 0, visits: 0 }) })
  }
  const top = (m: Map<string, Top>, n = 10) => [...m.values()].sort((x, y) => y.views - x.views).slice(0, n)
  const body = JSON.stringify({
    days, generatedAt: new Date().toISOString(), series,
    totals: { views: series.reduce((s, d) => s + d.views, 0), visits: series.reduce((s, d) => s + d.visits, 0) },
    pages: top(tops.pages), referrers: top(tops.refs), countries: top(tops.countries), devices: top(tops.devices, 5),
  })
  await cache.put(cacheKey, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' } }))
  return new Response(body, { headers: { 'Content-Type': 'application/json', ...cors } })
}

// ── (ชั่วคราว) เสิร์ฟเว็บจาก GitHub Pages ───────────────

async function servePages(req: Request, url: URL, origin: string): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const base = origin.replace(/\/+$/, '')
  const upstream = await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual', cf: { cacheTtl: 300 } })
  const headers = new Headers(upstream.headers)
  const loc = headers.get('Location')
  if (loc && loc.startsWith(base)) headers.set('Location', url.origin + loc.slice(base.length))
  return new Response(upstream.body, { status: upstream.status, headers })
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname.startsWith('/lerico/')) {
      if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } })
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      return lericoProxy(req, url, ctx)
    }

    // API แอดมินอยู่ใต้ /api/admin/ — ห้ามใช้ /admin/ เพราะชนกับหน้าเว็บแอดมินตอน Worker เสิร์ฟหน้าเว็บด้วย
    if (url.pathname.startsWith('/api/admin/')) {
      const cors = corsHeaders(env, req)
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      try {
        return await admin(req, url, env, cors)
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500, cors)
      }
    }

    // ช่วงที่ยังไม่มีโดเมน: เสิร์ฟหน้าเว็บจาก GitHub Pages ผ่าน Worker ที่รากของ *.workers.dev
    // (เว็บอ้างไฟล์แบบ /gacha/... จึงต้องอยู่ที่ราก — github.io/<repo>/ โหลดไม่ครบ)
    // มีโดเมนแล้ว → ลบ PAGES_ORIGIN ออกจาก wrangler.toml ได้เลย
    if (env.PAGES_ORIGIN) return servePages(req, url, env.PAGES_ORIGIN)

    if (url.pathname === '/') return new Response('Line Ranger Kiwi worker OK', { headers: { 'Content-Type': 'text/plain' } })
    return new Response('Not found', { status: 404 })
  },
}
