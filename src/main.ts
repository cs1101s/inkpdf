import './style.css'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  applyStrokeStyle,
  canvasPoint,
  isTextAnnotation,
  scaleAnnotations,
  strokeMidpoint,
  strokeTouchesPoint,
  textLines,
  type CanvasAnnotation,
  type DrawingTool,
  type Point,
  type Stroke,
} from './annotation'
import { adjacentPageIndex, detectSlideNumber, fullscreenPageWidth, isContinuationSlide } from './viewer'
import { openPresenterDashboard, type NormalizedPoint, type PresenterDashboard } from './presenter'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const defaultColors = [
  { key: '1', name: 'Red', value: '#ef4444' },
  { key: '2', name: 'Blue', value: '#2563eb' },
  { key: '3', name: 'Green', value: '#16a34a' },
  { key: '4', name: 'Black', value: '#111827' },
  { key: '5', name: 'Orange', value: '#f97316' },
  { key: '6', name: 'Purple', value: '#9333ea' },
  { key: '7', name: 'Pink', value: '#ec4899' },
  { key: '8', name: 'White', value: '#ffffff' },
]
const savedColors = JSON.parse(localStorage.getItem('inkpdf-colors') ?? 'null') as string[] | null
const colors = defaultColors.map((color, index) => ({ ...color, value: savedColors?.[index] ?? color.value }))

let activeTool: DrawingTool = 'pen'
let activeColorIndex = 0
let penWidth = Number(localStorage.getItem('inkpdf-pen-width') ?? 3)
let currentObjectUrl: string | null = null
let pendingTextInsertion: ((text: string) => void) | null = null
type AnnotationSnapshot = { annotations: CanvasAnnotation[]; width: number; height: number }
type AnnotationController = {
  clear: () => void
  canReceiveContinuationCopy: () => boolean
  snapshot: () => AnnotationSnapshot
  copyFrom: (source: AnnotationSnapshot) => void
  drawStart: (point: NormalizedPoint) => void
  drawMove: (points: NormalizedPoint[]) => void
  drawEnd: () => void
}
const pageAnnotationControllers: AnnotationController[] = []
const pageSlideNumbers: Array<string | null> = []
type ManagedScreen = { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean; label?: string }
type ScreenDetailsLike = { screens: ManagedScreen[]; currentScreen: ManagedScreen; addEventListener?: (type: string, listener: () => void) => void }
let presenterDashboard: PresenterDashboard | null = null
let screenDetailsCache: ScreenDetailsLike | null = null
let screenPermissionUnavailable = false
let audienceScreen: ManagedScreen | null = null
let controllerScreen: ManagedScreen | null = null
let swappingDisplays = false
let displaySwitchPending = false

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="toolbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">A</span>
      <div><strong>InkPDF</strong><span>Local PDF annotator</span></div>
    </div>
    <div class="toolbar-actions">
      <label class="open-button" for="file-input">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16V8h-8l-2-2H4v13Zm8-8v5m-2.5-2.5h5"/></svg>
        Open PDF
      </label>
      <input id="file-input" type="file" accept="application/pdf,.pdf" />
      <div class="divider"></div>
      <div class="tool-group" aria-label="Drawing tools">
        <button class="tool active" data-tool="pen" title="Pen (P)" aria-pressed="true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-12.5 3.5 3.5"/></svg>
          Pen <kbd>P</kbd>
        </button>
        <button class="tool" data-tool="text" title="Paste text annotation (T)" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M12 5v14M8 19h8"/></svg>
          Text <kbd>T</kbd>
        </button>
        <button class="tool" data-tool="eraser-pixel" title="Shape eraser (E)" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 18.5-3-3 9-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-7 8h-4Zm-1-5 5 5M10 20h10"/></svg>
          Shape erase <kbd>E</kbd>
        </button>
        <button class="tool" data-tool="eraser-stroke" title="Erase entire stroke (X)" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M8 4 5 7l3 3M7 16c2-4 8-5 10-1 1 3-2 5-5 5-3 0-5-1-6-3"/></svg>
          Stroke erase <kbd>X</kbd>
        </button>
        <button class="tool danger-tool" id="erase-slide-button" title="Erase annotations on this slide (Shift+Delete)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
          Erase slide <kbd>Shift+Del</kbd>
        </button>
      </div>
      <div class="divider"></div>
      <div class="color-group" aria-label="Pen colors">
        ${colors.map((color, index) => `
          <label class="color ${index === 0 ? 'active' : ''}" data-color-index="${index}"
            style="--swatch:${color.value}" title="Change shortcut ${color.key} color"
            aria-label="Change color for shortcut ${color.key}">
            <input type="color" value="${color.value}" data-color-picker="${index}">
            <span></span><kbd>${color.key}</kbd>
          </label>`).join('')}
      </div>
      <div class="divider"></div>
      <label class="thickness-control" title="Pen thickness">
        <span>Size</span>
        <input id="pen-width" type="range" min="1" max="20" step="1" value="${penWidth}">
        <output id="pen-width-output">${penWidth}</output>
      </label>
      <div class="divider"></div>
      <button class="tool fullscreen-button" id="fullscreen-button" title="Fullscreen presentation (F)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4"/></svg>
        Fullscreen <kbd>F</kbd>
      </button>
      <label class="presenter-toggle" title="Open presenter controls on a second display">
        <input id="presenter-mode" type="checkbox">
        <span>Presenter mode</span>
      </label>
    </div>
    <div class="file-status" id="file-status">No document open</div>
  </header>

  <main id="viewer">
    <section class="empty-state" id="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 5h15l8 8v30H13V5Zm15 0v9h8M19 23h11M19 29h11M19 35h7"/></svg>
      </div>
      <p class="eyebrow">Your canvas is ready</p>
      <h1>Open a PDF and start writing.</h1>
      <p class="empty-copy">Your document stays on this device. Draw directly over any page with a mouse, pen, or touch.</p>
      <label class="primary-button" for="file-input">Choose a PDF</label>
      <div class="shortcut-hint"><span><kbd>1</kbd>–<kbd>8</kbd> colors</span><span><kbd>P</kbd> pen</span><span><kbd>T</kbd> paste text</span><span><kbd>E</kbd> shape erase</span><span><kbd>X</kbd> stroke erase</span></div>
    </section>
    <div class="loading hidden" id="loading"><span></span>Rendering document…</div>
    <div class="pages" id="pages"></div>
    <div class="paste-hint hidden" id="paste-hint">Insertion point set — press <kbd>Ctrl</kbd> + <kbd>V</kbd></div>
    <div class="presenter-hint hidden" id="presenter-hint"></div>
    <button class="start-presenter hidden" id="start-presenter">Start audience fullscreen</button>
  </main>
`

const input = document.querySelector<HTMLInputElement>('#file-input')!
const pages = document.querySelector<HTMLDivElement>('#pages')!
const emptyState = document.querySelector<HTMLElement>('#empty-state')!
const loading = document.querySelector<HTMLDivElement>('#loading')!
const fileStatus = document.querySelector<HTMLDivElement>('#file-status')!
const viewer = document.querySelector<HTMLElement>('#viewer')!
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button')!
const presenterModeInput = document.querySelector<HTMLInputElement>('#presenter-mode')!
const penWidthInput = document.querySelector<HTMLInputElement>('#pen-width')!
const penWidthOutput = document.querySelector<HTMLOutputElement>('#pen-width-output')!
const pasteHint = document.querySelector<HTMLDivElement>('#paste-hint')!
const presenterHint = document.querySelector<HTMLDivElement>('#presenter-hint')!
const startPresenterButton = document.querySelector<HTMLButtonElement>('#start-presenter')!
const eraseSlideButton = document.querySelector<HTMLButtonElement>('#erase-slide-button')!

function setTool(tool: DrawingTool) {
  activeTool = tool
  if (tool !== 'text') {
    pendingTextInsertion = null
    pasteHint.classList.add('hidden')
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    const selected = button.dataset.tool === tool
    button.classList.toggle('active', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  pages.dataset.tool = tool
}

function setColor(index: number) {
  activeColorIndex = index
  setTool('pen')
  document.querySelectorAll<HTMLElement>('[data-color-index]').forEach((swatch) => {
    swatch.classList.toggle('active', Number(swatch.dataset.colorIndex) === index)
  })
}

function makeDrawable(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')!
  let annotations: CanvasAnnotation[] = []
  let drawing = false
  let currentStroke: Stroke | null = null
  let acceptsContinuationCopy = true

  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return canvasPoint(event.clientX, event.clientY, rect, canvas.width, canvas.height)
  }

  const drawStroke = (stroke: Stroke) => {
    if (!stroke.points.length) return
    applyStrokeStyle(context, stroke.tool, stroke.color, stroke.width)
    context.beginPath()
    context.moveTo(stroke.points[0].x, stroke.points[0].y)
    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01)
    } else if (stroke.points.length === 2) {
      context.lineTo(stroke.points[1].x, stroke.points[1].y)
    } else {
      for (let index = 1; index < stroke.points.length - 1; index++) {
        const control = stroke.points[index]
        const end = strokeMidpoint(control, stroke.points[index + 1])
        context.quadraticCurveTo(control.x, control.y, end.x, end.y)
      }
      const last = stroke.points.at(-1)!
      context.lineTo(last.x, last.y)
    }
    context.stroke()
    context.closePath()
  }

  const drawText = (annotation: Extract<CanvasAnnotation, { text: string }>) => {
    context.globalCompositeOperation = 'source-over'
    context.fillStyle = annotation.color
    context.font = `500 ${annotation.fontSize}px "DM Sans", system-ui, sans-serif`
    context.textBaseline = 'top'
    const lineHeight = annotation.fontSize * 1.25
    textLines(annotation.text).forEach((line, index) => {
      context.fillText(line, annotation.point.x, annotation.point.y + index * lineHeight)
    })
  }

  const redraw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    annotations.forEach((annotation) => {
      if (isTextAnnotation(annotation)) drawText(annotation)
      else drawStroke(annotation)
    })
  }

  const clear = () => {
    annotations = []
    acceptsContinuationCopy = false
    currentStroke = null
    drawing = false
    context.clearRect(0, 0, canvas.width, canvas.height)
  }
  const eraseWholeStrokeAt = (p: Point) => {
    const before = annotations.length
    const displayScale = canvas.width / canvas.getBoundingClientRect().width
    annotations = annotations.filter((annotation) =>
      isTextAnnotation(annotation) || !strokeTouchesPoint(annotation, p, 14 * displayScale),
    )
    if (annotations.length !== before) redraw()
  }

  const startAt = (p: Point) => {
    drawing = true
    acceptsContinuationCopy = false
    if (activeTool === 'text') {
      drawing = false
      const displayScale = canvas.width / canvas.getBoundingClientRect().width
      pendingTextInsertion = (text) => {
        const annotation = { text, color: colors[activeColorIndex].value, fontSize: 18 * displayScale, point: p }
        annotations.push(annotation)
        drawText(annotation)
        pendingTextInsertion = null
        pasteHint.classList.add('hidden')
      }
      pasteHint.classList.remove('hidden')
      return
    }
    if (activeTool === 'eraser-stroke') {
      eraseWholeStrokeAt(p)
      return
    }
    const displayScale = canvas.width / canvas.getBoundingClientRect().width
    const strokeWidth = (activeTool === 'eraser-pixel' ? 22 : penWidth) * displayScale
    currentStroke = { tool: activeTool, color: colors[activeColorIndex].value, width: strokeWidth, points: [p] }
    drawStroke(currentStroke)
  }

  const moveThrough = (points: Point[]) => {
    if (!drawing) return
    if (activeTool === 'eraser-stroke') {
      points.forEach(eraseWholeStrokeAt)
      return
    }
    if (!currentStroke) return
    points.forEach((sampledPoint) => {
      const previous = currentStroke!.points.at(-1)!
      if (Math.hypot(sampledPoint.x - previous.x, sampledPoint.y - previous.y) >= 0.25) currentStroke!.points.push(sampledPoint)
    })
    redraw()
    drawStroke(currentStroke)
  }

  const finish = () => {
    if (!drawing) return
    drawing = false
    if (currentStroke) annotations.push(currentStroke)
    currentStroke = null
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    canvas.setPointerCapture(event.pointerId)
    startAt(point(event))
  })

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return
    const coalescedEvents = event.getCoalescedEvents?.() ?? []
    const samples = coalescedEvents.length ? coalescedEvents : [event]
    moveThrough(samples.map(point))
  })

  const stop = (event: PointerEvent) => {
    if (!drawing) return
    finish()
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)

  return {
    clear,
    canReceiveContinuationCopy: () => acceptsContinuationCopy && annotations.length === 0,
    snapshot: () => ({
      annotations,
      width: canvas.width,
      height: canvas.height,
    }),
    copyFrom: (source: AnnotationSnapshot) => {
      if (!acceptsContinuationCopy || annotations.length || !source.annotations.length) return
      annotations = scaleAnnotations(
        source.annotations,
        canvas.width / source.width,
        canvas.height / source.height,
      )
      acceptsContinuationCopy = false
      redraw()
    },
    drawStart: (normalized: NormalizedPoint) => startAt({ x: normalized.x * canvas.width, y: normalized.y * canvas.height }),
    drawMove: (normalizedPoints: NormalizedPoint[]) => moveThrough(normalizedPoints.map((item) => ({ x: item.x * canvas.width, y: item.y * canvas.height }))),
    drawEnd: finish,
  }
}

async function renderPdf(file: File) {
  pageAnnotationControllers.length = 0
  pageSlideNumbers.length = 0
  pendingTextInsertion = null
  pasteHint.classList.add('hidden')
  pages.replaceChildren()
  emptyState.classList.add('hidden')
  loading.classList.remove('hidden')
  fileStatus.textContent = file.name
  fileStatus.title = file.name

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
  currentObjectUrl = URL.createObjectURL(file)

  try {
    const pdfData = new Uint8Array(await file.arrayBuffer())
    const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise
    const maxWidth = Math.min(920, window.innerWidth - 40)

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      const footerItems = textContent.items.flatMap((item) => {
        if (!('str' in item) || !item.transform) return []
        return [{ text: item.str, x: item.transform[4], y: item.transform[5] }]
      })
      const slideNumber = detectSlideNumber(footerItems, baseViewport.height)
      pageSlideNumbers.push(slideNumber)
      const scale = Math.min(1.55, maxWidth / baseViewport.width)
      const viewport = page.getViewport({ scale })
      const outputScale = Math.min(window.devicePixelRatio || 1, 2)
      const pageRatio = baseViewport.width / baseViewport.height
      const screenWidth = Math.max(window.innerWidth, window.screen.availWidth || window.innerWidth)
      const screenHeight = Math.max(window.innerHeight, window.screen.availHeight || window.innerHeight)
      const targetCssWidth = Math.max(
        viewport.width,
        fullscreenPageWidth(pageRatio, screenWidth, screenHeight),
      )
      const desiredRenderScale = (targetCssWidth / baseViewport.width) * outputScale
      const safeRenderScale = Math.min(
        desiredRenderScale,
        8192 / Math.max(baseViewport.width, baseViewport.height),
      )
      const renderViewport = page.getViewport({ scale: safeRenderScale })

      const pageWrap = document.createElement('article')
      pageWrap.className = 'page-wrap'
      pageWrap.style.width = `${viewport.width}px`
      pageWrap.style.height = `${viewport.height}px`
      pageWrap.style.setProperty('--page-aspect', `${viewport.width} / ${viewport.height}`)
      pageWrap.style.setProperty('--page-ratio', `${pageRatio}`)
      pageWrap.setAttribute('aria-label', `Page ${pageNumber}`)

      const pageStage = document.createElement('section')
      pageStage.className = 'page-stage'
      pageStage.setAttribute('aria-label', `Slide ${pageNumber}`)
      if (slideNumber) pageStage.dataset.slideNumber = slideNumber

      const pdfCanvas = document.createElement('canvas')
      pdfCanvas.className = 'pdf-canvas'
      pdfCanvas.width = Math.floor(renderViewport.width)
      pdfCanvas.height = Math.floor(renderViewport.height)

      const inkCanvas = document.createElement('canvas')
      inkCanvas.className = 'ink-canvas'
      inkCanvas.width = pdfCanvas.width
      inkCanvas.height = pdfCanvas.height
      inkCanvas.setAttribute('aria-label', `Annotations for page ${pageNumber}`)

      pageWrap.append(pdfCanvas, inkCanvas)
      pageStage.append(pageWrap)
      pages.append(pageStage)
      pageAnnotationControllers.push(makeDrawable(inkCanvas))

      await page.render({
        canvas: pdfCanvas,
        canvasContext: pdfCanvas.getContext('2d')!,
        viewport: renderViewport,
      }).promise
    }
  } catch (error) {
    pages.innerHTML = `<div class="error">This PDF could not be opened. Please try another file.</div>`
    console.error(error)
  } finally {
    loading.classList.add('hidden')
  }
}

input.addEventListener('change', () => {
  const file = input.files?.[0]
  if (file) void renderPdf(file)
  input.value = ''
})

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool as DrawingTool))
})
document.querySelectorAll<HTMLInputElement>('[data-color-picker]').forEach((picker) => {
  picker.addEventListener('change', () => {
    const index = Number(picker.dataset.colorPicker)
    colors[index].value = picker.value
    picker.closest<HTMLElement>('.color')!.style.setProperty('--swatch', picker.value)
    localStorage.setItem('inkpdf-colors', JSON.stringify(colors.map(({ value }) => value)))
    setColor(index)
  })
})

function setPenWidth(width: number) {
  penWidth = width
  penWidthInput.value = String(width)
  penWidthOutput.value = String(penWidth)
  localStorage.setItem('inkpdf-pen-width', String(penWidth))
  setTool('pen')
}

penWidthInput.addEventListener('input', () => setPenWidth(Number(penWidthInput.value)))

function eraseCurrentSlide() {
  const pageIndex = currentPageIndex()
  const controller = pageAnnotationControllers[pageIndex]
  if (!controller) return
  controller.clear()
  pendingTextInsertion = null
  pasteHint.classList.add('hidden')
}

eraseSlideButton.addEventListener('click', eraseCurrentSlide)

function pageCanvases(index: number) {
  const stage = pages.querySelectorAll<HTMLElement>('.page-stage')[index]
  if (!stage) return null
  return {
    pdf: stage.querySelector<HTMLCanvasElement>('.pdf-canvas')!,
    ink: stage.querySelector<HTMLCanvasElement>('.ink-canvas')!,
  }
}

function placeWindow(target: Window, screen: ManagedScreen) {
  target.moveTo(screen.availLeft, screen.availTop)
  target.resizeTo(screen.availWidth, screen.availHeight)
  target.focus()
}

let presenterHintTimer = 0
function showPresenterHint(message: string) {
  presenterHint.textContent = message
  presenterHint.classList.remove('hidden')
  window.clearTimeout(presenterHintTimer)
  presenterHintTimer = window.setTimeout(() => presenterHint.classList.add('hidden'), 5000)
}

async function swapPresenterDisplays() {
  if (!presenterDashboard || !audienceScreen || !controllerScreen) return
  swappingDisplays = true
  displaySwitchPending = true
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    const previousAudience = audienceScreen
    audienceScreen = controllerScreen
    controllerScreen = previousAudience
    placeWindow(presenterDashboard.window, controllerScreen)
    window.moveTo(audienceScreen.availLeft, audienceScreen.availTop)
    window.resizeTo(audienceScreen.availWidth, audienceScreen.availHeight)
    window.focus()
    startPresenterButton.textContent = 'Complete display switch'
    startPresenterButton.classList.remove('hidden')
    showPresenterHint('Displays repositioned. Click Complete display switch to resume fullscreen.')
  } catch (error) {
    displaySwitchPending = false
    showPresenterHint('Edge could not reposition the presentation windows.')
    console.warn('Could not switch presenter displays.', error)
  } finally {
    swappingDisplays = false
  }
}

function buildPresenterDashboard(popup: Window) {
  return openPresenterDashboard(popup, {
    pageCount: () => pageAnnotationControllers.length,
    currentIndex: currentPageIndex,
    canvases: pageCanvases,
    colors: colors.map(({ value }) => value),
    penWidth: () => penWidth,
    navigate: changePage,
    navigateTo: goToPage,
    selectTool: setTool,
    selectColor: setColor,
    setPenWidth,
    eraseSlide: eraseCurrentSlide,
    drawStart: (point) => pageAnnotationControllers[currentPageIndex()]?.drawStart(point),
    drawMove: (points) => pageAnnotationControllers[currentPageIndex()]?.drawMove(points),
    drawEnd: () => pageAnnotationControllers[currentPageIndex()]?.drawEnd(),
    pasteText: (text) => pendingTextInsertion?.(text),
    swapDisplays: () => void swapPresenterDisplays(),
    endPresentation: () => void endPresentation(),
  })
}

async function endPresentation() {
  const dashboard = presenterDashboard
  presenterDashboard = null
  startPresenterButton.classList.add('hidden')
  displaySwitchPending = false
  audienceScreen = null
  controllerScreen = null
  if (document.fullscreenElement) await document.exitFullscreen()
  dashboard?.close()
  window.focus()
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await endPresentation()
    return
  }

  const extendedScreen = window.screen as Screen & { isExtended?: boolean }
  const managedWindow = window as Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> }
  if (!presenterModeInput.checked) {
    await viewer.requestFullscreen()
    return
  }
  if (extendedScreen.isExtended && managedWindow.getScreenDetails && pageAnnotationControllers.length && !screenPermissionUnavailable) {
    if (!screenDetailsCache) {
      managedWindow.getScreenDetails()
        .then((details) => {
          screenDetailsCache = details
          showPresenterHint('Display permission enabled. Click Fullscreen again to open the controller.')
        })
        .catch((error) => {
          screenPermissionUnavailable = true
          showPresenterHint('Display permission was not available. Click Fullscreen again for normal fullscreen.')
          console.warn('Window-management permission unavailable.', error)
        })
      return
    }

    if (screenDetailsCache.screens.length > 1) {
      if (!presenterDashboard || !controllerScreen || !audienceScreen) {
        controllerScreen = screenDetailsCache.currentScreen
        audienceScreen = screenDetailsCache.screens.find((screen) => screen !== controllerScreen) ?? screenDetailsCache.screens[1]
      }

      if (presenterDashboard?.window.closed) presenterDashboard = null
      if (presenterDashboard) {
        try {
          startPresenterButton.classList.add('hidden')
          await viewer.requestFullscreen({ screen: audienceScreen } as FullscreenOptions & { screen: ManagedScreen })
          displaySwitchPending = false
          startPresenterButton.textContent = 'Start audience fullscreen'
        } catch (error) {
          startPresenterButton.classList.remove('hidden')
          showPresenterHint('Fullscreen was blocked. Click Start audience fullscreen and try again.')
          console.warn('Targeted fullscreen failed.', error)
        }
        return
      }

      const features = `popup=yes,left=${controllerScreen.availLeft},top=${controllerScreen.availTop},width=${controllerScreen.availWidth},height=${controllerScreen.availHeight}`
      const popup = window.open('', 'inkpdf-presenter', features)
      if (popup) {
        presenterDashboard = buildPresenterDashboard(popup)
        placeWindow(popup, controllerScreen)
        window.focus()
        startPresenterButton.classList.remove('hidden')
        showPresenterHint('Controller is ready. Click Start audience fullscreen in this window.')
        return
      }
    }
  }
  await viewer.requestFullscreen()
}

async function primeScreenDetails() {
  const extendedScreen = window.screen as Screen & { isExtended?: boolean }
  const managedWindow = window as Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> }
  if (!extendedScreen.isExtended || !managedWindow.getScreenDetails) return
  try {
    const permission = await navigator.permissions.query({ name: 'window-management' as PermissionName })
    if (permission.state === 'granted') screenDetailsCache = await managedWindow.getScreenDetails()
  } catch {
    // Permission will be requested from the fullscreen button instead.
  }
}

fullscreenButton.addEventListener('click', () => void toggleFullscreen())
startPresenterButton.addEventListener('click', () => void toggleFullscreen())
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)))
  if (!document.fullscreenElement && !swappingDisplays && !displaySwitchPending && presenterDashboard) {
    presenterDashboard.close()
    presenterDashboard = null
    startPresenterButton.classList.add('hidden')
  }
})

window.addEventListener('paste', (event) => {
  if (!pendingTextInsertion) return
  const text = event.clipboardData?.getData('text/plain')
  if (!text) return
  event.preventDefault()
  pendingTextInsertion(text)
})

function currentPageIndex() {
  const stages = [...pages.querySelectorAll<HTMLElement>('.page-stage')]
  if (!stages.length) return -1
  const viewportCenter = window.innerHeight / 2
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY
  stages.forEach((stage, index) => {
    const page = stage.querySelector<HTMLElement>('.page-wrap')!
    const rect = page.getBoundingClientRect()
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  return closestIndex
}

function changePage(direction: -1 | 1) {
  const stages = [...pages.querySelectorAll<HTMLElement>('.page-stage')]
  const sourceIndex = currentPageIndex()
  const targetIndex = adjacentPageIndex(sourceIndex, direction, stages.length)
  if (targetIndex < 0) return
  if (
    direction === 1
    && targetIndex !== sourceIndex
    && isContinuationSlide(pageSlideNumbers[sourceIndex], pageSlideNumbers[targetIndex])
    && pageAnnotationControllers[targetIndex].canReceiveContinuationCopy()
  ) {
    pageAnnotationControllers[targetIndex].copyFrom(pageAnnotationControllers[sourceIndex].snapshot())
  }
  jumpToPageStage(stages[targetIndex])
}

function goToPage(targetIndex: number) {
  const stages = [...pages.querySelectorAll<HTMLElement>('.page-stage')]
  const target = stages[targetIndex]
  if (!target) return
  jumpToPageStage(target)
}

function jumpToPageStage(stage: HTMLElement) {
  if (document.fullscreenElement) {
    pages.scrollTop = stage.offsetTop
    return
  }
  const page = stage.querySelector<HTMLElement>('.page-wrap')!
  const top = window.scrollY + page.getBoundingClientRect().top - (window.innerHeight - page.offsetHeight) / 2
  window.scrollTo(0, top)
}

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null
  const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]')
  if (!isEditing && event.shiftKey && event.key === 'Delete') {
    event.preventDefault()
    eraseCurrentSlide()
    return
  }
  if (!isEditing && ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    changePage(event.key === 'PageDown' || event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key.toLowerCase() === 'p') setTool('pen')
  if (event.key.toLowerCase() === 't') setTool('text')
  if (event.key.toLowerCase() === 'e') setTool('eraser-pixel')
  if (event.key.toLowerCase() === 'x') setTool('eraser-stroke')
  if (event.key.toLowerCase() === 'f') void toggleFullscreen()
  const colorIndex = colors.findIndex((item) => item.key === event.key)
  if (colorIndex >= 0) setColor(colorIndex)
})

setTool('pen')
void primeScreenDetails()
