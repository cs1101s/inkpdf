import { describe, expect, it } from 'vitest'
import { applyStrokeStyle, canvasPoint, eraseTouchedStrokes, scaleAnnotations, strokeMidpoint, strokeTouchesPoint, textLines, type CanvasAnnotation, type Stroke } from './annotation'

describe('annotation coordinates', () => {
  it('maps pointer positions to a high-DPI canvas', () => {
    const point = canvasPoint(260, 170, { left: 10, top: 20, width: 500, height: 300 }, 1000, 600)
    expect(point).toEqual({ x: 500, y: 300 })
  })
})

describe('stroke smoothing', () => {
  it('calculates the midpoint used by quadratic freehand curves', () => {
    expect(strokeMidpoint({ x: 10, y: 20 }, { x: 30, y: 50 })).toEqual({ x: 20, y: 35 })
  })
})

describe('text annotations', () => {
  it('normalizes pasted multiline text', () => {
    expect(textLines('First\r\nSecond\rThird')).toEqual(['First', 'Second', 'Third'])
  })
})

describe('continuation slide annotations', () => {
  it('scales cloned pen and text annotations to the target canvas', () => {
    const annotations: CanvasAnnotation[] = [
      { tool: 'pen', color: 'red', width: 4, points: [{ x: 10, y: 20 }] },
      { text: 'Note', color: 'blue', fontSize: 12, point: { x: 30, y: 40 } },
    ]
    expect(scaleAnnotations(annotations, 2, 2)).toEqual([
      { tool: 'pen', color: 'red', width: 8, points: [{ x: 20, y: 40 }] },
      { text: 'Note', color: 'blue', fontSize: 24, point: { x: 60, y: 80 } },
    ])
    expect(scaleAnnotations(annotations, 2, 2)).not.toBe(annotations)
  })
})

describe('stroke modes', () => {
  it('configures a colored pen stroke', () => {
    const context = {} as CanvasRenderingContext2D
    applyStrokeStyle(context, 'pen', '#2563eb', 7)
    expect(context).toMatchObject({
      lineCap: 'round',
      lineJoin: 'round',
      lineWidth: 7,
      globalCompositeOperation: 'source-over',
      strokeStyle: '#2563eb',
    })
  })

  it('uses transparent compositing for the eraser', () => {
    const context = {} as CanvasRenderingContext2D
    applyStrokeStyle(context, 'eraser-pixel', '#ef4444', 22)
    expect(context).toMatchObject({
      lineWidth: 22,
      globalCompositeOperation: 'destination-out',
    })
  })
})

describe('whole-stroke eraser', () => {
  const strokes: Stroke[] = [
    { tool: 'pen', color: 'red', width: 3, points: [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 10 }] },
    { tool: 'pen', color: 'blue', width: 8, points: [{ x: 150, y: 10 }, { x: 150, y: 90 }] },
    { tool: 'eraser-pixel', color: '', width: 22, points: [{ x: 20, y: 20 }, { x: 25, y: 25 }] },
  ]

  it('detects contact with any segment of a stroke', () => {
    expect(strokeTouchesPoint(strokes[0], { x: 48, y: 48 }, 6)).toBe(true)
    expect(strokeTouchesPoint(strokes[0], { x: 120, y: 80 }, 6)).toBe(false)
  })

  it('includes the pen thickness in its touch target', () => {
    expect(strokeTouchesPoint(strokes[1], { x: 157, y: 50 }, 4)).toBe(true)
  })

  it('removes the entire touched pen gesture and preserves other marks', () => {
    const result = eraseTouchedStrokes(strokes, { x: 48, y: 48 }, 6)
    expect(result).toEqual([strokes[1], strokes[2]])
  })
})
