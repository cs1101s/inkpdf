import { describe, expect, it } from 'vitest'
import { adjacentPageIndex, detectSlideNumber, fullscreenPageWidth, isContinuationSlide } from './viewer'

describe('slide navigation', () => {
  it('moves one page and stops at document boundaries', () => {
    expect(adjacentPageIndex(2, 1, 5)).toBe(3)
    expect(adjacentPageIndex(4, 1, 5)).toBe(4)
    expect(adjacentPageIndex(0, -1, 5)).toBe(0)
  })
})

describe('fullscreen render sizing', () => {
  it('fits landscape pages to the available screen', () => {
    expect(fullscreenPageWidth(16 / 9, 1920, 1080)).toBeCloseTo(1843.2)
  })

  it('fits portrait pages by screen height', () => {
    expect(fullscreenPageWidth(0.75, 1920, 1080)).toBeCloseTo(777.6)
  })
})

describe('continuation slide detection', () => {
  it('finds a numeric slide label in the bottom portion of a page', () => {
    expect(detectSlideNumber([
      { text: 'Lecture title', x: 20, y: 500 },
      { text: '7', x: 700, y: 18 },
    ], 540)).toBe('7')
  })

  it('supports current/total footer formats and ignores four-digit years', () => {
    expect(detectSlideNumber([
      { text: '2026', x: 20, y: 18 },
      { text: '12 / 40', x: 700, y: 18 },
    ], 540)).toBe('12')
  })

  it('only marks adjacent pages with the same detected number as continuations', () => {
    expect(isContinuationSlide('8', '8')).toBe(true)
    expect(isContinuationSlide('8', '9')).toBe(false)
    expect(isContinuationSlide(null, null)).toBe(false)
  })
})
