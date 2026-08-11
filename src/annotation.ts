export type DrawingTool = 'pen' | 'text' | 'eraser-pixel' | 'eraser-stroke'
export type RenderedTool = Exclude<DrawingTool, 'eraser-stroke' | 'text'>
export type Point = { x: number; y: number }
export type Stroke = { tool: RenderedTool; color: string; width: number; points: Point[] }
export type TextAnnotation = { text: string; color: string; fontSize: number; point: Point }
export type CanvasAnnotation = Stroke | TextAnnotation
export type CanvasRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

export function canvasPoint(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  canvasWidth: number,
  canvasHeight: number,
): Point {
  return {
    x: (clientX - rect.left) * (canvasWidth / rect.width),
    y: (clientY - rect.top) * (canvasHeight / rect.height),
  }
}

export function strokeMidpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

export function applyStrokeStyle(
  context: Pick<CanvasRenderingContext2D, 'lineCap' | 'lineJoin' | 'lineWidth' | 'globalCompositeOperation' | 'strokeStyle'>,
  tool: RenderedTool,
  color: string,
  penWidth: number,
) {
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = penWidth
  context.globalCompositeOperation = tool === 'eraser-pixel' ? 'destination-out' : 'source-over'
  context.strokeStyle = color
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

export function strokeTouchesPoint(stroke: Stroke, point: Point, radius: number) {
  if (stroke.tool !== 'pen') return false
  const hitRadius = radius + stroke.width / 2
  if (stroke.points.length === 1) return distanceToSegment(point, stroke.points[0], stroke.points[0]) <= hitRadius
  return stroke.points.slice(1).some((end, index) => distanceToSegment(point, stroke.points[index], end) <= hitRadius)
}

export function eraseTouchedStrokes(strokes: Stroke[], point: Point, radius: number) {
  return strokes.filter((stroke) => !strokeTouchesPoint(stroke, point, radius))
}

export function textLines(text: string) {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function isTextAnnotation(annotation: CanvasAnnotation): annotation is TextAnnotation {
  return 'text' in annotation
}

export function scaleAnnotations(
  annotations: CanvasAnnotation[],
  scaleX: number,
  scaleY: number,
) {
  const sizeScale = (scaleX + scaleY) / 2
  return annotations.map((annotation): CanvasAnnotation => {
    if (isTextAnnotation(annotation)) {
      return {
        ...annotation,
        fontSize: annotation.fontSize * sizeScale,
        point: { x: annotation.point.x * scaleX, y: annotation.point.y * scaleY },
      }
    }
    return {
      ...annotation,
      width: annotation.width * sizeScale,
      points: annotation.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
    }
  })
}
