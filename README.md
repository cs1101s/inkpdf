# InkPDF POC

A local-first PDF viewer with freehand annotations. PDFs are opened from your
computer and rendered in the browser; nothing is uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then choose a PDF.

## Controls

- `P` — pen
- `T` — text paste mode; click the page and press `Ctrl+V` or `Cmd+V`
- `E` — eraser
- `X` — erase an entire pen stroke
- Numpad `+` — pen
- Numpad `-` — erase an entire pen stroke
- `F` — enter or leave fullscreen presentation mode
- `PageDown` — move to the next PDF page
- `PageUp` — move to the previous PDF page
- `Shift+Delete` — erase every annotation on the current PDF page

Use **Erase slide** to remove every pen, eraser, and text annotation from only
the currently visible PDF page. Other pages are left unchanged, and the action
runs immediately without confirmation.
- `1`–`8` — select one of eight colors

Fullscreen mode shows one page per screen, fills unused space in black, hides
the toolbar, and snaps between pages while scrolling. Mouse, stylus, and touch
input are supported. Annotations currently live only
for the open browser session; saving/exporting them is a future feature.

On a two-display Chromium setup, fullscreen starts Presenter Mode after the
browser grants window-management permission. One display shows the audience
slide while the other shows a responsive controller with a live drawable
preview, the next slide, upcoming-slide thumbnails, all annotation tools, and
a **Switch displays** control. Unsupported browsers and single-display systems
continue to use normal fullscreen. Presenter Mode requires HTTPS when hosted.
Edge may require separate clicks to grant display permission, open the
controller window, and finally start the audience fullscreen because each
operation consumes a protected user gesture.

PDF pages are rendered from their vector source at the maximum fullscreen size
for the current display, including HiDPI scaling. This keeps the canvas-based
viewer sharp while preserving page-aligned annotations.

When `PageDown` moves to an adjacent PDF page with the same numeric slide number
in its bottom footer, annotations are copied onto that continuation page. A page
that already contains annotations is never overwritten.

Click any color bubble to customize the color assigned to that number. The
color choices and pen-size slider are saved in the browser for future visits.

Freehand strokes use high-frequency coalesced pointer samples and quadratic
curve smoothing for more natural circles and fast handwriting.

## Static hosting

Run `npm run build`, then upload the contents of `dist/` to any static web
server. The build uses relative asset paths, so it can live in a subdirectory
such as `public_html/inkpdf/`.

## Course PDF library

InkPDF can offer a pre-populated set of PDFs alongside the usual local file
picker — useful when another repo (e.g. a course-materials site) builds this
app and deploys it together with a folder of lecture PDFs.

At runtime the app fetches `pdfs/index.json`, relative to wherever
`index.html` is served from. If that request fails (the default for this
repo's own deploy), the feature stays hidden and nothing changes. If it
succeeds, a "Course files" dropdown appears in the toolbar and an equivalent
panel appears on the empty-state screen, both listing every entry.

`pdfs/index.json` is a JSON array. Each entry is either a plain filename
(the display title is derived from it, e.g. `lecture-02-recursion.pdf` →
"lecture 02 recursion") or an object with an explicit title:

```json
[
  "lecture-01-intro.pdf",
  { "file": "lecture-02-recursion.pdf", "title": "Lecture 2: Recursion" }
]
```

File paths are resolved relative to `index.json` itself, so the simplest
layout is a `pdfs/` directory containing the PDFs plus the manifest, deployed
next to the built `dist/` output:

```
dist/
├── index.html
├── assets/…
└── pdfs/
    ├── index.json
    ├── lecture-01-intro.pdf
    └── lecture-02-recursion.pdf
```

To point at a manifest somewhere else, add a meta tag to `index.html`:

```html
<meta name="inkpdf-library" content="path/to/manifest.json" />
```
