import { describe, expect, it } from 'vitest'
import { frameAverageColor, isHiddenAnnotation, isUsableLink, normalizedLinkRect, regionDiffersFromBackground } from './links'

function solidRegion(rgb: [number, number, number], pixelCount: number, alpha = 255) {
  const data = new Uint8ClampedArray(pixelCount * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = alpha
  }
  return data
}

// Builds a frameWidth x frameHeight RGBA buffer where every pixel is `outer`, except the
// rectangular hole at (holeX, holeY, holeWidth, holeHeight) which is filled with `inner`.
function frameWithHole(
  frameWidth: number,
  frameHeight: number,
  outer: [number, number, number],
  holeX: number,
  holeY: number,
  holeWidth: number,
  holeHeight: number,
  inner: [number, number, number],
) {
  const data = new Uint8ClampedArray(frameWidth * frameHeight * 4)
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const i = (y * frameWidth + x) * 4
      const inHole = x >= holeX && x < holeX + holeWidth && y >= holeY && y < holeY + holeHeight
      const [r, g, b] = inHole ? inner : outer
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  return data
}

describe('normalizedLinkRect', () => {
  it('converts a viewport rect into a 0-1 fraction of the page', () => {
    expect(normalizedLinkRect([100, 50, 300, 150], 1000, 500)).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })
  })

  it('handles reversed corner coordinates', () => {
    expect(normalizedLinkRect([300, 150, 100, 50], 1000, 500)).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })
  })

  it('clamps rects that spill outside the page', () => {
    expect(normalizedLinkRect([-50, -50, 1200, 600], 1000, 500)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('rejects degenerate (zero-area) rects', () => {
    expect(normalizedLinkRect([100, 100, 100, 200], 1000, 500)).toBeNull()
  })

  it('rejects an empty page', () => {
    expect(normalizedLinkRect([0, 0, 10, 10], 0, 500)).toBeNull()
  })
})

describe('isUsableLink', () => {
  it('accepts a link with a url', () => {
    expect(isUsableLink({ url: 'https://example.com', pageIndex: null })).toBe(true)
  })

  it('accepts a link with a resolved page index', () => {
    expect(isUsableLink({ url: null, pageIndex: 3 })).toBe(true)
  })

  it('rejects a link with neither', () => {
    expect(isUsableLink({ url: null, pageIndex: null })).toBe(false)
  })
})

describe('isHiddenAnnotation', () => {
  it('treats an unflagged annotation as visible', () => {
    expect(isHiddenAnnotation(0)).toBe(false)
    expect(isHiddenAnnotation(undefined)).toBe(false)
  })

  it('flags the Hidden bit (0x02) as hidden', () => {
    expect(isHiddenAnnotation(0x02)).toBe(true)
  })

  it('flags the NoView bit (0x20) as hidden', () => {
    expect(isHiddenAnnotation(0x20)).toBe(true)
  })

  it('does not misfire on unrelated bits, e.g. Print (0x04)', () => {
    expect(isHiddenAnnotation(0x04)).toBe(false)
  })

  it('flags a combination that includes Hidden', () => {
    expect(isHiddenAnnotation(0x04 | 0x02)).toBe(true)
  })
})

describe('regionDiffersFromBackground', () => {
  const white: [number, number, number] = [255, 255, 255]

  it('reports no content when the region is a uniform match for the background', () => {
    expect(regionDiffersFromBackground(solidRegion(white, 100), white)).toBe(false)
  })

  it('tolerates minor anti-aliasing noise near the background color', () => {
    const data = solidRegion(white, 50)
    data[0] = 250; data[1] = 250; data[2] = 250 // one pixel a few shades off, within tolerance
    expect(regionDiffersFromBackground(data, white)).toBe(false)
  })

  it('detects painted content (e.g. black text) against the background', () => {
    const data = solidRegion(white, 50)
    data[40] = 10; data[41] = 10; data[42] = 10 // one dark pixel amid the background
    expect(regionDiffersFromBackground(data, white)).toBe(true)
  })

  it('ignores fully transparent pixels even if their RGB differs', () => {
    const data = solidRegion([0, 0, 0], 20, 0) // black but alpha=0
    expect(regionDiffersFromBackground(data, white)).toBe(false)
  })
})

describe('frameAverageColor', () => {
  it('averages the ring while excluding the hole entirely', () => {
    // A frame that's white everywhere except a black hole in the middle -- the hole's color
    // must not leak into the average, otherwise a decorative element (e.g. a logo) elsewhere
    // on the page could poison what should be a purely local background estimate.
    const data = frameWithHole(10, 10, [255, 255, 255], 3, 3, 4, 4, [0, 0, 0])
    expect(frameAverageColor(data, 10, 10, 3, 3, 4, 4)).toEqual([255, 255, 255])
  })

  it('reflects a non-white local background, unaffected by unrelated page content', () => {
    const data = frameWithHole(10, 10, [30, 60, 120], 3, 3, 4, 4, [255, 0, 0])
    expect(frameAverageColor(data, 10, 10, 3, 3, 4, 4)).toEqual([30, 60, 120])
  })

  it('falls back to white if the hole consumes the entire frame', () => {
    const data = frameWithHole(4, 4, [0, 0, 0], 0, 0, 4, 4, [0, 0, 0])
    expect(frameAverageColor(data, 4, 4, 0, 0, 4, 4)).toEqual([255, 255, 255])
  })
})
