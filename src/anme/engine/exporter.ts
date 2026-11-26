// ====================================================
// exporter.ts — ส่งออกวิดีโอ MP4 แบบ "ทีละเฟรม" (WebCodecs + mp4-muxer) และภาพนิ่ง PNG
//
// ทำไมไม่อัดหน้าจอแบบเวลาจริง: ถ้าเครื่องช้า/แท็บถูกพัก เฟรมจะตกและคลิปกระตุก
// วิธีนี้วาดเฟรมที่ t = from + i/fps ทีละเฟรมแล้วเข้ารหัส → ได้ทุกเฟรมตรงเป๊ะเสมอ ไม่ขึ้นกับความเร็วเครื่อง
// เบราว์เซอร์ที่ไม่มี WebCodecs → ถอยไปใช้ MediaRecorder (อัดตามเวลาจริง)
// ====================================================
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { assets } from './assets'
import { renderMix } from './audio'
import { renderScene } from './render'
import { buildTimeline, type Timeline } from './timeline'
import type { Scene } from './types'

export interface ExportOptions { scale: number; fps: number; from: number; to: number; bitrate: number; audio?: boolean }

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** วาดเฟรม ณ เวลา t แล้วรอวิดีโอในฉาก seek ให้เสร็จก่อน (ภาพวิดีโอจะตรงเวลา) */
async function drawAt(ctx: CanvasRenderingContext2D, scene: Scene, tl: Timeline, t: number, k: number) {
  const paint = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    renderScene(ctx, scene, t, { playing: false, timeline: tl, forceMute: true })
  }
  paint()
  if (await assets.settleVideos()) paint()
}

export async function pickCodec(w: number, h: number, fps: number, bitrate: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null
  for (const codec of ['avc1.640034', 'avc1.64002a', 'avc1.4d0034', 'avc1.42003e', 'avc1.42001f']) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps })
      if (r.supported) return codec
    } catch { /* ลองตัวถัดไป */ }
  }
  return null
}

export async function exportVideo(scene: Scene, o: ExportOptions, onProgress: (k: number) => void, signal: { cancel: boolean }): Promise<Blob | null> {
  const W = even(scene.width * o.scale), H = even(scene.height * o.scale)
  const codec = await pickCodec(W, H, o.fps, o.bitrate)
  if (!codec) return exportRealtime(scene, o, onProgress, signal)

  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: false })!
  const k = W / scene.width
  const tl = buildTimeline(scene)

  // เสียง: มิกซ์ทั้งหมดแบบออฟไลน์ แล้วเข้ารหัส AAC ใส่แทร็กเดียวกับวิดีโอ
  const SR = 48000
  // ส่งออกที่ความดังเต็ม — หลอดเสียง/ปุ่มปิดเสียงบนไทม์ไลน์มีผลแค่ตอนฟังระหว่างตัดต่อ
  const mix = o.audio ? await renderMix(tl, o.from, o.to, 1, SR) : null
  const aacOk = !!mix && typeof AudioEncoder !== 'undefined'
    && (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 }).catch(() => ({ supported: false }))).supported

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target, video: { codec: 'avc', width: W, height: H, frameRate: o.fps },
    ...(aacOk ? { audio: { codec: 'aac' as const, sampleRate: SR, numberOfChannels: 2 } } : {}),
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  })
  let failure: unknown = null
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e } })
  enc.configure({ codec, width: W, height: H, bitrate: o.bitrate, framerate: o.fps, latencyMode: 'quality', avc: { format: 'avc' } })

  const n = Math.max(1, Math.ceil((o.to - o.from) * o.fps))
  const us = 1e6 / o.fps
  for (let i = 0; i < n; i++) {
    if (signal.cancel || failure) break
    await drawAt(ctx, scene, tl, o.from + i / o.fps, k)
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * us), duration: Math.round(us) })
    enc.encode(frame, { keyFrame: i % (o.fps * 2) === 0 })
    frame.close()
    while (enc.encodeQueueSize > 6) await sleep(1)
    if (i % 4 === 0) { onProgress(i / n); await sleep(0) }
  }
  if (failure) { enc.close(); throw failure }
  if (signal.cancel) { enc.close(); return null }
  await enc.flush()
  enc.close()
  if (aacOk && mix) await encodeAudio(mix, muxer)
  muxer.finalize()
  onProgress(1)
  return new Blob([target.buffer], { type: 'video/mp4' })
}

export const videoExt = () => (typeof VideoEncoder !== 'undefined' ? 'mp4' : realtimeMime().ext)

// ── สำรอง: อัดตามเวลาจริงด้วย MediaRecorder ──
function realtimeMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === 'undefined') return { mime: '', ext: 'webm' }
  const list = [{ mime: 'video/mp4', ext: 'mp4' }, { mime: 'video/webm;codecs=vp9', ext: 'webm' }, { mime: 'video/webm', ext: 'webm' }]
  return list.find(x => MediaRecorder.isTypeSupported(x.mime)) ?? { mime: '', ext: 'webm' }
}

async function exportRealtime(scene: Scene, o: ExportOptions, onProgress: (k: number) => void, signal: { cancel: boolean }): Promise<Blob | null> {
  const cv = document.createElement('canvas')
  cv.width = even(scene.width * o.scale); cv.height = even(scene.height * o.scale)
  const ctx = cv.getContext('2d')!
  const k = cv.width / scene.width
  const tl = buildTimeline(scene)
  const { mime } = realtimeMime()
  const stream = cv.captureStream(o.fps)
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: o.bitrate })
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise<void>(res => { rec.onstop = () => res() })
  const draw = (t: number) => {
    ctx.setTransform(k, 0, 0, k, 0, 0)
    renderScene(ctx, scene, t, { playing: true, timeline: tl, forceMute: true })
  }
  draw(o.from)
  await sleep(250)
  rec.start(250)
  const t0 = performance.now()
  const len = o.to - o.from
  while (true) {
    const t = o.from + (performance.now() - t0) / 1000
    if (signal.cancel || t >= o.to) { draw(Math.min(t, o.to)); break }
    draw(t)
    onProgress((t - o.from) / len)
    await sleep(1000 / o.fps / 2)
  }
  rec.stop()
  await done
  stream.getTracks().forEach(t => t.stop())
  if (signal.cancel) return null
  return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] })
}

export async function exportPng(scene: Scene, t: number, scale = 1): Promise<Blob> {
  const cv = document.createElement('canvas')
  cv.width = Math.round(scene.width * scale)
  cv.height = Math.round(scene.height * scale)
  const ctx = cv.getContext('2d')!
  await drawAt(ctx, scene, buildTimeline(scene), t, scale)
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('สร้างภาพไม่ได้'))), 'image/png'))
}

/** เข้ารหัส AudioBuffer เป็น AAC แล้วส่งเข้า muxer */
export async function encodeAudio(buf: AudioBuffer, muxer: Muxer<ArrayBufferTarget>) {
  let failure: unknown = null
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e } })
  enc.configure({ codec: 'mp4a.40.2', sampleRate: buf.sampleRate, numberOfChannels: 2, bitrate: 192000 })
  const L0 = buf.getChannelData(0)
  const R0 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L0
  const N = 1024 * 8
  for (let i = 0; i < buf.length && !failure; i += N) {
    const n = Math.min(N, buf.length - i)
    const data = new Float32Array(n * 2)
    data.set(L0.subarray(i, i + n), 0)
    data.set(R0.subarray(i, i + n), n)
    const ad = new AudioData({ format: 'f32-planar', sampleRate: buf.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / buf.sampleRate) * 1e6), data })
    enc.encode(ad)
    ad.close()
    while (enc.encodeQueueSize > 8) await sleep(1)
  }
  await enc.flush()
  enc.close()
  if (failure) throw failure
}
