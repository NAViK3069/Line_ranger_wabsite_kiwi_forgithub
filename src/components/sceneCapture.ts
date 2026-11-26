// ====================================================
// sceneCapture.ts — ดาวน์โหลดภาพ/วิดีโอจาก ScenePlayer "ให้เหมือนที่เห็นบนจอ"
//   ฉาก (canvas) + ชั้นวาดบน canvas (canvasLayers) + ชั้นซ้อน HTML (การ์ด ตัวเลข ป้าย) รวมเป็นภาพเดียว
//
//   ชั้นซ้อนเป็น HTML → แปลงเป็นภาพด้วย SVG <foreignObject> (ไม่ใช้ไลบรารีเพิ่ม):
//     • CSS ของหน้า (ไฟล์ของเว็บเอง) + ฟอนต์ (LineBold, Material Icons) ฝังเป็น data URL ครั้งเดียวแล้วใช้ซ้ำ
//     • <img> → data URL (แคชตาม URL) · <canvas> (สไปรต์จากไฟล์เกม) → <img> ของภาพ ณ เฟรมนั้น
//     • HTML เหมือนเฟรมก่อน → ใช้ภาพเดิม (ช่วงการ์ดค้างนิ่งไม่ต้องแปลงใหม่ — เร็วขึ้นมาก)
//   วิดีโอ: ทีละเฟรม (WebCodecs + mp4-muxer เหมือน exporter ของสตูดิโอ) — ได้ทุกเฟรมตรงเป๊ะไม่ขึ้นกับความเร็วเครื่อง
//     ช่วงเร่งภาพ (rateAt) คิดเวลาวิดีโอตามที่ผู้ชมเห็น · เสียงเริ่มตรงจังหวะภาพ (renderMixMapped)
// ====================================================
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { assets } from '@/anme/engine/assets'
import { renderMixMapped } from '@/anme/engine/audio'
import { encodeAudio, pickCodec } from '@/anme/engine/exporter'
import { renderScene } from '@/anme/engine/render'
import { actorPos, type Timeline } from '@/anme/engine/timeline'
import type { Scene } from '@/anme/engine/types'
import type { CanvasFxCtx, CanvasLayers } from './ScenePlayer'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

// ── ทรัพยากร → data URL ──
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader()
  fr.onload = () => res(String(fr.result))
  fr.onerror = () => rej(fr.error)
  fr.readAsDataURL(b)
})
const urlCache = new Map<string, Promise<string>>()
/** โหลดไม่ได้ = รูปใสแทน (ภาพที่เหลือยังออกได้) */
function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return Promise.resolve(url)
  let p = urlCache.get(url)
  if (!p) {
    p = fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() }).then(blobToDataUrl)
      .catch(() => 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
    urlCache.set(url, p)
  }
  return p
}

/** แทน url(...) ใน CSS ด้วย data URL (ฟอนต์) */
async function inlineCssUrls(css: string, base: string): Promise<string> {
  const urls = new Set<string>()
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_m, _q, u: string) => { if (!u.startsWith('data:')) urls.add(u); return '' })
  const map = new Map<string, string>()
  await Promise.all([...urls].map(async u => { map.set(u, await toDataUrl(new URL(u, base).href)) }))
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, u: string) => (map.has(u) ? `url("${map.get(u)}")` : m))
}

let cssPromise: Promise<string> | null = null
/** CSS ทั้งหน้า (เฉพาะไฟล์ของเว็บ — อ่าน cssRules ได้) + ฟอนต์ไอคอนจาก Google (ดึงข้อความเอง) — ทำครั้งเดียว */
function pageCss(): Promise<string> {
  cssPromise ??= (async () => {
    const parts: string[] = []
    for (const sh of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try { rules = sh.cssRules } catch { continue }   // ไฟล์โดเมนอื่น (Google Fonts) — ดึงแยกด้านล่าง
      const text = Array.from(rules).map(r => r.cssText).join('\n')
      parts.push(await inlineCssUrls(text, sh.href ?? location.href))
    }
    for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
      if (!/fonts\.googleapis\.com/.test(link.href)) continue
      try { parts.push(await inlineCssUrls(await fetch(link.href).then(r => r.text()), link.href)) } catch { /* ไม่มีไอคอนก็ยังออกภาพได้ */ }
    }
    return parts.join('\n')
  })()
  cssPromise.catch(() => { cssPromise = null })
  return cssPromise
}

const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** ตัวแปลงชั้นซ้อน HTML → ภาพ (จำเฟรมก่อนไว้ — HTML เดิมไม่แปลงซ้ำ) */
export function createOverlayRasterizer(W: number, H: number) {
  let lastHtml = ''
  let lastImg: HTMLImageElement | null = null
  return async (root: HTMLElement): Promise<HTMLImageElement | null> => {
    const css = await pageCss()
    const clone = root.cloneNode(true) as HTMLElement
    clone.style.transform = 'none'
    // canvas (สไปรต์) → รูป ณ เฟรมนี้
    const srcCv = root.querySelectorAll('canvas'), dstCv = clone.querySelectorAll('canvas')
    dstCv.forEach((c, i) => {
      const img = document.createElement('img')
      for (const a of Array.from(c.attributes)) if (a.name !== 'width' && a.name !== 'height') img.setAttribute(a.name, a.value)
      if (!c.style.width) img.style.width = `${c.width}px`
      if (!c.style.height) img.style.height = `${c.height}px`
      try { img.src = srcCv[i].toDataURL() } catch { img.removeAttribute('src') }
      c.replaceWith(img)
    })
    // <img> → data URL
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(async img => {
      const src = img.getAttribute('src')
      img.removeAttribute('srcset'); img.removeAttribute('crossorigin'); img.removeAttribute('loading')
      if (src && !src.startsWith('data:')) img.setAttribute('src', await toDataUrl(new URL(src, location.href).href))
    }))
    const html = new XMLSerializer().serializeToString(clone)
    if (html === lastHtml && lastImg) return lastImg
    const cs = getComputedStyle(root)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:${cs.fontFamily.replace(/"/g, "'")};color:${cs.color};line-height:${cs.lineHeight}">`
      + `<style>${xmlText(css)}</style>${html}</div></foreignObject></svg>`
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    try { await img.decode() } catch { return lastImg }
    lastHtml = html
    lastImg = img
    return img
  }
}

export interface CaptureSource {
  scene: Scene
  tl: Timeline
  layers?: CanvasLayers
  rateAt?: (t: number) => number
  /** ความยาวฉาก (วินาทีของฉาก) */
  end: number
  /** ให้ ScenePlayer วาดชั้นซ้อน ณ เวลา t ในชั้นที่ซ่อนไว้ แล้วคืน element (null = ไม่มีชั้นซ้อน) */
  overlayAt: (t: number) => Promise<HTMLElement | null>
}

/** วาดฉาก + ชั้น canvas ณ เวลา t (k = สเกลจากพิกเซลเวทีเป็นพิกเซลภาพ) */
async function paintScene(ctx: CanvasRenderingContext2D, src: CaptureSource, t: number, k: number) {
  const { scene, tl, layers: L } = src
  const fx: CanvasFxCtx = {
    t, scene, tl,
    actorAt: id => { const a = scene.actors.find(x => x.id === id); return a ? actorPos(scene, a, t) : null },
    hitsOf: id => tl.hits.filter(h => h.cue.id === id).map(h => h.at),
  }
  const paint = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    renderScene(ctx, scene, t, {
      playing: false, timeline: tl, forceMute: true,
      beforeActors: L?.under ? c2 => L.under!(c2, fx) : undefined,
      afterActors: L?.over ? c2 => L.over!(c2, fx) : undefined,
    })
  }
  paint()
  if (await assets.settleVideos()) paint()
}

async function paintFrame(ctx: CanvasRenderingContext2D, src: CaptureSource, t: number, k: number, raster: ReturnType<typeof createOverlayRasterizer>) {
  await paintScene(ctx, src, t, k)
  const el = await src.overlayAt(t)
  if (!el) return
  const img = await raster(el)
  if (!img) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height)
}

/** ภาพนิ่ง PNG ณ เวลา t (ขนาดเวที × scale) */
export async function capturePng(src: CaptureSource, t: number, scale = 1): Promise<Blob> {
  const cv = document.createElement('canvas')
  cv.width = Math.round(src.scene.width * scale)
  cv.height = Math.round(src.scene.height * scale)
  await paintFrame(cv.getContext('2d')!, src, t, scale, createOverlayRasterizer(src.scene.width, src.scene.height))
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
}

/** ตารางเวลาฉาก ↔ เวลาวิดีโอ (คิดช่วงเร่งภาพ rateAt) */
function timeMap(end: number, rateAt?: (t: number) => number) {
  const step = 1 / 600
  const sceneT: number[] = [0], wallT: number[] = [0]
  let t = 0, w = 0
  while (t < end) {
    const r = Math.max(0.05, rateAt?.(t) ?? 1)
    const d = Math.min(step, end - t)
    t += d; w += d / r
    sceneT.push(t); wallT.push(w)
  }
  const lerp = (xs: number[], ys: number[], x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
    let lo = 0, hi = xs.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m }
    const k = (x - xs[lo]) / (xs[hi] - xs[lo] || 1)
    return ys[lo] + (ys[hi] - ys[lo]) * k
  }
  return { wallLen: w, wallOf: (s: number) => lerp(sceneT, wallT, s), sceneOf: (v: number) => lerp(wallT, sceneT, v) }
}

export const canExportVideo = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'

/** วิดีโอ MP4 ทั้งคลิป (มีเสียง) · onProgress 0–1 · signal.cancel = หยุด (คืน null) */
export async function captureVideo(src: CaptureSource, o: { fps: number; scale: number; bitrate: number },
  onProgress: (k: number) => void, signal: { cancel: boolean }): Promise<Blob | null> {
  const { scene, tl } = src
  const W = even(scene.width * o.scale), H = even(scene.height * o.scale)
  const codec = await pickCodec(W, H, o.fps, o.bitrate)
  if (!codec) throw new Error('VideoEncoder not supported')
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  const k = W / scene.width
  const raster = createOverlayRasterizer(scene.width, scene.height)
  const map = timeMap(src.end, src.rateAt)

  const SR = 48000
  const mix = await renderMixMapped(tl, src.end, map.wallOf, map.wallLen, 1, SR)
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

  const n = Math.max(1, Math.ceil(map.wallLen * o.fps))
  const us = 1e6 / o.fps
  for (let i = 0; i < n; i++) {
    if (signal.cancel || failure) break
    await paintFrame(ctx, src, map.sceneOf(i / o.fps), k, raster)
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * us), duration: Math.round(us) })
    enc.encode(frame, { keyFrame: i % (o.fps * 2) === 0 })
    frame.close()
    while (enc.encodeQueueSize > 6) await sleep(1)
    if (i % 3 === 0) { onProgress(i / n); await sleep(0) }
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
