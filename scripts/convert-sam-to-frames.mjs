// ====================================================
// convert-sam-to-frames.mjs — One-shot SAM/plist → frames.json
// ใช้ pattern เดียวกับ ChestCanvas (pre-compile transforms ครั้งเดียว)
// รัน: node scripts/convert-sam-to-frames.mjs <inputDir> <samFile>
//   ตัวอย่าง: node scripts/convert-sam-to-frames.mjs public/gacha/animation/ruby fx25-ruby
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'

// ─── SAM constants ──────────────────────────────────
const FF_REMOVES    = 0x01
const FF_ADDS       = 0x02
const FF_MOVES      = 0x04
const FF_FRAME_NAME = 0x08
const MF_ROTATE     = 0x4000
const MF_COLOR      = 0x2000
const MF_MATRIX     = 0x1000
const MF_LONGCOORDS = 0x0800
const TWIPS = 20
const Q16 = 65536

// ─── SAM parser ─────────────────────────────────────
function parseSAM(buffer) {
  const view = new DataView(buffer)
  let pos = 0

  const u8  = () => { const v = view.getUint8(pos);          pos += 1; return v }
  const u16 = () => { const v = view.getUint16(pos, true);   pos += 2; return v }
  const i16 = () => { const v = view.getInt16(pos, true);    pos += 2; return v }
  const i32 = () => { const v = view.getInt32(pos, true);    pos += 4; return v }
  const str = () => {
    const L = u16()
    const bytes = new Uint8Array(buffer, pos, L)
    pos += L
    return new TextDecoder('ascii').decode(bytes)
  }

  const magic = i32()
  if (magic !== 0x2E53414D) throw new Error('Bad SAM magic')
  if (i32() !== 1) throw new Error('Unsupported SAM version')

  const animRate = u8()
  i32(); i32()                      // origin x, y (skip)
  i32() / TWIPS                     // canvas w (skip but read)
  i32() / TWIPS                     // canvas h (skip but read)

  // Images
  const nImages = i16()
  const images = []
  for (let i = 0; i < nImages; i++) {
    const name = str()
    const w = i16()
    const h = i16()
    const m00 = i32() / (Q16 * TWIPS)
    const m01 = i32() / (Q16 * TWIPS)
    const m10 = i32() / (Q16 * TWIPS)
    const m11 = i32() / (Q16 * TWIPS)
    const m02 = i16() / TWIPS
    const m12 = i16() / TWIPS
    images.push({ name, w, h, m: [m00, m01, m10, m11, m02, m12] })
  }

  // Frames
  const nFrames = i16()
  const frames = []
  const objects = new Map()
  const depthMemory = new Map()

  for (let fi = 0; fi < nFrames; fi++) {
    const flags = u8()

    if (flags & FF_REMOVES) {
      const n = u8()
      for (let j = 0; j < n; j++) {
        const id = i16()
        const ex = objects.get(id)
        if (ex) depthMemory.set(id, ex)
        objects.delete(id)
      }
    }

    if (flags & FF_ADDS) {
      const n = u8()
      for (let j = 0; j < n; j++) {
        const objNum = i16() & 0x07FF
        const resNum = u8()
        const remembered = depthMemory.get(objNum)
        if (remembered) {
          objects.set(objNum, {
            res: resNum,
            m: [...remembered.m],
            color: [...remembered.color],
            moved: true,
          })
        } else {
          objects.set(objNum, {
            res: resNum, m: [1, 0, 0, 1, 0, 0],
            color: [255, 255, 255, 255], moved: false,
          })
        }
      }
    }

    if (flags & FF_MOVES) {
      const n = u8()
      for (let j = 0; j < n; j++) {
        const foan = u16()
        const objNum = foan & 0x07FF
        const moveFlags = foan & 0xF800

        let obj = objects.get(objNum)
        if (!obj) {
          obj = { res: 0, m: [1, 0, 0, 1, 0, 0], color: [255, 255, 255, 255], moved: false }
          objects.set(objNum, obj)
        }
        obj.moved = true

        let m00 = 1, m01 = 0, m10 = 0, m11 = 1
        if (moveFlags & MF_MATRIX) {
          m00 = i32() / Q16
          m01 = i32() / Q16
          m10 = i32() / Q16
          m11 = i32() / Q16
        } else if (moveFlags & MF_ROTATE) {
          const rot = i16() / 1000
          const c = Math.cos(rot), s = Math.sin(rot)
          m00 = c; m01 = -s; m10 = s; m11 = c
        }

        let m02, m12
        if (moveFlags & MF_LONGCOORDS) {
          m02 = i32() / TWIPS; m12 = i32() / TWIPS
        } else {
          m02 = i16() / TWIPS; m12 = i16() / TWIPS
        }
        obj.m = [m00, m01, m10, m11, m02, m12]

        if (moveFlags & MF_COLOR) {
          obj.color = [u8(), u8(), u8(), u8()]
        }

        depthMemory.set(objNum, {
          res: obj.res, m: [...obj.m],
          color: [...obj.color], moved: true,
        })
      }
    }

    if (flags & FF_FRAME_NAME) str()  // skip frame name

    const snap = []
    const keys = Array.from(objects.keys()).sort((a, b) => a - b)
    for (const objNum of keys) {
      const o = objects.get(objNum)
      if (!o.moved) continue
      snap.push({ objNum, res: o.res, m: [...o.m], color: [...o.color] })
    }
    frames.push(snap)
  }

  return { animRate, images, frames }
}

// ─── plist atlas parser ─────────────────────────────
function parsePlist(xml) {
  const rectRe = /\{\{(-?\d+)\s*,\s*(-?\d+)\}\s*,\s*\{(-?\d+)\s*,\s*(-?\d+)\}\}/
  const frameRe = /<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g

  const map = new Map()
  let m
  while ((m = frameRe.exec(xml)) !== null) {
    const name = m[1]
    const inner = m[2]
    const rectStr = /<key>textureRect<\/key>\s*<string>([^<]+)<\/string>/.exec(inner)
    if (!rectStr) continue
    const r = rectRe.exec(rectStr[1])
    if (!r) continue
    map.set(name, { x: +r[1], y: +r[2], w: +r[3], h: +r[4] })
  }
  return map
}

// ─── Main: convert → frames.json ────────────────────
async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node convert-sam-to-frames.mjs <inputDir> <baseName>')
    console.error('  ตัวอย่าง: node scripts/convert-sam-to-frames.mjs public/gacha/animation/ruby fx25-ruby')
    process.exit(1)
  }

  const [inputDir, baseName] = args
  const samPath   = path.join(inputDir, `${baseName}.sam`)
  const plistPath = path.join(inputDir, `${baseName}.plist`)
  const outPath   = path.join(inputDir, 'frames.json')

  console.log(`📂 Reading ${samPath}`)
  const samBuf = await fs.readFile(samPath)
  const sam = parseSAM(samBuf.buffer.slice(samBuf.byteOffset, samBuf.byteOffset + samBuf.byteLength))

  console.log(`📂 Reading ${plistPath}`)
  const plist = parsePlist(await fs.readFile(plistPath, 'utf8'))

  // Build sprites array — unique atlas regions
  const sprites = []
  const spriteIdxByName = new Map()
  for (const img of sam.images) {
    const a = plist.get(img.name)
    if (!a) continue
    if (!spriteIdxByName.has(img.name)) {
      spriteIdxByName.set(img.name, sprites.length)
      sprites.push([a.x, a.y, a.w, a.h])
    }
  }

  // Build frames — pre-compute world center + combined matrix
  const outFrames = []
  for (const objs of sam.frames) {
    const out = []
    for (const obj of objs) {
      const alpha = obj.color[3]
      if (alpha === 0) continue
      if (obj.res >= sam.images.length) continue
      const img = sam.images[obj.res]
      const a = plist.get(img.name)
      if (!a) continue
      const si = spriteIdxByName.get(img.name)

      const [m00, m01, m10, m11, m02, m12] = obj.m
      const [i00, i01, i10, i11, i02, i12] = img.m

      // World center (sprite center after both matrices)
      const cx = a.w * 0.5, cy = a.h * 0.5
      const px = i00 * cx + i01 * cy + i02
      const py = i10 * cx + i11 * cy + i12
      const wx = m00 * px + m01 * py + m02
      const wy = m10 * px + m11 * py + m12

      // Combined linear matrix (m × i_linear)
      const f00 = m00 * i00 + m01 * i10
      const f01 = m00 * i01 + m01 * i11
      const f10 = m10 * i00 + m11 * i10
      const f11 = m10 * i01 + m11 * i11

      // Canvas setTransform convention: a, b, c, d (column-major)
      // a = f00, b = f10, c = f01, d = f11
      out.push([
        si,
        +f00.toFixed(5), +f10.toFixed(5), +f01.toFixed(5), +f11.toFixed(5),
        +wx.toFixed(2), +wy.toFixed(2),
        alpha,
      ])
    }
    outFrames.push(out)
  }

  const output = {
    animRate: sam.animRate,
    sprites,
    frames: outFrames,
  }

  await fs.writeFile(outPath, JSON.stringify(output))
  const stats = await fs.stat(outPath)
  console.log(`✅ ${outPath}`)
  console.log(`   ${outFrames.length} frames, ${sprites.length} sprites, ${sam.animRate} FPS, ${(stats.size / 1024).toFixed(1)} KB`)
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
