export type NormalizedPoint = { x: number; y: number }
export type CanvasPair = { pdf: HTMLCanvasElement; ink: HTMLCanvasElement }

export function containRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height }
}

export function normalizedPointInRect(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  content: { x: number; y: number; width: number; height: number },
): NormalizedPoint | null {
  const x = (clientX - bounds.left) * (bounds.width ? 1 / bounds.width : 0)
  const y = (clientY - bounds.top) * (bounds.height ? 1 / bounds.height : 0)
  const pixelX = x * bounds.width
  const pixelY = y * bounds.height
  if (pixelX < content.x || pixelX > content.x + content.width || pixelY < content.y || pixelY > content.y + content.height) return null
  return { x: (pixelX - content.x) / content.width, y: (pixelY - content.y) / content.height }
}

type DashboardOptions = {
  pageCount: () => number
  currentIndex: () => number
  canvases: (index: number) => CanvasPair | null
  colors: string[]
  penWidth: () => number
  navigate: (direction: -1 | 1) => void
  navigateTo: (index: number) => void
  selectTool: (tool: 'pen' | 'text' | 'eraser-pixel' | 'eraser-stroke') => void
  selectColor: (index: number) => void
  setPenWidth: (width: number) => void
  eraseSlide: () => void
  drawStart: (point: NormalizedPoint) => void
  drawMove: (points: NormalizedPoint[]) => void
  drawEnd: () => void
  pasteText: (text: string) => void
  swapDisplays: () => void
  endPresentation: () => void
}

export type PresenterDashboard = { window: Window; close: () => void }

export function openPresenterDashboard(presenterWindow: Window, options: DashboardOptions): PresenterDashboard {
  const doc = presenterWindow.document
  doc.open()
  doc.write(`<!doctype html><html><head><title>InkPDF Presenter</title><style>
    :root{font-family:system-ui,sans-serif;color:#ecf1ed;background:#101411}*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr)}
    button,input{font:inherit}button{cursor:pointer}.topbar{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:10px 12px 0}.top-nav{display:flex;gap:7px}.top-nav button{min-width:48px;height:40px;border:1px solid #3b4740;border-radius:9px;background:#202822;color:#fff;font-size:21px}.top-nav button:hover{background:#2c3931}.top-title{text-align:center;color:#91a097;font-size:12px}.clock{font-variant-numeric:tabular-nums;font-size:24px;font-weight:700;letter-spacing:.5px}.dashboard{min-height:0;padding:12px;display:grid;grid-template-columns:minmax(0,var(--main-size,75%)) 8px minmax(250px,1fr);gap:7px}
    .left{min-height:0;display:grid;grid-template-rows:minmax(120px,var(--live-size,74%)) 8px minmax(90px,1fr);gap:7px}.right{min-height:0;display:grid;grid-template-rows:minmax(180px,1fr) auto;gap:12px}
    .splitter{position:relative;border-radius:5px;background:#27312b;touch-action:none}.splitter:hover,.splitter.dragging{background:#8aac4a}.splitter.vertical{cursor:col-resize}.splitter.horizontal{cursor:row-resize}.splitter::after{content:'';position:absolute;inset:35% 2px;border-radius:3px;background:#5b695f}.splitter.horizontal::after{inset:2px 45%}
    .panel{position:relative;min-height:0;overflow:hidden;border:1px solid #344039;border-radius:13px;background:#050605}.label{position:absolute;z-index:2;top:8px;left:8px;padding:4px 8px;border-radius:12px;background:#17201bbb;color:#b9c6be;font-size:11px}
    canvas{display:block;width:100%;height:100%}.current canvas{touch-action:none;cursor:crosshair}.upcoming{display:flex;gap:9px;overflow-x:auto;padding:10px}.thumb{position:relative;flex:0 0 min(220px,28vw);border:1px solid #344039;border-radius:9px;background:#050605;overflow:hidden;cursor:pointer;padding:0}.thumb:hover{border-color:#b7d967;transform:translateY(-1px)}.thumb.current-slide{border-color:#d7f366;box-shadow:0 0 0 2px #d7f36655}.thumb.next-slide{border-color:#7fae98}.thumb span{position:absolute;z-index:2;left:5px;bottom:5px;padding:2px 6px;border-radius:8px;background:#111b;color:#fff;font-size:10px}
    .tools{padding:10px;display:grid;gap:9px;overflow:auto}.tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.tool-grid button,.nav button,.swap,.danger,.end{min-height:38px;border:1px solid #3b4740;border-radius:8px;background:#202822;color:#eaf0eb}.tool-grid button:hover,.nav button:hover,.swap:hover,.danger:hover,.end:hover{background:#2c3931}.tool-grid button.active{border-color:#b7d967;background:#30431f}.danger{color:#ffb0a7!important}.end{color:#fff;background:#71332d;border-color:#b96055}.colors{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.color{aspect-ratio:1;border:2px solid #101411;border-radius:50%;outline:1px solid #526058}.color.active{outline:3px solid #d7f366}.size{display:grid;grid-template-columns:auto 1fr 28px;gap:7px;align-items:center;font-size:12px}.size input{accent-color:#d7f366}.nav{display:grid;grid-template-columns:1fr 1fr;gap:6px}.swap{width:100%;background:#31451e;border-color:#779c3e}
    @media(max-aspect-ratio:4/5){.dashboard{grid-template-columns:1fr;grid-template-rows:minmax(300px,var(--main-size,65%)) 8px minmax(280px,1fr);overflow:auto}.dashboard>.splitter{cursor:row-resize}.left{grid-template-rows:minmax(220px,var(--live-size,72%)) 8px minmax(105px,1fr)}.right{grid-template-columns:minmax(180px,1fr) minmax(230px,1fr);grid-template-rows:1fr}.tools{align-content:start}.thumb{flex-basis:38vw}}
  </style></head><body><header class="topbar"><div class="top-nav"><button id="previous" title="Previous slide">←</button><button id="next-page" title="Next slide">→</button></div><div class="top-title">PRESENTER VIEW</div><time class="clock" id="clock"></time></header><main class="dashboard" id="dashboard">
    <section class="left"><div class="panel current"><span class="label">Live slide</span><canvas id="current"></canvas></div><div class="splitter horizontal" id="slide-splitter" title="Drag to resize slide and thumbnails"></div><div class="panel upcoming" id="upcoming"></div></section>
    <div class="splitter vertical" id="main-splitter" title="Drag to resize presenter panels"></div>
    <aside class="right"><div class="panel"><span class="label">Next slide</span><canvas id="next"></canvas></div><div class="panel tools">
      <div class="tool-grid"><button class="active" data-tool="pen">Pen (P)</button><button data-tool="text">Text (T)</button><button data-tool="eraser-pixel">Shape erase (E)</button><button data-tool="eraser-stroke">Stroke erase (X)</button></div>
      <div class="colors">${options.colors.map((color, index) => `<button class="color ${index === 0 ? 'active' : ''}" data-color="${index}" style="background:${color}" title="Color ${index + 1}"></button>`).join('')}</div>
      <label class="size">Size <input id="size" type="range" min="1" max="20" value="${options.penWidth()}"><output>${options.penWidth()}</output></label>
      <button class="swap" id="swap">⇄ Switch displays</button><button class="danger" id="erase">Erase current slide (Shift+Delete)</button><button class="end" id="end">End presentation</button>
    </div></aside>
  </main></body></html>`)
  doc.close()

  const currentCanvas = doc.querySelector<HTMLCanvasElement>('#current')!
  const nextCanvas = doc.querySelector<HTMLCanvasElement>('#next')!
  const upcoming = doc.querySelector<HTMLDivElement>('#upcoming')!
  const dashboard = doc.querySelector<HTMLElement>('#dashboard')!
  const clock = doc.querySelector<HTMLTimeElement>('#clock')!
  const drawRects = new WeakMap<HTMLCanvasElement, ReturnType<typeof containRect>>()
  const visibleThumbnails = new Set<HTMLCanvasElement>()
  let lastIndex = -1
  let animationFrame = 0
  const updateClock = () => { clock.textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()) }
  updateClock()
  const clockTimer = presenterWindow.setInterval(updateClock, 1000)

  const paint = (target: HTMLCanvasElement, pair: CanvasPair | null) => {
    const bounds = target.getBoundingClientRect()
    const ratio = Math.min(presenterWindow.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(bounds.width * ratio))
    const height = Math.max(1, Math.floor(bounds.height * ratio))
    if (target.width !== width || target.height !== height) { target.width = width; target.height = height }
    const context = target.getContext('2d')!
    context.fillStyle = '#000'; context.fillRect(0, 0, width, height)
    if (!pair) return
    const rect = containRect(pair.pdf.width, pair.pdf.height, width, height)
    context.drawImage(pair.pdf, rect.x, rect.y, rect.width, rect.height)
    context.drawImage(pair.ink, rect.x, rect.y, rect.width, rect.height)
    drawRects.set(target, { x: rect.x / ratio, y: rect.y / ratio, width: rect.width / ratio, height: rect.height / ratio })
  }

  const PresenterIntersectionObserver = (presenterWindow as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
  const thumbnailObserver = new PresenterIntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const canvas = entry.target as HTMLCanvasElement
      if (entry.isIntersecting) {
        visibleThumbnails.add(canvas)
        paint(canvas, options.canvases(Number(canvas.dataset.page)))
      } else {
        visibleThumbnails.delete(canvas)
      }
    })
  }, { root: upcoming, rootMargin: '80px' })

  const buildThumbnails = () => {
    upcoming.replaceChildren()
    for (let page = 0; page < options.pageCount(); page++) {
      const item = doc.createElement('button'); item.className = 'thumb'; item.type = 'button'; item.title = `Jump to slide ${page + 1}`
      const canvas = doc.createElement('canvas'); canvas.dataset.page = String(page)
      const label = doc.createElement('span'); label.textContent = String(page + 1)
      item.onclick = () => options.navigateTo(page)
      item.append(canvas, label); upcoming.append(item)
      thumbnailObserver.observe(canvas)
    }
  }
  buildThumbnails()

  const updateThumbnailSelection = (index: number) => {
    upcoming.querySelectorAll<HTMLButtonElement>('.thumb').forEach((item, page) => {
      item.classList.toggle('current-slide', page === index)
      item.classList.toggle('next-slide', page === index + 1)
    })
    const focusPage = Math.min(index + 1, options.pageCount() - 1)
    upcoming.querySelector<HTMLButtonElement>(`.thumb:nth-child(${focusPage + 1})`)?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
  }

  const render = () => {
    if (presenterWindow.closed) return
    const index = options.currentIndex()
    if (index !== lastIndex) { lastIndex = index; updateThumbnailSelection(index) }
    paint(currentCanvas, options.canvases(index))
    paint(nextCanvas, options.canvases(index + 1))
    visibleThumbnails.forEach((canvas) => paint(canvas, options.canvases(Number(canvas.dataset.page))))
    animationFrame = presenterWindow.requestAnimationFrame(render)
  }

  const pointer = (event: PointerEvent) => {
    const rect = drawRects.get(currentCanvas)
    return rect ? normalizedPointInRect(event.clientX, event.clientY, currentCanvas.getBoundingClientRect(), rect) : null
  }
  currentCanvas.addEventListener('pointerdown', (event) => { const point = pointer(event); if (!point) return; currentCanvas.setPointerCapture(event.pointerId); options.drawStart(point) })
  currentCanvas.addEventListener('pointermove', (event) => { if (!currentCanvas.hasPointerCapture(event.pointerId)) return; const samples = event.getCoalescedEvents?.() ?? [event]; options.drawMove(samples.map(pointer).filter((point): point is NormalizedPoint => point !== null)) })
  const end = (event: PointerEvent) => { if (currentCanvas.hasPointerCapture(event.pointerId)) currentCanvas.releasePointerCapture(event.pointerId); options.drawEnd() }
  currentCanvas.addEventListener('pointerup', end); currentCanvas.addEventListener('pointercancel', end)
  presenterWindow.addEventListener('paste', (event) => { const text = event.clipboardData?.getData('text/plain'); if (text) { event.preventDefault(); options.pasteText(text) } })
  doc.querySelector<HTMLButtonElement>('#previous')!.onclick = () => options.navigate(-1)
  doc.querySelector<HTMLButtonElement>('#next-page')!.onclick = () => options.navigate(1)
  doc.querySelector<HTMLButtonElement>('#erase')!.onclick = options.eraseSlide
  doc.querySelector<HTMLButtonElement>('#swap')!.onclick = options.swapDisplays
  doc.querySelector<HTMLButtonElement>('#end')!.onclick = options.endPresentation

  const makeResizable = (splitter: HTMLElement, property: '--main-size' | '--live-size') => {
    splitter.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      splitter.setPointerCapture(event.pointerId)
      splitter.classList.add('dragging')
    })
    splitter.addEventListener('pointermove', (event) => {
      if (!splitter.hasPointerCapture(event.pointerId)) return
      const portrait = presenterWindow.matchMedia('(max-aspect-ratio: 4/5)').matches
      const container = property === '--main-size' ? dashboard : splitter.parentElement!
      const rect = container.getBoundingClientRect()
      const verticalAxis = property === '--live-size' || portrait
      const raw = verticalAxis ? event.clientY - rect.top : event.clientX - rect.left
      const total = verticalAxis ? rect.height : rect.width
      const minimum = property === '--main-size' ? 280 : 110
      const maximum = Math.max(minimum, total - (property === '--main-size' ? 260 : 90))
      dashboard.style.setProperty(property, `${Math.max(minimum, Math.min(maximum, raw))}px`)
    })
    const finish = (event: PointerEvent) => {
      if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId)
      splitter.classList.remove('dragging')
    }
    splitter.addEventListener('pointerup', finish)
    splitter.addEventListener('pointercancel', finish)
  }
  makeResizable(doc.querySelector<HTMLElement>('#main-splitter')!, '--main-size')
  makeResizable(doc.querySelector<HTMLElement>('#slide-splitter')!, '--live-size')
  doc.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => { options.selectTool(button.dataset.tool as Parameters<DashboardOptions['selectTool']>[0]); doc.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button)) })
  doc.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => button.onclick = () => { const index = Number(button.dataset.color); options.selectColor(index); doc.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('active', item === button)) })
  const size = doc.querySelector<HTMLInputElement>('#size')!; const output = doc.querySelector<HTMLOutputElement>('output')!
  size.oninput = () => { output.value = size.value; options.setPenWidth(Number(size.value)) }
  presenterWindow.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === 'PageDown' || event.key === 'ArrowDown') { event.preventDefault(); options.navigate(1) }
    if (event.key === 'PageUp' || event.key === 'ArrowUp') { event.preventDefault(); options.navigate(-1) }
    if (event.shiftKey && event.key === 'Delete') { event.preventDefault(); options.eraseSlide() }
  })
  render()
  return { window: presenterWindow, close: () => { presenterWindow.cancelAnimationFrame(animationFrame); presenterWindow.clearInterval(clockTimer); thumbnailObserver.disconnect(); presenterWindow.close() } }
}
