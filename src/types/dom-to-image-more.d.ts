declare module 'dom-to-image-more' {
  interface Options {
    quality?: number
    scale?: number
    bgcolor?: string
    width?: number
    height?: number
    style?: Partial<CSSStyleDeclaration>
    filter?: (node: Node) => boolean
    imagePlaceholder?: string
    cacheBust?: boolean
  }

  function toPng(node: HTMLElement, options?: Options): Promise<string>
  function toJpeg(node: HTMLElement, options?: Options): Promise<string>
  function toSvg(node: HTMLElement, options?: Options): Promise<string>
  function toBlob(node: HTMLElement, options?: Options): Promise<Blob>
  function toPixelData(node: HTMLElement, options?: Options): Promise<Uint8ClampedArray>

  export default { toPng, toJpeg, toSvg, toBlob, toPixelData }
}
