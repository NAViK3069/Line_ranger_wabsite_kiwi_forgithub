'use client'

// ====================================================
// รูปจาก atlas ของเกม (plist + png) สำหรับหน้า Infinity Tower
//   โหลดแต่ละ atlas ครั้งเดียว → ตัดชิ้นตาม plist (piecesFromPlist / drawPiece ชุดเดียวกับหน้า /res)
//   → เก็บเป็น blob URL ต่อชิ้น (ชิ้นเดียวกันใช้ซ้ำได้ทั้งหน้า ไม่ตัดใหม่)
// atlas ของ lerico ไม่มีหัว CORS → โหลดผ่าน Worker (lericoProxy) แล้วทำเป็น blob ในเครื่อง (canvas ไม่ถูก taint)
// ====================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { lericoProxy, LERICO_ORIGIN } from '@/lib/staticApi'
import { localResUrl } from '@/lib/gameRes'
import { parsePlist } from '@/lib/animation/plistParser'
import { drawPiece, piecesFromPlist, type Piece } from '../res/PlistPieces'
import type { AtlasKey, TIcon } from '@/lib/infinityTower'

/** ไฟล์ของแต่ละ atlas (ไม่ใส่นามสกุล) */
const ATLAS: Record<AtlasKey, string> = {
  main: lericoProxy(`${LERICO_ORIGIN}/res/endless_main/endless_main`),
  // ตัวเลขชั้น endless_main_tower_num_00–09 + โลโก้ชื่อโหมด ml_endless_main_title_<ภาษา>
  main16: lericoProxy(`${LERICO_ORIGIN}/res/endless_main/endless_main.16`),
  mission: lericoProxy(`${LERICO_ORIGIN}/res/endless_battle_mission_icon/endless_battle_mission_icon`),
  ui: lericoProxy(`${LERICO_ORIGIN}/res/endless_battle_ui/endless_battle_ui`),
  minigacha: lericoProxy(`${LERICO_ORIGIN}/res/mini_gacha/mini_gacha_icon`),
  endlesspopup: lericoProxy(`${LERICO_ORIGIN}/res/endless_popup/endless_popup`),
  popup: localResUrl('hd/common/popup/common_popup_ui'),
  // Main Stage: ปุ่มด่าน/เลขด่านโหมดปกติ (area3-btn-*, area3-num-0N) · Hard/Extreme + ไอคอนโหมด (area-btn-hard-*, intro_mode_*)
  area3: lericoProxy(`${LERICO_ORIGIN}/res/area3_common/area3_common`),
  areahard: lericoProxy(`${LERICO_ORIGIN}/res/area_hard_mode/area_hard_mode`),
}

interface Loaded { img: HTMLImageElement; pieces: Map<string, Piece> }
const atlasCache = new Map<AtlasKey, Promise<Loaded | null>>()
const frameCache = new Map<string, Promise<string | null>>()

function loadAtlas(key: AtlasKey): Promise<Loaded | null> {
  let p = atlasCache.get(key)
  if (!p) {
    const base = ATLAS[key]
    p = (async () => {
      const [plist, png] = await Promise.all([
        fetch(`${base}.plist`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))),
        fetch(`${base}.png`).then(r => (r.ok ? r.blob() : Promise.reject(r.status))),
      ])
      const img = new Image()
      img.src = URL.createObjectURL(png)
      await img.decode()
      return { img, pieces: new Map(piecesFromPlist(parsePlist(plist)).map(pc => [pc.name, pc])) }
    })().catch(() => null)
    atlasCache.set(key, p)
  }
  return p
}

function frameUrl(atlas: AtlasKey, frame: string): Promise<string | null> {
  const k = `${atlas}/${frame}`
  let p = frameCache.get(k)
  if (!p) {
    p = loadAtlas(atlas).then(a => {
      const piece = a?.pieces.get(frame)
      if (!a || !piece) return null
      return new Promise<string | null>(res => drawPiece(a.img, piece).toBlob(b => res(b ? URL.createObjectURL(b) : null)))
    })
    frameCache.set(k, p)
  }
  return p
}

/** URL ของรูป (ชิ้นใน atlas หรือไฟล์เดี่ยว) — null ระหว่างโหลด / หาไม่เจอ */
export function useIconUrl(icon: TIcon | null | undefined): string | null {
  const direct = icon && 'url' in icon ? icon.url : null
  const atlas = icon && 'atlas' in icon ? icon.atlas : null
  const frame = icon && 'atlas' in icon ? icon.frame : null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!atlas || !frame) return
    let live = true
    frameUrl(atlas, frame).then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [atlas, frame])
  return direct ?? (atlas ? url : null)
}

/** รูปเกม — กล่องขนาดคงที่ (ไม่กระตุกตอนโหลด) · รูปถูกย่อ/ขยายให้พอดีกล่อง */
export function GameIcon({ icon, size, className = '', alt = '', fit = 'contain' }: {
  icon: TIcon | null | undefined; size?: number; className?: string; alt?: string; fit?: 'contain' | 'cover'
}) {
  const url = useIconUrl(icon)
  // โครงรอรูป (.it-skel ใน globals.css) จนกว่ารูปจะโหลดเสร็จ — แล้วรูปค่อยๆ โผล่ (ไม่เด้งขึ้นมา)
  // สลับด้วย DOM ตรงๆ ไม่ใช้ state: ไอคอนหลายพันตัวโหลดเสร็จพร้อมกัน → setState หลายพันครั้ง = React ฟ้อง
  // "Maximum update depth exceeded" · React ไม่แตะ opacity/คลาสนี้เพราะไม่อยู่ใน props ที่มันจัดการ
  const boxRef = useRef<HTMLSpanElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const reveal = () => {
    if (imgRef.current) imgRef.current.style.opacity = '1'
    boxRef.current?.classList.remove('it-skel')
  }
  useLayoutEffect(() => {
    const box = boxRef.current, img = imgRef.current
    if (!box || !icon) return
    if (img?.complete && img.naturalWidth) { reveal(); return }   // แคชไว้แล้ว — onLoad ไม่มา
    box.classList.add('it-skel')
    if (img) img.style.opacity = '0'
  }, [url, icon])
  return (
    <span ref={boxRef} className={`inline-flex items-center justify-center shrink-0 ${className}`} style={size ? { width: size, height: size } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img ref={imgRef} src={url} alt={alt} draggable={false} decoding="async"
        // ชิ้นจาก atlas = blob ในเครื่อง (รูปซ้ำกันไม่กี่สิบรูป) → โหลดเลย · รูปจากเว็บอื่น (ภาพเรนเจอร์) ค่อยโหลดเมื่อใกล้จอ
        loading={url.startsWith("blob:") ? "eager" : "lazy"}
        onLoad={reveal}
        onError={reveal}
        style={{ transition: 'opacity .25s ease-out' }}
        className={`max-w-full max-h-full ${fit === 'cover' ? 'w-full h-full object-cover' : 'object-contain'}`} />}
    </span>
  )
}
