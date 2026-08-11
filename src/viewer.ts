export function fullscreenPageWidth(
  pageRatio: number,
  screenWidth: number,
  screenHeight: number,
) {
  return Math.min(screenWidth * 0.96, screenHeight * 0.96 * pageRatio)
}

export function adjacentPageIndex(currentIndex: number, direction: -1 | 1, pageCount: number) {
  if (pageCount <= 0) return -1
  return Math.max(0, Math.min(pageCount - 1, currentIndex + direction))
}

export type FooterTextItem = { text: string; x: number; y: number }

export function detectSlideNumber(items: FooterTextItem[], pageHeight: number) {
  const candidates = items
    .filter((item) => item.y >= 0 && item.y <= pageHeight * 0.18)
    .flatMap((item) => {
      const match = item.text.trim().match(/^(\d{1,3})(?:\s*[\/|]\s*\d{1,3})?$/)
      return match ? [{ number: match[1], x: item.x, y: item.y }] : []
    })
    .sort((a, b) => a.y - b.y || b.x - a.x)
  return candidates[0]?.number ?? null
}

export function isContinuationSlide(current: string | null, next: string | null) {
  return current !== null && current === next
}
