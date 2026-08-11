import { describe, expect, it } from 'vitest'
import { containRect, normalizedPointInRect } from './presenter'

describe('presenter preview geometry', () => {
  it('letterboxes a slide without changing its aspect ratio', () => {
    expect(containRect(1600, 900, 1000, 1000)).toEqual({ x: 0, y: 218.75, width: 1000, height: 562.5 })
  })

  it('maps controller input into normalized slide coordinates', () => {
    const content = { x: 0, y: 100, width: 1000, height: 600 }
    const bounds = { left: 50, top: 20, width: 1000, height: 800 }
    expect(normalizedPointInRect(550, 420, bounds, content)).toEqual({ x: .5, y: .5 })
    expect(normalizedPointInRect(550, 40, bounds, content)).toBeNull()
  })
})
