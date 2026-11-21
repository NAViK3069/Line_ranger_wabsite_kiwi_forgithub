// ====================================================
// store.ts — state กลางของแอพ (ฉาก + การเลือก + เวลา + ประวัติ undo/redo)
// ใช้ useSyncExternalStore แทนไลบรารีภายนอก
// ====================================================
import { useSyncExternalStore } from 'react'
import { assets } from './assets'
import { applyLang, getLang, type Lang } from './i18n'
import { clone, emptyScene, normalizeScene } from './scene'
import type { Cue, Scene } from './types'

export type Selection =
  | { kind: 'none' }
  | { kind: 'actor'; id: string }
  | { kind: 'cue'; id: string }
  | { kind: 'background' }
  | { kind: 'scene' }

export interface Toast { id: number; text: string; tone: 'info' | 'ok' | 'error' }

export interface AppState {
  scene: Scene
  sel: Selection
  /**
   * บล็อกที่เลือกพร้อมกันหลายอัน (Shift/Ctrl+คลิก · ลากกรอบบนไทม์ไลน์ · โหมดเลือกหลายอันบนมือถือ)
   * ว่าง = เลือกอันเดียวตาม sel · มีของ = sel ชี้อันล่าสุดในกลุ่ม (แผงขวาแสดงอันนั้น)
   */
  multi: string[]
  /** มือถือ: แตะบล็อก = เพิ่ม/เอาออกจากกลุ่มที่เลือก (ไม่มี Shift บนจอสัมผัส) */
  multiMode: boolean
  /** บล็อกที่คัดลอกไว้ (Ctrl+C) — วางด้วย Ctrl+V ณ หัวอ่าน · ไม่บันทึกลงฉาก */
  clipboard: Cue[]
  time: number
  playing: boolean
  loop: boolean
  rate: number
  guides: boolean
  projectName: string | null
  dirty: boolean
  toasts: Toast[]
  busy: string | null
  /** ชิ้นส่วนที่เมาส์ชี้อยู่ในแผงเลเยอร์ → วาดกรอบแดงบนเวที (ไม่บันทึกลงฉาก) */
  hoverPart: { actorId: string; name: string } | null
  lang: 'th' | 'en'
  /** ปิดเสียงทั้งหมด (เสียงประกอบ + เสียงวิดีโอ) */
  muted: boolean
  volume: number
}

const ls = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

const LS_KEY = 'anme.autosave.v1'

/**
 * ระดับเสียงที่ "ได้ยิน" ตอนตัดต่อ — ใช้ค่าเดียวกับปุ่มเสียงของทั้งเว็บ (SoundContext: localStorage 'sound-volume', ค่าเริ่มต้น 20%)
 * ปรับที่นี่แล้วหน้าอื่นของเว็บก็ดังเท่ากัน · ไม่มีผลกับวิดีโอที่ส่งออก (exporter มิกซ์เสียงเต็ม 100% เสมอ)
 */
const SITE_VOLUME_KEY = 'sound-volume'
const SITE_VOLUME_DEFAULT = 0.2
function initialVolume(): number {
  const v = parseFloat(ls(SITE_VOLUME_KEY) ?? '')
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : SITE_VOLUME_DEFAULT
}

function initialScene(): Scene {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return normalizeScene(JSON.parse(raw))
  } catch { /* เสีย/ไม่มี → ฉากเปล่า */ }
  return emptyScene()
}

let state: AppState = {
  scene: initialScene(), sel: { kind: 'none' }, multi: [], multiMode: false, clipboard: [], time: 0, playing: false, loop: true, rate: 1,
  guides: true, projectName: null, dirty: false, toasts: [], busy: null,
  lang: getLang(),
  muted: ls('anme.muted') === '1',
  hoverPart: null,
  volume: initialVolume(),
}

// ภาษาของเว็บ (LanguageContext) — ผูกจาก Studio.tsx ให้ปุ่ม TH/EN ในสตูดิโอเปลี่ยนภาษาของเว็บไปด้วย
// (ชื่อ/คำอธิบายสกิลแปลด้วยตัวแปลของเว็บ ถ้าภาษาไม่ตรงกัน การ์ดคำอธิบายจะออกมาคนละภาษากับสตูดิโอ)
let siteLang: ((lang: Lang) => void) | null = null
export function bindSiteLang(fn: ((lang: Lang) => void) | null) { siteLang = fn }

export function setLang(lang: Lang) {
  applyLang(lang)
  setState({ lang })
  siteLang?.(lang)
}
export function setMuted(muted: boolean) {
  try { localStorage.setItem('anme.muted', muted ? '1' : '0') } catch { /* */ }
  setState({ muted })
}
export function setVolume(volume: number) {
  try { localStorage.setItem(SITE_VOLUME_KEY, String(volume)) } catch { /* */ }
  setState({ volume })
}
const listeners = new Set<() => void>()
const past: Scene[] = []
const future: Scene[] = []
const HISTORY = 120

function emit() { listeners.forEach(l => l()) }

export function getState() { return state }
export function setState(patch: Partial<AppState>) { state = { ...state, ...patch }; emit() }

export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => sel(state))
}

let saveTimer: number | undefined
function autosave() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.scene)) } catch { /* เต็ม */ }
  }, 400)
}

/** จุดบันทึกประวัติ (เรียกก่อนเริ่มลาก) */
export function checkpoint() {
  past.push(clone(state.scene))
  if (past.length > HISTORY) past.shift()
  future.length = 0
}

/**
 * แก้ฉาก — fn แก้ draft ได้ตรงๆ (draft เป็นสำเนา)
 * history=false ใช้ระหว่างลาก (เรียก checkpoint() ครั้งเดียวตอนเริ่ม)
 */
export function updateScene(fn: (draft: Scene) => void, history = true) {
  if (history) checkpoint()
  const draft = clone(state.scene)
  fn(draft)
  state = { ...state, scene: draft, dirty: true }
  assets.sync(draft.assets)
  autosave()
  emit()
}

export function replaceScene(scene: Scene, projectName: string | null = null) {
  checkpoint()
  const s = normalizeScene(scene)
  state = { ...state, scene: s, sel: { kind: 'none' }, multi: [], multiMode: false, time: 0, playing: false, projectName, dirty: false }
  assets.sync(s.assets)
  autosave()
  emit()
}

export function undo() {
  const prev = past.pop()
  if (!prev) return
  future.push(clone(state.scene))
  state = { ...state, scene: prev, dirty: true }
  assets.sync(prev.assets); autosave(); emit()
}
export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(clone(state.scene))
  state = { ...state, scene: next, dirty: true }
  assets.sync(next.assets); autosave(); emit()
}

export const select = (sel: Selection) => setState({ sel, multi: [] })

/** บล็อกที่เลือกอยู่ทั้งหมด (กลุ่ม หรืออันเดียว) — กรองอันที่ไม่มีแล้วออก (หลัง undo/ลบ) */
export function selectedCueIds(s: AppState = state): string[] {
  const ids = s.multi.length ? s.multi : s.sel.kind === 'cue' ? [s.sel.id] : []
  return ids.filter(id => s.scene.cues.some(c => c.id === id))
}

/** เลือกบล็อกชุดนี้ (ลากกรอบ) · additive = เพิ่มเข้ากลุ่มเดิม (กด Shift ค้าง) */
export function selectCues(ids: string[], additive = false) {
  const all = additive ? [...new Set([...selectedCueIds(), ...ids])] : [...new Set(ids)]
  setState({ sel: all.length ? { kind: 'cue', id: all[all.length - 1] } : { kind: 'none' }, multi: all.length > 1 ? all : [] })
}

/** เพิ่ม/เอาออกจากกลุ่ม (Shift/Ctrl+คลิก · แตะในโหมดเลือกหลายอัน) */
export function toggleCueSelect(id: string) {
  const cur = selectedCueIds()
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
  setState({ sel: next.length ? { kind: 'cue', id: next.includes(id) ? id : next[next.length - 1] } : { kind: 'none' }, multi: next.length > 1 ? next : [] })
}
export const setTime = (time: number) => { state = { ...state, time: Math.max(0, time) }; emit() }

let toastId = 0
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3200) {
  const t = { id: ++toastId, text, tone }
  setState({ toasts: [...state.toasts, t] })
  setTimeout(() => setState({ toasts: state.toasts.filter(x => x.id !== t.id) }), ms)
}

export function selectedCue(s: AppState): Cue | null {
  return s.sel.kind === 'cue' ? s.scene.cues.find(c => c.id === (s.sel as { id: string }).id) ?? null : null
}

// โหลด asset ของฉากที่กู้มาจาก autosave
assets.sync(state.scene.assets)
