declare module 'gifenc' {
  // gifenc's quantize returns an array of color tuples ([r,g,b] or [r,g,b,a])
  export type Palette = number[][]
  export type GifFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: {
      palette?: Palette
      first?: boolean
      transparent?: boolean
      transparentIndex?: number
      delay?: number
      repeat?: number
      dispose?: number
      colorDepth?: number
    }): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: GifFormat
      oneBitAlpha?: boolean | number
      clearAlpha?: boolean
      clearAlphaColor?: number
      clearAlphaThreshold?: number
    }
  ): Palette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: GifFormat
  ): Uint8Array
}
