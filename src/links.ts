export type NormalizedRect = { x: number; y: number; width: number; height: number }
export type PageLink = { rect: NormalizedRect; url: string | null; pageIndex: number | null }

export function normalizedLinkRect(viewportRect: number[], pageWidth: number, pageHeight: number): NormalizedRect | null {
  if (pageWidth <= 0 || pageHeight <= 0) return null
  const [x1, y1, x2, y2] = viewportRect
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  if (width <= 0 || height <= 0) return null
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    x: clamp(left / pageWidth),
    y: clamp(top / pageHeight),
    width: clamp(width / pageWidth),
    height: clamp(height / pageHeight),
  }
}

export function isUsableLink(link: Pick<PageLink, 'url' | 'pageIndex'>) {
  return link.url !== null || link.pageIndex !== null
}

// PDF annotation /F flags (ISO 32000-1 Table 165). An annotation flagged Hidden or NoView
// exists on the page but must not be shown/interactable — pdf.js returns it regardless.
const ANNOTATION_FLAG_HIDDEN = 0x02
const ANNOTATION_FLAG_NOVIEW = 0x20

export function isHiddenAnnotation(annotationFlags: number | undefined) {
  return Boolean(annotationFlags && annotationFlags & (ANNOTATION_FLAG_HIDDEN | ANNOTATION_FLAG_NOVIEW))
}

export type RgbColor = readonly [number, number, number]

// True if any (non-transparent) pixel in `pixels` (RGBA bytes, as from ImageData.data) deviates
// from `background` by more than `tolerance` on any channel — i.e. something was actually painted
// there, as opposed to the region being untouched page background.
export function regionDiffersFromBackground(pixels: ArrayLike<number>, background: RgbColor, tolerance = 12): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue
    if (
      Math.abs(pixels[i] - background[0]) > tolerance
      || Math.abs(pixels[i + 1] - background[1]) > tolerance
      || Math.abs(pixels[i + 2] - background[2]) > tolerance
    ) {
      return true
    }
  }
  return false
}

// Average color of a `frameWidth`x`frameHeight` RGBA buffer, excluding the rectangular "hole" at
// (holeX, holeY, holeWidth, holeHeight) — i.e. the color of the ring immediately surrounding a
// region, without the region itself. Used as a *local* background estimate for a link's rect,
// since a single global sample (e.g. a page corner) is easily contaminated by a logo, banner, or
// footer graphic that real slide templates commonly place exactly there.
export function frameAverageColor(
  pixels: ArrayLike<number>,
  frameWidth: number,
  frameHeight: number,
  holeX: number,
  holeY: number,
  holeWidth: number,
  holeHeight: number,
): RgbColor {
  let r = 0, g = 0, b = 0, count = 0
  for (let y = 0; y < frameHeight; y++) {
    const inHoleRow = y >= holeY && y < holeY + holeHeight
    for (let x = 0; x < frameWidth; x++) {
      if (inHoleRow && x >= holeX && x < holeX + holeWidth) continue
      const i = (y * frameWidth + x) * 4
      if (pixels[i + 3] === 0) continue
      r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]
      count++
    }
  }
  if (count === 0) return [255, 255, 255]
  return [r / count, g / count, b / count]
}
