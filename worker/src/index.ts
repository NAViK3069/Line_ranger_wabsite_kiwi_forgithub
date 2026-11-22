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
//   7. GET  /api/admin/runs           ประวัติ workflow (?page= &per_page= &workflow=) — โชว์ในหน้าแอดมิน
//   8. GET  /api/admin/run-jobs?id=   ขั้นตอนของรอบนั้น (สำเร็จ/ล้มเหลวทีละขั้น)
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
  /** (ไม่ได้ใช้แล้ว — เว็บอยู่ที่ ranger-kiwi.com) เผื่ออยากให้ Worker เสิร์ฟหน้าเว็บจาก GitHub Pages อีก */
  PAGES_ORIGIN?: string
  /** สถิติคนเข้าเว็บ (Cloudflare Web Analytics) — token สิทธิ์ Account Analytics: Read (secret) */
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  /** (ไม่บังคับ) site tag ของ Web Analytics — ถ้าบัญชีมีหลายเว็บ */
  CF_RUM_SITE_TAG?: string
  /** Workers Rate Limiting binding (wrangler.toml [[ratelimits]]) — จำกัดจำนวนครั้งล็อกอินต่อ IP */
  LOGIN_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> }
}

const LERICO = 'https://rangers.lerico.net'
const LERICO_HOST = 'rangers.lerico.net'
const TOKEN_TTL_SEC = 12 * 60 * 60
const GH = 'https://api.github.com'

// ── helpers ──────────────────────────────────────────

const te = new TextEncoder()

/** error ที่ข้อความปลอดภัยพอจะส่งกลับให้ client (ที่เหลือส่งแค่ "Internal error" แล้ว log ไว้ดูใน wrangler tail) */
class PublicError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** อ่าน JSON body แบบจำกัดขนาด — กัน body ใหญ่มหาศาล / JSON พังแล้วหลุดข้อความ error ภายใน */
async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const len = Number(req.headers.get('Content-Length') ?? '0')
  if (len > maxBytes) throw new PublicError('Request too large', 413)
  const buf = await req.arrayBuffer()
  if (buf.byteLength > maxBytes) throw new PublicError('Request too large', 413)
  try {
    const v = JSON.parse(new TextDecoder().decode(buf)) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error()
    return v as T
  } catch {
    throw new PublicError('Invalid JSON', 400)
  }
}

/** ตั้งค่า secret ครบไหม — ถ้า ADMIN_PASSWORD หาย รหัสว่างจะผ่าน (encode(undefined) = '') จึงต้องปิดตายไว้ก่อน */
function configured(env: Env): boolean {
  return !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 && env.GITHUB_TOKEN)
}

// ตัวนับสำรอง (ต่อ isolate) เผื่อยังไม่ได้ผูก LOGIN_LIMITER — กันได้ระดับหนึ่ง ไม่แม่นเท่า binding
const loginHits = new Map<string, { n: number; reset: number }>()
async function loginAllowed(env: Env, ip: string): Promise<boolean> {
  if (env.LOGIN_LIMITER) {
    try { return (await env.LOGIN_LIMITER.limit({ key: `login:${ip}` })).success } catch { /* ใช้ตัวสำรอง */ }
  }
  const now = Date.now()
  if (loginHits.size > 5000) loginHits.clear()
  const h = loginHits.get(ip)
  if (!h || h.reset < now) { loginHits.set(ip, { n: 1, reset: now + 60_000 }); return true }
  h.n++
  return h.n <= 5
}

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
    const { u, exp } = JSON.parse(b64urlDecode(payload)) as { u: unknown; exp: unknown }
    return typeof u === 'string' && typeof exp === 'number' && exp > Date.now() / 1000 ? u : null
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
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
  if (!res.ok) {
    // รายละเอียดเก็บไว้ใน log (wrangler tail) — ส่งกลับแค่รหัสสถานะ ไม่หลุดชื่อ repo/path/ข้อความจาก GitHub
    console.error(`GitHub ${init.method ?? 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`)
    throw new PublicError(`GitHub ${res.status}`, 502)
  }
  return res.json() as Promise<T>
}

// ── 1. lerico proxy ──────────────────────────────────

/** query ที่เว็บใช้จริงกับ lerico (?keys= ของ translate, ?v= ของไฟล์ locale) — ตัวอื่นตัดทิ้ง กันยิง query สุ่มทะลุ cache */
const LERICO_QUERY_KEYS = new Set(['keys', 'v'])

/** พาธที่ส่งต่อไป lerico ได้ — เฉพาะ /res/ กับ /api/ และห้ามมีอะไรที่พาออกนอกโฟลเดอร์นั้น */
function safeLericoPath(path: string): string | null {
  if (path.length > 512 || (!path.startsWith('/res/') && !path.startsWith('/api/'))) return null
  // %2F / %5C = ทับที่ซ่อนไว้ (ต้นทางอาจถอดเป็น / แล้วหลุดโฟลเดอร์) · ตัวควบคุม/NUL ไม่มีในชื่อไฟล์จริง
  if (/%2f|%5c|%00/i.test(path)) return null
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { return null }
  if (/[\\\x00-\x1f\x7f]/.test(decoded)) return null
  if (decoded.split('/').some(s => s === '..' || s === '.')) return null
  return path
}

const PROXY_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // ไฟล์ที่ผ่าน proxy เป็นข้อมูลล้วน — ถ้าต้นทางส่ง HTML/SVG มา (เช่นหน้า list โฟลเดอร์) ห้ามรันสคริปต์บนโดเมน api.*
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  'X-Content-Type-Options': 'nosniff',
}

async function lericoProxy(req: Request, url: URL, ctx: ExecutionContext): Promise<Response> {
  // อนุญาตเฉพาะไฟล์เกม (/res/) และ API ข้อมูล (/api/) ของ rangers.lerico.net — กันใช้ Worker เป็น open proxy
  const path = safeLericoPath(url.pathname.slice('/lerico'.length))
  if (!path) return new Response('Not allowed', { status: 403, headers: PROXY_HEADERS })
  const isFile = path.startsWith('/res/')
  // ไฟล์เกมเปลี่ยนแค่ตอนเกมอัปเดต → 30 วัน / API ข้อมูล → 10 นาที
  const ttl = isFile ? 30 * 24 * 3600 : 600
  const q = new URLSearchParams()
  for (const [k, v] of [...url.searchParams].sort(([a], [b]) => a.localeCompare(b))) {
    if (LERICO_QUERY_KEYS.has(k) && v.length <= 200) q.append(k, v)
  }
  const qs = q.toString()
  const target = `${LERICO}${path}${qs ? `?${qs}` : ''}`

  const cache = caches.default
  // cache key = URL ที่ผ่านการกรองแล้วเท่านั้น (ไม่ขึ้นกับ header ของคนขอ) → คนนอกวางยา cache ไม่ได้
  // (?_kc=2 แยกจาก cache ชุดเก่าที่ยังไม่มีหัว CSP/nosniff)
  const cacheKey = new Request(`${target}${qs ? '&' : '?'}_kc=2`, { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let upstream: Response
  try {
    upstream = await fetch(target, {
      // Accept คงที่ — ถ้าส่งต่อ Accept ของคนขอ ต้นทางอาจตอบคนละแบบแล้วไปค้างใน cache ให้ทุกคน
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ttl, '404': 300, '500-599': 0 } },
    })
  } catch (err) {
    console.error('lerico fetch failed', err)
    return new Response('Upstream error', { status: 502, headers: PROXY_HEADERS })
  }
  // ต้นทาง redirect ไปโฮสต์อื่น → ไม่ส่งต่อ (กันกลายเป็น proxy ไปเว็บอื่น)
  if (new URL(upstream.url || target).hostname !== LERICO_HOST) {
    return new Response('Upstream redirect not allowed', { status: 502, headers: PROXY_HEADERS })
  }
  const headers = new Headers(PROXY_HEADERS)
  headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/octet-stream')
  headers.set('Cache-Control', upstream.ok ? `public, max-age=${ttl}${isFile ? ', immutable' : ''}` : 'no-store')
  const res = new Response(upstream.body, { status: upstream.status, headers })
  // เก็บ cache ที่ edge (ใช้ได้เมื่อ Worker ผูกกับโดเมนของตัวเอง — บน *.workers.dev จะข้ามไปเฉยๆ)
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}

// ── 2–7. admin ───────────────────────────────────────

interface CommitFile { path: string; content?: string; encoding?: 'utf-8' | 'base64'; delete?: boolean }

/** ไฟล์ที่แอดมินแก้ได้ — จำกัดไว้ กันกรณี token หลุดแล้วโดนแก้ workflow / โค้ด */
const JSON_PATH = /^content\/[\w-][\w.-]*\.json$/
const IMAGE_PATH = /^public\/content-images\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.(png|jpe?g|webp|gif)$/
const isWritable = (p: unknown): p is string =>
  typeof p === 'string' && p.length <= 200 && !p.includes('..') && (JSON_PATH.test(p) || IMAGE_PATH.test(p))
const READABLE = [JSON_PATH]

// gacha-pools.json จริงใหญ่ ~2.3 MB — เผื่อโตไว้
const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_COMMIT_BODY = 40 * 1024 * 1024
/**
 * ไฟล์เล็กกว่านี้ (site-profile / tierlist — ไฟล์ที่มีลิงก์ไปโผล่เป็น href) ตรวจละเอียด: JSON.parse + หาลิงก์อันตราย
 * ไฟล์ใหญ่ (gacha-pools ~2.3 MB) ข้าม เพราะ Workers ฟรีให้ CPU ~10 ms/ครั้ง และไม่มีช่องไหนเป็นลิงก์
 */
const PARSE_CHECK_BYTES = 512 * 1024

// ช่องว่าง หรือ \t \n \r ในรูป escape ของ JSON — เบราว์เซอร์ข้ามตัวพวกนี้ในชื่อ scheme ได้ ("java\tscript:")
const W = '(?:\\s|\\\\[tnr])*'
const spaced = (w: string) => [...w].map(c => (c === '/' ? '\\/' : c)).join(W)
/** ลิงก์อันตรายที่ห้ามขึ้นต้นสตริงใดๆ ใน JSON (กันเก็บ XSS ไว้ใน content) — ชั้นหลักอยู่ที่หน้าเว็บ (safeUrl) อันนี้กันซ้ำ */
const DANGEROUS_URL = new RegExp(`"${W}(?:${spaced('javascript')}|${spaced('vbscript')})${W}:|"${W}${spaced('data')}${W}:${W}${spaced('text/html')}`, 'i')

/** ไบต์แรกของรูป ต้องเป็นชนิดเดียวกับนามสกุล (กันอัปไฟล์อื่นที่ตั้งชื่อเป็น .png) */
function imageMagicOk(path: string, b64: string): boolean {
  let head: string
  try { head = atob(b64.slice(0, 24)) } catch { return false }
  const b = (i: number) => head.charCodeAt(i)
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'png') return b(0) === 0x89 && head.slice(1, 4) === 'PNG'
  if (ext === 'jpg' || ext === 'jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff
  if (ext === 'gif') return head.startsWith('GIF8')
  if (ext === 'webp') return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
  return false
}

/** ตรวจไฟล์ทุกไฟล์ก่อน commit — คืนข้อความ error (ภาษาไทย) หรือ null ถ้าผ่าน */
function validateFile(f: CommitFile): string | null {
  if (!f || typeof f !== 'object' || !isWritable(f.path)) return `แก้ไฟล์นี้ไม่ได้: ${String((f as { path?: unknown })?.path ?? '').slice(0, 100)}`
  if (f.delete === true) return null
  if (typeof f.content !== 'string') return `${f.path}: ไม่มีเนื้อหา`
  if (JSON_PATH.test(f.path)) {
    if (f.encoding && f.encoding !== 'utf-8') return `${f.path}: ต้องเป็น utf-8`
    // (ความยาวสตริง ≤ จำนวนไบต์ utf-8 เสมอ — เช็คหยาบก่อนกันต้อง encode ทั้งก้อน)
    if (f.content.length > MAX_JSON_BYTES) return `${f.path}: ใหญ่เกิน 8 MB`
    if (!/^\s*[[{]/.test(f.content)) return `${f.path}: JSON ไม่ถูกต้อง`
    if (f.content.length <= PARSE_CHECK_BYTES) {
      try { JSON.parse(f.content) } catch { return `${f.path}: JSON ไม่ถูกต้อง` }
      if (DANGEROUS_URL.test(f.content)) return `${f.path}: มีลิงก์ที่ไม่อนุญาต (javascript: / data:text/html)`
    }
    return null
  }
  // รูป
  if (f.encoding !== 'base64') return `${f.path}: รูปต้องส่งเป็น base64`
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(f.content)) return `${f.path}: base64 ไม่ถูกต้อง`
  if (f.content.length * 0.75 > MAX_IMAGE_BYTES) return `${f.path}: รูปใหญ่เกิน 5 MB`
  if (!imageMagicOk(f.path, f.content)) return `${f.path}: ไฟล์ไม่ใช่รูปตามนามสกุล`
  return null
}

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

/** workflow ที่หน้าแอดมินกรองดูได้ */
const WORKFLOW_FILES = ['data.yml', 'deploy.yml', 'talent-coverage-check.yml']

/** ตัวเลขจาก query — นอกช่วง/ไม่ใช่ตัวเลข = ค่าเริ่มต้น */
function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : def
}

async function admin(req: Request, url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const route = url.pathname.slice('/api/admin'.length)

  // secret ไม่ครบ = ปิดระบบแอดมินทั้งหมด (fail closed)
  if (!configured(env)) return json({ error: 'Admin is not configured' }, 503, cors)

  if (route === '/login' && req.method === 'POST') {
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (!(await loginAllowed(env, ip))) {
      return json({ error: 'ลองหลายครั้งเกินไป รอ 1 นาทีแล้วลองใหม่' }, 429, { ...cors, 'Retry-After': '60' })
    }
    const { username, password } = await readJson<{ username?: unknown; password?: unknown }>(req, 4096)
    const okUser = await safeEqual(typeof username === 'string' ? username : '', env.ADMIN_USERNAME, env.SESSION_SECRET)
    const okPass = await safeEqual(typeof password === 'string' ? password : '', env.ADMIN_PASSWORD, env.SESSION_SECRET)
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
    return new Response(res.body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors } })
  }

  if (route === '/commit' && req.method === 'POST') {
    const { message, files } = await readJson<{ message?: unknown; files?: CommitFile[] }>(req, MAX_COMMIT_BODY)
    if (!Array.isArray(files) || files.length === 0 || files.length > 30) return json({ error: 'files: 1–30 ไฟล์' }, 400, cors)
    if (new Set(files.map(f => f?.path)).size !== files.length) return json({ error: 'มีไฟล์ซ้ำกัน' }, 400, cors)
    for (const f of files) {
      const err = validateFile(f)
      if (err) return json({ error: err }, isWritable(f?.path) ? 400 : 403, cors)
    }
    const msg = (typeof message === 'string' && message.trim() ? message : 'admin: update content').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').slice(0, 300)
    const clean = files.map(f => (f.delete === true
      ? { path: f.path, delete: true }
      : { path: f.path, content: f.content, encoding: JSON_PATH.test(f.path) ? 'utf-8' as const : 'base64' as const }))
    const result = await commitFiles(env, `${msg}\n\nvia admin panel (${user})`, clean)
    return json({ ok: true, ...result }, 200, cors)
  }

  if (route === '/dispatch' && req.method === 'POST') {
    const { workflow } = await readJson<{ workflow?: unknown }>(req, 1024)
    if (workflow !== 'data.yml' && workflow !== 'deploy.yml') return json({ error: 'Unknown workflow' }, 400, cors)
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: env.GITHUB_BRANCH }),
    })
    if (!res.ok) {
      console.error(`dispatch ${workflow} → ${res.status} ${(await res.text()).slice(0, 300)}`)
      return json({ error: `GitHub ${res.status}` }, 502, cors)
    }
    return json({ ok: true }, 200, cors)
  }

  if (route === '/analytics' && req.method === 'GET') {
    return analytics(url, env, cors)
  }

  if (route === '/runs' && req.method === 'GET') {
    // ?page=1&per_page=30&workflow=data.yml — ไม่ใส่อะไร = 6 รอบล่าสุดทุก workflow (ป้ายสถานะใน AdminNav)
    const page = intParam(url.searchParams.get('page'), 1, 1, 100)
    const perPage = intParam(url.searchParams.get('per_page'), 6, 1, 50)
    const wf = url.searchParams.get('workflow') ?? ''
    const base = WORKFLOW_FILES.includes(wf) ? `/actions/workflows/${wf}/runs` : '/actions/runs'
    const data = await ghJson<{ total_count: number; workflow_runs: Array<Record<string, unknown>> }>(
      env, `/repos/${env.GITHUB_REPO}${base}?per_page=${perPage}&page=${page}`)
    const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
    return json({
      total: data.total_count, page, perPage,
      runs: data.workflow_runs.map(r => ({
        id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, event: r.event,
        createdAt: r.created_at, updatedAt: r.updated_at, startedAt: r.run_started_at, url: r.html_url,
        // ไฟล์ workflow (.github/workflows/deploy.yml) + หัวข้อ commit — หน้าแอดมินใช้แยกประเภท
        workflow: str(r.path).split('/').pop() ?? '',
        title: str(r.display_title),
        runNumber: r.run_number, attempt: r.run_attempt,
        sha: str(r.head_sha).slice(0, 7),
        actor: str((r.actor as { login?: unknown } | null)?.login, 60),
      })),
    }, 200, cors)
  }

  if (route === '/run-jobs' && req.method === 'GET') {
    // ขั้นตอนของรอบนั้น (ไว้ดูว่าขั้นไหนสำเร็จ/ล้มเหลว เช่น ดึงอันดับ PvP/เมต้า)
    const id = url.searchParams.get('id') ?? ''
    if (!/^\d{1,20}$/.test(id)) return json({ error: 'Invalid run id' }, 400, cors)
    const data = await ghJson<{ jobs: Array<Record<string, unknown>> }>(env, `/repos/${env.GITHUB_REPO}/actions/runs/${id}/jobs?per_page=20`)
    return json({
      jobs: data.jobs.map(j => ({
        name: j.name, status: j.status, conclusion: j.conclusion,
        startedAt: j.started_at, completedAt: j.completed_at, url: j.html_url,
        steps: ((j.steps as Array<Record<string, unknown>> | undefined) ?? []).map(s => ({
          name: s.name, status: s.status, conclusion: s.conclusion, number: s.number,
          startedAt: s.started_at, completedAt: s.completed_at,
        })),
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
    const data = await res.json().catch(() => ({})) as { data?: { viewer?: { accounts?: Record<string, RumRow[]>[] } }; errors?: { message: string }[] }
    if (!res.ok || data.errors?.length) {
      // ข้อความจาก GraphQL ช่วยแอดมินแก้ปัญหา (เช่น token ไม่มีสิทธิ์) — ตัดให้สั้น ไม่มีความลับในนั้น
      console.error('analytics', res.status, JSON.stringify(data.errors ?? []).slice(0, 500))
      return json({ error: (data.errors?.map(e => e.message).join('; ') || `Cloudflare ${res.status}`).slice(0, 200) }, 502, cors)
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

// ── (ไม่ได้ใช้แล้ว) เสิร์ฟเว็บจาก GitHub Pages — ทำงานเฉพาะเมื่อตั้ง PAGES_ORIGIN ──

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
        if (err instanceof PublicError) return json({ error: err.message }, err.status, cors)
        // error ที่ไม่ได้ตั้งใจ — ไม่ส่งข้อความภายในออกไป (ดูได้จาก wrangler tail)
        console.error('admin error', err)
        return json({ error: 'Internal error' }, 500, cors)
      }
    }

    // (ไม่ได้ใช้แล้ว) สมัยยังไม่มีโดเมน Worker เคยเสิร์ฟหน้าเว็บจาก GitHub Pages ที่รากของ *.workers.dev
    // ตอนนี้เว็บอยู่ที่ ranger-kiwi.com และ wrangler.toml ไม่ได้ตั้ง PAGES_ORIGIN → บรรทัดนี้ไม่ทำงาน
    if (env.PAGES_ORIGIN) return servePages(req, url, env.PAGES_ORIGIN)

    if (url.pathname === '/') return new Response('Line Ranger Kiwi worker OK', { headers: { 'Content-Type': 'text/plain' } })
    return new Response('Not found', { status: 404 })
  },
}
