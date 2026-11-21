// ====================================================
// actions.ts — คำสั่งระดับสูงที่ UI เรียก (เพิ่มเรนเจอร์ / สื่อ / สกิล / ลบ / ทำซ้ำ ...)
// ====================================================
import { assets, fetchRangerListing, isAudioName, isVideoName, uploadFile, type MovePart, type RangerRuntime, type SkillSoundKind } from './assets'
import { L, getLang } from './i18n'
import { api, anmeFetch, rememberRanger } from './storage'
import { GAME_SPEED_TO_PXS } from './timeline'
import {
  ART_FACES_LEFT, clamp, defaultFx, emptyScene, newSoundCue, defaultBackground, newActor, newAnimCue, newCameraCue, newMoveCue, newShowCue, newSkillCue, uid,
} from './scene'
import { getState, replaceScene, select, setState, toast, updateScene } from './store'
import { actorPos, buildTimeline, sceneEnd } from './timeline'
import type { Actor, ActorTag, AssetDef, Cue, SamSetUrls, Scene, SkillCue, SkillFx } from './types'
import { AUDIO_ID, CAMERA_ID } from './types'

// ── รายชื่อเรนเจอร์ (ไทย/อังกฤษ) ──
export interface RangerName { id: string; en: string | null; th: string | null }
let namesPromise: Promise<RangerName[]> | null = null
export function loadNames(): Promise<RangerName[]> {
  if (!namesPromise) {
    namesPromise = anmeFetch(api('/api/names')).then(r => r.json()).then(d => d.rangers ?? [])
    namesPromise.catch(() => { namesPromise = null })
  }
  return namesPromise
}
export async function nameOf(id: string): Promise<string> {
  const list = await loadNames().catch(() => [] as RangerName[])
  const n = list.find(x => x.id === id)
  return (getLang() === 'en' ? n?.en || n?.th : n?.th || n?.en) || id
}

const isRangerAsset = (s: Scene, a: Actor) => s.assets.find(d => d.id === a.assetId)?.type === 'ranger'

/** ตำแหน่งว่างถัดไปบนพื้น (ฝ่ายเรา = ซ้าย, ศัตรู = ขวา) */
function nextSlot(s: Scene, tag: ActorTag) {
  const same = s.actors.filter(a => a.tag === tag && isRangerAsset(s, a)).length
  const W = s.width
  const x = tag === 'enemy' ? W * 0.72 + (same % 3) * 110 : W * 0.28 - (same % 3) * 110
  return { x: clamp(x, 60, W - 60), y: s.groundY + (Math.floor(same / 3) % 2) * 26 }
}

/** ฝ่ายเรายืนซ้ายหันขวา · ศัตรูยืนขวาหันซ้าย */
export const facingFor = (tag: ActorTag) => (tag === 'enemy') !== ART_FACES_LEFT
/** ทิศ "ข้างหน้า" ของ actor บนจอ (+1 = ขวา) */
export const forwardDir = (a: Actor) => ((a.flip !== ART_FACES_LEFT) ? -1 : 1)

export async function addLericoRanger(rangerId: string, opts: { form?: string; tag?: ActorTag } = {}) {
  rangerId = rangerId.trim().toLowerCase()
  if (!rangerId) return
  setState({ busy: L(`กำลังโหลด ${rangerId}…`, `Loading ${rangerId}…`) })
  try {
    const listing = await fetchRangerListing(rangerId)
    const form = opts.form ?? (listing.sets['body'] ? 'body' : Object.keys(listing.sets)[0])
    const name = await nameOf(rangerId)
    const tag = opts.tag ?? 'ally'
    let actorId = ''
    updateScene(s => {
      let def = s.assets.find(d => d.type === 'ranger' && d.source === 'lerico' && d.rangerId === rangerId && d.form === form)
      if (!def) {
        def = { id: uid('r'), type: 'ranger', source: 'lerico', rangerId, form, name: form === 'body' ? name : `${name} (${form})` }
        s.assets.push(def)
      }
      const a = newActor(def, nextSlot(s, tag), { tag, flip: facingFor(tag) })
      s.actors.push(a)
      actorId = a.id
    })
    select({ kind: 'actor', id: actorId })
    rememberRanger(rangerId)
    toast(L(`เพิ่ม ${name} แล้ว`, `Added ${name}`), 'ok')
    return actorId
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error', 5000)
  } finally {
    setState({ busy: null })
  }
}

/** อัปโหลดชุดไฟล์ SAM (.sam + .plist + .png) — จับคู่ตามชื่อไฟล์ */
export async function addUploadedRanger(files: File[], tag: ActorTag = 'ally') {
  const groups = new Map<string, Partial<Record<'sam' | 'plist' | 'png', File>>>()
  for (const f of files) {
    const m = f.name.match(/^(.*)\.(sam|plist|png)$/i)
    if (!m) continue
    const g = groups.get(m[1]) ?? {}
    g[m[2].toLowerCase() as 'sam' | 'plist' | 'png'] = f
    groups.set(m[1], g)
  }
  const complete = [...groups.entries()].filter(([, g]) => g.sam && g.plist && g.png)
  if (!complete.length) { toast(L('ต้องมีไฟล์ .sam + .plist + .png ชื่อเดียวกันอย่างน้อย 1 ชุด', 'Need at least one .sam + .plist + .png set with the same name'), 'error', 5000); return }
  setState({ busy: L(`กำลังอัปโหลด ${complete.length} ชุด…`, `Uploading ${complete.length} set(s)…`) })
  try {
    // ชุดตัวละคร = ชื่อลงท้าย body · ไม่มีก็เอาชุดที่ไฟล์ .sam ใหญ่สุด
    const bodyStem = complete.find(([k]) => /(^|-)e?-?body$/i.test(k))?.[0]
      ?? complete.slice().sort((a, b) => b[1].sam!.size - a[1].sam!.size)[0][0]
    // "u1652e-al-body" → คำนำหน้า "u1652e-al-" · ชุดอื่นตัดคำนำหน้าแล้วได้ชื่อสั้น (bul2, e-bul2 → bul2)
    const prefix = bodyStem.replace(/(e-)?body$/i, '')
    const sets: Record<string, SamSetUrls> = {}
    for (const [stem, g] of complete) {
      const [sam, plist, png] = await Promise.all([uploadFile(g.sam!), uploadFile(g.plist!), uploadFile(g.png!)])
      const key = stem === bodyStem ? 'body' : (prefix && stem.startsWith(prefix) ? stem.slice(prefix.length) : stem).replace(/^[-_]+/, '').replace(/^e-/, '') || stem
      sets[key] = { sam: sam.url, plist: plist.url, png: png.url }
    }
    const name = prefix.replace(/[-_]+$/, '') || bodyStem
    let actorId = ''
    updateScene(s => {
      const def: AssetDef = { id: uid('r'), type: 'ranger', source: 'upload', name, sets, body: 'body' }
      s.assets.push(def)
      const a = newActor(def, nextSlot(s, tag), { tag, flip: facingFor(tag) })
      s.actors.push(a)
      actorId = a.id
    })
    select({ kind: 'actor', id: actorId })
    toast(L(`เพิ่ม ${name} (${Object.keys(sets).length} ชุด)`, `Added ${name} (${Object.keys(sets).length} sets)`), 'ok')
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error', 5000)
  } finally {
    setState({ busy: null })
  }
}

/** เพิ่มสื่อ (ภาพ/gif/webp/วิดีโอ) จาก URL ที่อัปโหลดแล้ว */
export function addMediaActor(url: string, name: string, opts: { asBackground?: boolean; mime?: string } = {}) {
  const type: AssetDef['type'] = isVideoName(name) || opts.mime?.startsWith('video/') ? 'video' : 'image'
  let id = ''
  updateScene(s => {
    let def = s.assets.find(d => (d.type === 'image' || d.type === 'video') && d.url === url)
    if (!def) { def = { id: uid('m'), type, name, url } as AssetDef; s.assets.push(def) }
    if (opts.asBackground) {
      s.background = { ...s.background, kind: 'asset', assetId: def.id, fit: 'cover', scale: 1, offsetX: 0, offsetY: 0 }
      return
    }
    const a = newActor(def, { x: s.width / 2, y: s.height / 2 }, { tag: 'prop' })
    s.actors.push(a)
    id = a.id
  })
  if (id) {
    select({ kind: 'actor', id })
    fitMediaWhenReady(id)
  } else select({ kind: 'background' })
}

/** ภาพใหญ่เกินเวที → ย่อให้สูงไม่เกินครึ่งจอเมื่อโหลดเสร็จ */
function fitMediaWhenReady(actorId: string) {
  const tryFit = () => {
    const s = getState().scene
    const a = s.actors.find(x => x.id === actorId)
    if (!a) return true
    const rt = assets.get(a.assetId)
    if (!rt || rt.kind === 'ranger' || rt.kind === 'audio') return !!assets.statusOf(a.assetId) && assets.statusOf(a.assetId)!.state === 'error'
    const k = Math.min(1, (s.height * 0.55) / rt.h, (s.width * 0.6) / rt.w)
    if (k < 1) updateScene(d => { const x = d.actors.find(y => y.id === actorId); if (x) x.scale = Math.round(k * 100) / 100 }, false)
    return true
  }
  if (tryFit()) return
  const off = assets.subscribe(() => { if (tryFit()) off() })
}

export async function uploadMedia(files: File[], opts: { asBackground?: boolean } = {}) {
  setState({ busy: L(`กำลังอัปโหลด ${files.length} ไฟล์…`, `Uploading ${files.length} file(s)…`) })
  try {
    for (const f of files) {
      const r = await uploadFile(f)
      addMediaActor(r.url, r.name, { ...opts, mime: f.type })
      if (opts.asBackground) break
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error', 5000)
  } finally {
    setState({ busy: null })
  }
}

export async function uploadSequence(files: File[], fps: number) {
  const sorted = files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (sorted.length < 2) { toast(L('เลือกภาพอย่างน้อย 2 ภาพ (เรียงตามชื่อไฟล์)', 'Pick at least 2 images (sorted by file name)'), 'error'); return }
  setState({ busy: L(`กำลังอัปโหลด ${sorted.length} เฟรม…`, `Uploading ${sorted.length} frames…`) })
  try {
    const urls: string[] = []
    for (const f of sorted) urls.push((await uploadFile(f)).url)
    const name = sorted[0].name.replace(/[_\-\s]*\d+\.\w+$/, '') || 'sequence'
    let id = ''
    updateScene(s => {
      const def: AssetDef = { id: uid('q'), type: 'sequence', name, urls, fps }
      s.assets.push(def)
      const a = newActor(def, { x: s.width / 2, y: s.height / 2 }, { tag: 'prop' })
      s.actors.push(a); id = a.id
    })
    select({ kind: 'actor', id })
    fitMediaWhenReady(id)
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
  } finally { setState({ busy: null }) }
}

// ── สกิล ──
/** ปุ่มสกิล → ชุดเสียงในข้อมูลเกม */
export const presetSoundKind = (key: string | undefined): SkillSoundKind => (key === 'skill1' || key === 'skill2' ? key : 'normal')
/** ไฟล์เสียงบน lerico → เส้นทางในแอพ (/api/res/… วิ่งผ่าน Worker ได้ CORS ให้ Web Audio ถอดเสียงได้) */
const gameSoundUrl = (url: string) => url.replace(/^https:\/\/rangers\.lerico\.net\/res\//, '/api/res/')
/** ชื่อแสดงผล: ตัดเวลาท้ายชื่อไฟล์ออก (attrd_u1648sally_20261023112015993.ogg → attrd_u1648sally) */
const gameSoundName = (url: string) => decodeURIComponent(url.split('/').pop() ?? url).replace(/_\d{17}\.ogg$/i, '').replace(/\.ogg$/i, '')

export interface SkillPreset { key: string; label: string; cast: string[]; release: string; set: string | null; move: MovePart | null }

export function skillPresets(rt: RangerRuntime): SkillPreset[] {
  const has = (n: string) => !!rt.sam.animations[n]?.length
  const gd = rt.gamedata
  const out: SkillPreset[] = []
  const setOr = (part: string | null | undefined, fb: string) => {
    const k = part ?? fb
    return rt.setKeys.includes(k) ? k : null
  }
  if (has('attack')) out.push({ key: 'attack', label: L('โจมตีปกติ', 'Attack'), cast: has('attack_ready') ? ['attack_ready'] : [], release: 'attack', set: setOr(gd?.n?.part, 'bul'), move: gd?.n ?? null })
  for (const [n, pre, part, fb, mv] of [[1, 's', gd?.s1?.part, 'bul2', gd?.s1], [2, 's2', gd?.s2?.part, 'bul3', gd?.s2]] as const) {
    const label = L(`สกิล ${n}`, `Skill ${n}`)
    if (has(`${pre}_action_attack_3`) || has(`${pre}_action_attack_1`)) {
      const cast = [`${pre}_action_attack_1`, `${pre}_action_attack_2`].filter(has)
      const release = has(`${pre}_action_attack_3`) ? `${pre}_action_attack_3` : cast.pop()!
      out.push({ key: `skill${n}`, label, cast, release, set: setOr(part, fb), move: mv ?? null })
    } else if (has(`${pre}_attack`)) {
      out.push({ key: `skill${n}`, label, cast: has(`${pre}_attack_ready`) ? [`${pre}_attack_ready`] : [], release: `${pre}_attack`, set: setOr(part, fb), move: mv ?? null })
    }
  }
  return out
}

/**
 * สกิลบัฟหรือสกิลโจมตี — กฎเดียวกับตัวเล่นอนิเมชั่นเรนเจอร์:
 *   ตัวชี้ขาดคือ 觸發基準 ใต้คำอธิบายสกิล: self = บัฟตัวเอง · front/rear = โจมตี
 *   ไม่มีข้อมูลนั้น → ถอยไปดู motion.type === 'NONE' · ท่าโจมตีปกติ = โจมตีเสมอ
 */
export function skillIsBuff(rt: RangerRuntime, kind: SkillSoundKind, move: MovePart | null): boolean {
  if (kind === 'normal') return false
  const basis = rt.gamedata?.basis?.[kind] ?? null
  return basis ? basis === 'self' : move?.motion === 'NONE'
}

/**
 * ค่าเอฟเฟกต์ตั้งต้นจากข้อมูลเกม (projectile_data) — ตรรกะเดียวกับตัวเล่นอนิเมชั่นเรนเจอร์ (spawnBullet):
 *   บัฟ                 → เกิดที่ตัวผู้ร่าย ยึดจุดยืน (ไฟล์วาดในพิกัดเดียวกับตัวละคร) · ไม่ล็อกเป้า (ดู addSkill)
 *   ไม่พุ่งจริง          → เกิดคาตัวเป้า: motion.enabled=false · moveSpeed=0 · start={0,0} (ของตกจากฟ้า/โผล่คาตัว)
 *   กระสุนบิน           → บินจากจุดปล่อย (start) ไปชน "กลางลำตัว" ของเป้า (ไม่ใช่หัว)
 *   hitPointRate = 0    → ลงพื้นตรงจุดยืนของเป้า · 0 < rate ≤ 1 (กระสุนบิน) → ชนจุดรับดาเมจ
 *   จุดยึดภาพ = กึ่งกลางภาพเฟรมแรกของช่วงบิน/ระเบิด (ท่าลงพื้นยึดจุดยืนของผู้ร่ายในไฟล์)
 */
export function fxFromGameData(rt: RangerRuntime, set: string, move: MovePart | null, kind: SkillSoundKind = 'normal'): SkillFx {
  const buff = skillIsBuff(rt, kind, move)
  const st = move?.start
  const noStart = !st || (!st.x && !st.y)
  const flies = !!move && move.enabled !== false && move.speed > 0 && !noStart && !!move.motion && move.motion !== 'NONE'
  const rate = move?.hitRate ?? 100
  const fx = defaultFx(set, buff ? 'caster' : flies ? 'projectile' : 'target')
  if (move && move.speed > 0) fx.speed = Math.round(move.speed * GAME_SPEED_TO_PXS)
  fx.arc = move?.motion === 'CURVE' ? null : 0
  if (buff) {
    fx.launch = { x: 0, y: 0 }
  } else {
    fx.launch = !noStart
      // start ของข้อมูลเกม: x = ไปข้างหน้า, y = นับขึ้นจากพื้น (หน่วยเดียวกับไฟล์ .sam)
      ? { x: Math.round(st!.x * (ART_FACES_LEFT ? -1 : 1)), y: Math.round(-st!.y) }
      : { x: Math.round(rt.hit.x + (ART_FACES_LEFT ? -40 : 40)), y: Math.round(rt.hit.y) }
  }
  fx.aim = rate === 0 ? 'ground' : (flies && rate > 0 && rate <= 1) ? 'face' : 'center'
  fx.anchor = buff || rate === 0 ? 'stand' : 'center'
  const b = rt.bullets[set]
  if (b) { fx.flight = b.flight; fx.finish = b.finish }
  return fx
}

function defaultTarget(s: Scene, caster: Actor): string | null {
  const others = s.actors.filter(a => a.id !== caster.id && isRangerAsset(s, a))
  const opp = others.filter(a => (caster.tag === 'enemy' ? a.tag !== 'enemy' : a.tag === 'enemy'))
  const pool = opp.length ? opp : others
  if (!pool.length) return null
  return pool.sort((a, b) => Math.abs(a.x - caster.x) - Math.abs(b.x - caster.x))[0].id
}

export function addSkill(actorId: string, presetKey: string, at?: number) {
  const s = getState().scene
  const a = s.actors.find(x => x.id === actorId)
  const rt = a && assets.get(a.assetId)
  if (!a || !rt || rt.kind !== 'ranger') return
  const p = skillPresets(rt).find(x => x.key === presetKey)
  if (!p) return
  const start = at ?? nextFreeTime(s, actorId)
  const kind = presetSoundKind(p.key)
  // สกิลบัฟ → ไม่ล็อกเป้าหมายตั้งแต่แรก (เอฟเฟกต์เกิดที่ตัวเอง ไม่มีใครโดน)
  const buff = skillIsBuff(rt, kind, p.move)
  const cue = newSkillCue(actorId, start, { label: p.label, cast: p.cast, release: p.release, targetId: buff ? null : defaultTarget(s, a) })
  if (p.set) cue.fx = fxFromGameData(rt, p.set, p.move, kind)
  // เสียงจากเกมของท่านี้: ร่าย (preparation) ตอนเริ่มร่าย + โดน (underAttack) ทุกครั้งที่กระทบ — เปิดไว้ทั้งคู่
  const snd = rt.sounds?.[kind]
  updateScene(d => {
    if (snd) {
      cue.gameSounds = ([['cast', snd.preparation], ['impact', snd.underAttack]] as const)
        .filter((x): x is readonly ['cast' | 'impact', string] => !!x[1])
        .map(([at, url]) => ({ assetId: ensureAudioAsset(d, gameSoundUrl(url), gameSoundName(url)), at, volume: 1, enabled: true }))
    }
    d.cues.push(cue); rippleAfter(d, cue.id); extendDuration(d)
  })
  select({ kind: 'cue', id: cue.id })
}

/** คิวที่ "ต่อคิวกัน" บนแถวเดียวกัน (คิวปรากฏเป็นช่วงซ้อนทับ ไม่นับ) */
const isSeq = (c: Cue) => c.type !== 'show'

/**
 * เวลาที่จะวางคิวใหม่ = หัวอ่าน · ถ้าหัวอ่านอยู่กลางคิวอื่น → ต่อท้ายคิวนั้น (แล้วค่อยดันคิวหลังๆ ออกไปด้วย rippleAfter)
 */
export function nextFreeTime(s: Scene, actorId: string): number {
  const tl = buildTimeline(s)
  let t = getState().time
  const mine = s.cues.filter(c => c.actorId === actorId && isSeq(c))
  const busyAt = mine.find(c => t >= c.start - 1e-6 && t < c.start + (tl.dur.get(c.id) ?? 0))
  if (busyAt) t = busyAt.start + (tl.dur.get(busyAt.id) ?? 0)
  return Math.round(t * 100) / 100
}

/** แทรกคิว: คิวหลังๆ ของแถวเดียวกันที่ทับกับคิวใหม่ ถูกดันออกไปเท่าที่จำเป็น (ระยะห่างเดิมคงไว้) */
export function rippleAfter(d: Scene, cueId: string) {
  const cue = d.cues.find(c => c.id === cueId)
  if (!cue || !isSeq(cue)) return
  const tl = buildTimeline(d)
  const end = cue.start + (tl.dur.get(cue.id) ?? 0)
  const later = d.cues.filter(c => c.id !== cue.id && c.actorId === cue.actorId && isSeq(c) && c.start >= cue.start - 1e-6)
    .sort((a, b) => a.start - b.start)
  if (!later.length) return
  const shift = end - later[0].start
  if (shift > 1e-6) for (const c of later) c.start = +(c.start + shift).toFixed(3)
}

export interface Placement {
  /** เวลาเริ่มที่จะวาง */
  start: number
  /** ไม่มีที่ว่างพอให้ชิด → แทรกก่อน/หลังบล็อกนี้แล้วจัดแถวใหม่ (resequenceCue) */
  insert: { id: string; before: boolean } | null
}
const EPS = 1e-4

/**
 * ตำแหน่งวางบล็อกที่ลากมา — บล็อกในแถวเดียวกันห้ามซ้อนกัน (ยกเว้นคิว "ปรากฏ")
 * เช็คจาก "ช่วงเวลาของบล็อก" ทั้งก้อน ไม่ใช่ตำแหน่งเมาส์ (เดิมจับหางแล้วดันหัวเข้าไปทับบล็อกหน้าได้)
 *   ไม่ทับใคร → วางตรงที่ลากมา
 *   ทับบล็อก X → กึ่งกลางบล็อกที่ลากอยู่ครึ่งหน้าของ X = ชิดหัว X (ต่อกันสนิทก่อน X) · ครึ่งหลัง = ชิดท้าย X
 *   ชิดแล้วยังทับตัวอื่น / เลยหน้า 0 วิ (ไม่มีที่ว่าง) → แทรกแล้วดันแถว (insert)
 */
export function placeCue(s: Scene, cue: Cue, desired: number, dur: number, durs: Map<string, number>): Placement {
  const s0 = Math.max(0, desired)
  if (!isSeq(cue)) return { start: s0, insert: null }
  const row = s.cues
    .filter(c => c.id !== cue.id && c.actorId === cue.actorId && isSeq(c))
    .map(c => ({ id: c.id, start: c.start, end: c.start + (durs.get(c.id) ?? 0) }))
  const hits = (a: number) => row.filter(r => a < r.end - EPS && a + dur > r.start + EPS)
  const over = hits(s0)
  if (!over.length) return { start: +s0.toFixed(3), insert: null }
  const ov = (r: { start: number; end: number }) => Math.min(s0 + dur, r.end) - Math.max(s0, r.start)
  const x = over.reduce((a, b) => (ov(b) > ov(a) ? b : a))
  const before = s0 + dur / 2 < (x.start + x.end) / 2
  const cand = before ? x.start - dur : x.end
  if (cand >= -EPS && !hits(Math.max(0, cand)).length) return { start: +Math.max(0, cand).toFixed(3), insert: null }
  return { start: +s0.toFixed(3), insert: { id: x.id, before } }
}

/** ท้ายสุดของบล็อกก่อนหน้า (ในแถวเดียวกัน) — ใช้กันไม่ให้ยืดหัวบล็อกไปทับ */
export function prevCueEnd(s: Scene, cue: Cue, durs: Map<string, number>): number {
  let end = 0
  for (const c of s.cues) {
    if (c.id === cue.id || c.actorId !== cue.actorId || !isSeq(c) || c.start > cue.start - EPS) continue
    end = Math.max(end, c.start + (durs.get(c.id) ?? 0))
  }
  return end
}

/**
 * สลับ/แทรกบล็อก: ย้ายคิว draggedId ไปไว้ก่อน/หลัง targetId แล้วจัดเรียงแถวนั้นใหม่
 * ช่องว่างระหว่างบล็อกคงตามตำแหน่งเดิม → บล็อกที่ต่อกันอยู่แล้วก็ยังต่อกันหลังสลับ
 */
export function resequenceCue(d: Scene, draggedId: string, origStart: number, targetId: string, before: boolean, dur: Map<string, number>) {
  const dragged = d.cues.find(c => c.id === draggedId)
  if (!dragged) return
  const startOf = (c: Cue) => (c.id === draggedId ? origStart : c.start)
  const row = d.cues.filter(c => c.actorId === dragged.actorId && isSeq(c)).sort((a, b) => startOf(a) - startOf(b))
  const gaps: number[] = []
  for (let i = 0; i < row.length - 1; i++) {
    gaps.push(Math.max(0, startOf(row[i + 1]) - (startOf(row[i]) + (dur.get(row[i].id) ?? 0))))
  }
  const base = startOf(row[0])
  const order = row.filter(c => c.id !== draggedId)
  const ti = order.findIndex(c => c.id === targetId)
  if (ti < 0) return
  order.splice(before ? ti : ti + 1, 0, dragged)
  let t = base
  order.forEach((c, i) => {
    c.start = +t.toFixed(3)
    t += (dur.get(c.id) ?? 0) + (gaps[i] ?? 0)
  })
}

function extendDuration(s: Scene) {
  const end = sceneEnd(s, buildTimeline(s))
  if (end + 0.5 > s.duration) s.duration = Math.ceil(end + 1)
}

export function addCue(kind: Cue['type'], actorId: string, clip?: string) {
  const s = getState().scene
  const t = kind === 'camera' ? getState().time : nextFreeTime(s, actorId)
  let cue: Cue
  const a = s.actors.find(x => x.id === actorId)
  switch (kind) {
    case 'anim': cue = newAnimCue(actorId, t, clip ?? a?.idleClip ?? 'idle'); break
    case 'move': {
      const p = a ? actorPos(s, a, t) : { x: s.width / 2, y: s.groundY }
      const rt = a && assets.get(a.assetId)
      const walk = rt?.kind === 'ranger' && rt.sam.animations['walk'] ? 'walk' : null
      cue = newMoveCue(actorId, t, { x: p.x + 220 * (a ? forwardDir(a) : 1), y: p.y }, walk)
      break
    }
    case 'show': cue = newShowCue(actorId, t); break
    case 'camera': cue = newCameraCue(t, { x: s.width / 2, y: s.height / 2 }); break
    default: return
  }
  updateScene(d => { d.cues.push(cue); if (kind !== 'camera') rippleAfter(d, cue.id); extendDuration(d) })
  select({ kind: 'cue', id: cue.id })
}

export function deleteSelection() {
  const { sel } = getState()
  if (sel.kind === 'actor') {
    updateScene(s => {
      s.actors = s.actors.filter(a => a.id !== sel.id)
      s.cues = s.cues.filter(c => c.actorId !== sel.id).map(c => (c.type === 'skill' && c.targetId === sel.id ? { ...c, targetId: null } : c))
      pruneAssets(s)
    })
  } else if (sel.kind === 'cue') {
    updateScene(s => { s.cues = s.cues.filter(c => c.id !== sel.id) })
  } else return
  select({ kind: 'none' })
}

function pruneAssets(s: Scene) {
  const used = new Set([...s.actors.map(a => a.assetId), s.background.assetId])
  s.assets = s.assets.filter(d => used.has(d.id))
}

export function duplicateSelection() {
  const { sel, scene } = getState()
  if (sel.kind === 'actor') {
    const a = scene.actors.find(x => x.id === sel.id)
    if (!a) return
    const copy: Actor = { ...a, id: uid('a'), name: a.name, x: a.x + 60, y: a.y }
    updateScene(s => { s.actors.push(copy) })
    select({ kind: 'actor', id: copy.id })
  } else if (sel.kind === 'cue') {
    const c = scene.cues.find(x => x.id === sel.id)
    if (!c) return
    const tl = buildTimeline(scene)
    const copy = { ...structuredClone(c), id: uid('c'), start: c.start + (tl.dur.get(c.id) ?? 1) } as Cue
    updateScene(s => { s.cues.push(copy); rippleAfter(s, copy.id); extendDuration(s) })
    select({ kind: 'cue', id: copy.id })
  }
}

export function patchActor(id: string, patch: Partial<Actor>, history = true) {
  updateScene(s => { const a = s.actors.find(x => x.id === id); if (a) Object.assign(a, patch) }, history)
}
export function patchCue<T extends Cue>(id: string, fn: (c: T) => void, history = true) {
  updateScene(s => { const c = s.cues.find(x => x.id === id); if (c) fn(c as T) }, history)
}
export function patchSkill(id: string, fn: (c: SkillCue) => void, history = true) { patchCue<SkillCue>(id, fn, history) }

export function moveLayer(id: string, dir: -1 | 1) {
  updateScene(s => {
    const i = s.actors.findIndex(a => a.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= s.actors.length) return
    ;[s.actors[i], s.actors[j]] = [s.actors[j], s.actors[i]]
  })
}

export const CAMERA = CAMERA_ID

// ── ฉากตัวอย่าง ──
export async function loadDemo() {
  const { replaceScene } = await import('./store')
  // ฉากตัวอย่างของเว็บ Line Ranger Kiwi (เจ้าของเว็บจัดไว้เอง — src/anme/engine/demoScene.json):
  // Darkpaw Brown (ฝ่ายเรา) ยืน → เดินเข้าหา → โจมตี → สกิล 1 → สกิล 2 ใส่ Shogun Moon (ศัตรู) · ฉาก battle05 · 9 วิ
  // แก้ฉากตัวอย่าง: จัดฉากในสตูดิโอ → เมนู "ส่งออกไฟล์ฉาก (.json)" → แทนที่ไฟล์นี้
  const { default: demo } = await import('./demoScene.json')
  const scene = structuredClone(demo) as unknown as Scene
  scene.name = L('ฉากตัวอย่าง', 'Demo scene')
  replaceScene(scene)
  // รอไฟล์อนิเมชันของเรนเจอร์โหลดครบก่อนค่อยเล่น (สูงสุด 20 วิ — เน็ตช้าก็ยังเปิดฉากได้ แค่ไม่เล่นเอง)
  const ready = await new Promise<boolean>(res => {
    const ids = scene.assets.filter(a => a.type === 'ranger').map(a => a.id)
    const timer = setTimeout(() => { off(); res(false) }, 20000)
    const check = () => { if (ids.every(id => assets.get(id))) { clearTimeout(timer); off(); res(true) } }
    const off = assets.subscribe(check); check()
  })
  select({ kind: 'none' })
  setState({ time: 0, playing: ready })
}

// ── เสียง ──
/** asset เสียงของ URL นี้ (สร้างใหม่ถ้ายังไม่มี) */
function ensureAudioAsset(d: Scene, url: string, name: string): string {
  let def = d.assets.find(x => x.type === 'audio' && x.url === url)
  if (!def) { def = { id: uid('s'), type: 'audio', name, url }; d.assets.push(def) }
  return def.id
}

/** วางเสียงลงแทร็กเสียง ณ หัวอ่าน (ทับเสียงเดิม = ต่อท้ายแล้วดันตัวหลังออกไป) */
export function addSoundCue(url: string, name: string) {
  const s = getState().scene
  const t = nextFreeTime(s, AUDIO_ID)
  let id = ''
  updateScene(d => {
    const cue = newSoundCue(t, ensureAudioAsset(d, url, name))
    d.cues.push(cue); id = cue.id
    rippleAfter(d, cue.id); extendDuration(d)
  })
  select({ kind: 'cue', id })
  // ความยาวจริงรู้หลังถอดไฟล์เสร็จ → ยืดฉากอีกรอบ
  const off = assets.subscribe(() => {
    const c = getState().scene.cues.find(x => x.id === id)
    if (!c || c.type !== 'sound') return off()
    if (assets.get(c.assetId)) { off(); updateScene(d => { rippleAfter(d, id); extendDuration(d) }, false) }
  })
}

/** ใส่เสียงประกอบให้สกิล */
export function setSkillSound(cueId: string, url: string, name: string) {
  updateScene(d => {
    const c = d.cues.find(x => x.id === cueId)
    if (!c || c.type !== 'skill') return
    c.sound = { assetId: ensureAudioAsset(d, url, name), at: c.sound?.at ?? 'release', volume: c.sound?.volume ?? 1 }
  })
}

export async function uploadAudio(files: File[]) {
  const list = files.filter(f => f.type.startsWith('audio/') || isAudioName(f.name))
  if (!list.length) { toast(L('ไม่พบไฟล์เสียง (mp3 / ogg / wav / m4a)', 'No audio files found (mp3 / ogg / wav / m4a)'), 'error'); return }
  setState({ busy: L(`กำลังอัปโหลด ${list.length} เสียง…`, `Uploading ${list.length} sound(s)…`) })
  try {
    for (const f of list) { const r = await uploadFile(f); addSoundCue(r.url, r.name) }
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error', 5000)
  } finally { setState({ busy: null }) }
}

// ── รีเซ็ต ──
export type ResetKind = 'all' | 'cues' | 'positions' | 'background'

export function resetScene(kind: ResetKind) {
  if (kind === 'all') {
    replaceScene(emptyScene(L('ฉากใหม่', 'New scene')))
  } else {
    updateScene(s => {
      if (kind === 'cues') s.cues = []
      if (kind === 'background') { s.background = defaultBackground(); s.groundY = Math.round(s.height * 0.78) }
      if (kind === 'positions') {
        const allies = s.actors.filter(a => a.tag !== 'enemy' && isRangerAsset(s, a))
        const enemies = s.actors.filter(a => a.tag === 'enemy' && isRangerAsset(s, a))
        const place = (list: Actor[], tag: ActorTag) => list.forEach((a, i) => {
          const x = tag === 'enemy' ? s.width * 0.72 + (i % 3) * 110 : s.width * 0.28 - (i % 3) * 110
          a.x = Math.round(clamp(x, 60, s.width - 60)); a.y = s.groundY + (Math.floor(i / 3) % 2) * 26
          a.scale = 1; a.flip = facingFor(tag); a.opacity = 1; a.rotation = 0
        })
        place(allies, 'ally'); place(enemies, 'enemy')
        for (const a of s.actors) if (!isRangerAsset(s, a)) { a.x = s.width / 2; a.y = s.height / 2; a.rotation = 0 }
        s.cues = s.cues.filter(c => c.type !== 'camera')
      }
    })
    if (kind === 'cues') select({ kind: 'none' })
  }
  setState({ time: 0, playing: false })
  toast(L('รีเซ็ตแล้ว', 'Reset done'), 'ok')
}
