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

function initialScene(): Scene {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return normalizeScene(JSON.parse(raw))
  } catch { /* เสีย/ไม่มี → ฉากเปล่า */ }
  return emptyScene()
}

let state: AppState = {
  scene: initialScene(), sel: { kind: 'none' }, time: 0, playing: false, loop: true, rate: 1,
  guides: true, projectName: null, dirty: false, toasts: [], busy: null,
  lang: getLang(),
  muted: ls('anme.muted') === '1',
  hoverPart: null,
  volume: Math.min(1, Math.max(0, parseFloat(ls('anme.volume') ?? '0.9') || 0.9)),
}

export function setLang(lang: Lang) {
  applyLang(lang)
  setState({ lang })
}
export function setMuted(muted: boolean) {
  try { localStorage.setItem('anme.muted', muted ? '1' : '0') } catch { /* */ }
  setState({ muted })
}
export function setVolume(volume: number) {
  try { localStorage.setItem('anme.volume', String(volume)) } catch { /* */ }
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
  state = { ...state, scene: s, sel: { kind: 'none' }, time: 0, playing: false, projectName, dirty: false }
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

export const select = (sel: Selection) => setState({ sel })
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
