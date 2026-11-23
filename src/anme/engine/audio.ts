// ====================================================
// audio.ts — เล่นเสียงตามไทม์ไลน์ (Web Audio ตรงเวลาระดับมิลลิวินาที) + มิกซ์เสียงออฟไลน์ตอนส่งออกวิดีโอ
// ====================================================
import { assets, audioCtx } from './assets'
import { resolveUrl } from './storage'
import type { AppState } from './store'
import type { SoundEvent, Timeline } from './timeline'

/** ต่อ 1 เสียง: source → gain (เฟด/ความดัง) → ปลายทาง · t = เวลาไทม์ไลน์ตอน when0 */
function schedule(ac: BaseAudioContext, dest: AudioNode, ev: SoundEvent, t: number, rate: number, when0: number): AudioBufferSourceNode | null {
  const rt = assets.get(ev.assetId)
  if (rt?.kind !== 'audio') return null
  const full = Math.max(0, rt.duration - ev.offset)
  const len = ev.dur != null ? Math.min(ev.dur, full) : full
  const elapsed = Math.max(0, t - ev.at)
  if (elapsed >= len) return null
  const src = ac.createBufferSource()
  src.buffer = rt.buffer
  src.playbackRate.value = rate
  const g = ac.createGain()
  const when = when0 + Math.max(0, ev.at - t) / rate
  const remain = (len - elapsed) / rate
  const vol = Math.max(0, ev.volume)
  if (ev.fadeIn > 0 && elapsed < ev.fadeIn) {
    g.gain.setValueAtTime(vol * (elapsed / ev.fadeIn), when)
    g.gain.linearRampToValueAtTime(vol, when + (ev.fadeIn - elapsed) / rate)
  } else g.gain.setValueAtTime(vol, when)
  if (ev.fadeOut > 0) {
    const fo = Math.min(ev.fadeOut, len - elapsed) / rate
    g.gain.setValueAtTime(vol, Math.max(when, when + remain - fo))
    g.gain.linearRampToValueAtTime(0, when + remain)
  }
  src.connect(g).connect(dest)
  src.start(when, ev.offset + elapsed, len - elapsed)
  return src
}

class AudioPlayer {
  private sources: AudioBufferSourceNode[] = []
  private master: GainNode | null = null
  private last: { t: number; scene: unknown; rate: number; ver: number } | null = null
  /**
   * จุดเทียบนาฬิกา (ตอนตั้งเวลาเสียงชุดล่าสุด): เสียงของเวลาไทม์ไลน์ t0 ถูกปล่อยออกที่นาฬิกาเสียง ac0
   * lat = เวลาที่เสียงเดินทางจากโปรแกรมถึงลำโพง/หูฟัง (หูฟังบลูทูธอาจถึง 0.2 วิ) — เสียงจึงถูกปล่อยก่อนภาพเท่านี้ ให้ได้ยินตรงกับภาพ
   */
  private anchor: { t0: number; ac0: number; rate: number; lat: number } | null = null

  /** เวลาแก้เสียงให้ตรงภาพครั้งล่าสุด (performance.now) — กันตั้งเวลาใหม่ถี่เกินตอนนาฬิกาเสียงยังไม่เดิน */
  private lastSync = 0

  /** เวลาไทม์ไลน์ของเสียงที่ "ได้ยินอยู่ตอนนี้" · null = ไม่มีเสียงเล่นอยู่ */
  private heardTime(): number | null {
    const a = this.anchor
    if (!a) return null
    const ac = audioCtx()
    if (ac.state !== 'running') return null
    return a.t0 + (ac.currentTime - a.lat - a.ac0) * a.rate
  }

  private stopAll() {
    for (const s of this.sources) { try { s.stop() } catch { /* หยุดไปแล้ว */ } s.disconnect() }
    this.sources = []
    this.anchor = null
  }

  /** เรียกทุกเฟรมจากลูปเล่น — เริ่ม/หยุด/ตั้งเวลาเสียงใหม่เมื่อเวลากระโดดหรือฉากเปลี่ยน */
  update(st: AppState, tl: Timeline) {
    const exporting = st.busy?.startsWith('export')
    if (!st.playing || exporting || !tl.sounds.length) {
      if (this.sources.length) this.stopAll()
      this.last = null
      this.anchor = null
      return
    }
    const ac = audioCtx()
    if (ac.state === 'suspended') ac.resume().catch(() => {})
    if (!this.master) { this.master = ac.createGain(); this.master.connect(ac.destination) }
    this.master.gain.setTargetAtTime(st.muted ? 0 : st.volume, ac.currentTime, 0.015)
    const prev = this.last
    // เวลาไม่ต่อเนื่อง (วนกลับ / กระโดด) · ฉากถูกแก้ · เปลี่ยนความเร็ว · เสียงเพิ่งโหลดเสร็จ → ตั้งเวลาใหม่หมด
    const jump = !prev || st.time < prev.t - 1e-3 || st.time - prev.t > 0.3
    // ภาพกับเสียงเดินคนละนาฬิกา (ภาพ = requestAnimationFrame · เสียง = AudioContext) — เคลื่อนห่างกันได้เมื่อ
    // เครื่องกระตุก / เลื่อนเวลาสั้นๆ / AudioContext เพิ่งตื่นจาก suspended (นาฬิกาเสียงหยุดเดินช่วงนั้น)
    // → ห่างกันเกิน DRIFT เมื่อไหร่ ตั้งเวลาเสียงใหม่จากเวลาภาพปัจจุบัน (เว้นอย่างน้อย 0.25 วิต่อครั้ง)
    // (ภาพไม่รอเสียง — ตอนเพิ่งกดเล่น เบราว์เซอร์อาจยังไม่เปิดลำโพง นาฬิกาเสียงค้างอยู่ครู่หนึ่ง ถ้าให้ภาพรอ ภาพจะค้าง)
    const heard = this.heardTime()
    const drift = heard != null && performance.now() - this.lastSync > 250 ? Math.abs(st.time - heard) : 0
    if (jump || drift > DRIFT || prev.scene !== st.scene || prev.rate !== st.rate || prev.ver !== assets.version) {
      this.stopAll()
      const now = ac.currentTime + LEAD
      const lat = Math.min(0.5, Math.max(0, ac.outputLatency || ac.baseLatency || 0))
      // เวลาไทม์ไลน์ของเสียงที่ปล่อยออกตอน now — เผื่อทั้ง LEAD และเวลาถึงหู ให้ได้ยินตรงกับภาพที่ st.time
      const t0 = st.time + (LEAD + lat) * st.rate
      for (const ev of tl.sounds) {
        const s = schedule(ac, this.master, ev, t0, st.rate, now)
        if (s) this.sources.push(s)
      }
      this.anchor = { t0, ac0: now, rate: st.rate, lat }
      this.lastSync = performance.now()
    }
    this.last = { t: st.time, scene: st.scene, rate: st.rate, ver: assets.version }
  }
}

/** เวลาเผื่อก่อนเสียงชุดใหม่เริ่มดัง (วินาที) */
const LEAD = 0.02
/** ภาพกับเสียงห่างกันเกินเท่านี้ (วินาที) → ตั้งเวลาเสียงใหม่ */
const DRIFT = 0.06

export const audioPlayer = new AudioPlayer()

/** มิกซ์เสียงทั้งหมดในช่วง [from, to] เป็น AudioBuffer (ใช้ตอนส่งออกวิดีโอ) · ไม่มีเสียง = null */
export async function renderMix(tl: Timeline, from: number, to: number, volume: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  const evs = tl.sounds.filter(ev => assets.get(ev.assetId)?.kind === 'audio' && ev.at < to)
  if (!evs.length) return null
  const len = Math.max(1, Math.ceil((to - from) * sampleRate))
  const oc = new OfflineAudioContext(2, len, sampleRate)
  const master = oc.createGain()
  master.gain.value = volume
  master.connect(oc.destination)
  let any = false
  for (const ev of evs) if (schedule(oc, master, ev, from, 1, 0)) any = true
  return any ? oc.startRendering() : null
}

/** ฟังตัวอย่างไฟล์เสียง (ในคลังสื่อ) — เรียกซ้ำไฟล์เดิม = หยุด */
let previewEl: HTMLAudioElement | null = null
export function previewSound(url: string | null): boolean {
  const same = previewEl && url && previewEl.dataset.url === url && !previewEl.paused
  previewEl?.pause()
  previewEl = null
  if (!url || same) return false
  const el = new Audio()
  el.dataset.url = url
  previewEl = el
  resolveUrl(url).then(u => { el.src = u; return el.play() }).catch(() => {})
  return true
}
