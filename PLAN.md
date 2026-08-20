# Plot Log — in-browser pump curve digitizer

## Context

Pump performance data almost always arrives as a picture: a vendor datasheet PDF, a screenshot,
a page out of a manual. Getting numbers back out of it today means hand-clicking points in a
generic digitizer, re-entering axis ranges every time, and doing the pump maths in a spreadsheet
afterwards. Pump charts are also awkward for generic tools — they carry several y-axes at once
(head, power, efficiency, NPSHr), often as stacked sub-panels sharing one flow axis, and several
same-coloured impeller-trim curves in the same frame.

**Plot Log** is a static web app that takes an image or PDF of a pump curve, extracts the curves
automatically, lets you correct anything it got wrong with direct manipulation, and then does the
pump engineering on top — fits, BEP, affinity-law rescaling, system curve and duty point.

Everything runs in the browser. No backend, no API keys, nothing uploaded — it deploys as static
files to GitHub Pages.

### Decisions taken

| | |
|---|---|
| **Repo** | `PlazmaEssence/plot-log`, standalone. Vite + TypeScript, deployed to Pages by GitHub Actions. `Engg-Tools` is untouched. |
| **Detection** | 100% offline — classical CV + Tesseract.js OCR. No vision API, no keys. |
| **Inputs targeted** | Vector vendor PDFs (first-class, near-exact) and clean screenshots / raster PDFs. Phone photos and bad scans are explicitly *not* a v1 target — no perspective unwarp or adaptive-threshold stage. |
| **Scope** | Digitizer **+ pump analysis** (fits, BEP, affinity, system curve, duty point). |

### Two things to confirm before/at deploy

1. **The repo is private.** GitHub Pages on a private repo needs a paid plan. It almost certainly
   needs to be made public — I'll flag it rather than flip visibility myself.
2. **Session access.** `plot-log` isn't attached to this session; I'll need `add_repo` with push
   access. Work will go to branch `claude/plot-log-github-repo-anks0l` and a PR, matching the
   branch convention I'm operating under — not straight to `main`.

---

## Architecture

Static SPA. Preact + `@preact/signals` for the side panels only (~12 KB gz — a real component
model where the state is fiddly); the canvas stage stays fully imperative, since that is where all
the performance-sensitive work happens and a framework buys nothing there.

Dependencies are deliberately few, all bundled from npm — **no CDN**, so the app works offline and
can't break when someone else's host does:

- `pdfjs-dist` — PDF rendering *and* vector operator/text extraction
- `tesseract.js` — OCR of tick labels, dynamically imported so it never touches first load
- `preact` + `@preact/signals`

Notably **not** OpenCV.js (~8 MB for the handful of operations actually needed). The required
CV — thresholding, projection profiles, connected runs, colour clustering, curve following — is a
few hundred lines of TypeScript and is written directly. Charting for the analysis view reuses the
app's own canvas renderer rather than pulling in a chart library.

Heavy work (colour clustering, tracing, OCR) runs in **Web Workers** so the canvas never janks.

```
src/
  main.tsx                  app shell, layout, keyboard map
  state/
    project.ts              Project model + signals store
    history.ts              undo/redo command stack
    persist.ts              IndexedDB autosave, .plotlog.json import/export
  io/
    import.ts               file / drag-drop / clipboard-paste intake
    pdf.ts                  pdf.js: page render, operator list, text content
    vector.ts               operator list -> classified polylines
    export.ts               CSV / TSV / JSON / PNG writers
  cv/
    image.ts                ImageData helpers, Lab colour, masks
    frame.ts                plot-frame + sub-panel detection
    grid.ts                 gridline + tick detection & removal
    ocr.ts                  Tesseract wrapper, numeric label parsing
    palette.ts              series colour discovery
    trace.ts                column-scan + path-following tracer
  geom/
    axis.ts                 pixel <-> data mapping (linear/log/affine)
    resample.ts             flatten, simplify, resample, smooth
  pump/
    fit.ts                  least-squares polynomial fits
    analysis.ts             BEP, affinity laws, system curve, duty point
    units.ts                unit registry + conversions
    quantities.ts           pump vocabulary for axis auto-labelling
  ui/
    Stage.ts                canvas: zoom/pan, layers, hit-testing, tools
    panels/*.tsx            import, axes, series, analysis, export panels
  workers/
    trace.worker.ts  ocr.worker.ts  palette.worker.ts
public/tesseract/           vendored wasm core + trimmed eng traineddata
```

### The one design decision everything rests on

**Points are stored in image pixel space, never in data space.** Data values are derived through
the axis calibration on read. Re-calibrating an axis — or fixing an OCR misread six steps later —
instantly recomputes every number without re-tracing anything. Raw traces are also kept separately
from smoothing/resampling settings, so those stay non-destructive and adjustable forever.

### Model

```ts
type Scale = 'linear' | 'log';

interface AxisCal {
  id: string; role: 'x' | 'y';
  name: string;                              // "Total Head"
  quantity: 'flow'|'head'|'power'|'efficiency'|'npshr'|'custom';
  unit: string;                              // "m"
  scale: Scale;
  p1: { px: Vec2; value: number };           // two calibration points…
  p2: { px: Vec2; value: number };           // …in image space
  confidence: number;                        // drives the ⚠ badge
}

interface PlotRegion {                       // a chart frame; a sheet may hold several
  id: string; frame: Rect;
  xAxisId: string; yAxisIds: string[];
}

interface Series {
  id: string; label: string;                 // "Ø219 mm"
  group?: string;                            // impeller-trim family
  regionId: string; xAxisId: string; yAxisId: string;
  color: string;
  pointsPx: Vec2[];                          // image space, x-sorted
  source: 'vector' | 'traced' | 'manual';
  visible: boolean; locked: boolean;
}
```

`PlotRegion` is what makes real datasheets work: head chart on top, efficiency / power / NPSH bands
stacked beneath it, all sharing one flow axis. Detection looks for *all* frames, and when several
share an x-extent and stack vertically it links them to a single x calibration automatically.

### Look and feel — inherited from Egg Tools

Separate repo, but it should read as the same family of tools. Egg Tools' design language is worth
porting wholesale into `src/styles/theme.css`, since it's already coherent:

- Dark only (`color-scheme: dark`), no light theme, no toggle.
- Surfaces `--bg #0e0f13` · `--surface #16181f` · `--surface2 #1e2029`; text `--text #e8e6df`,
  `--muted #8a8880`; hairline borders at 8%/14% white.
- Accents `--gold #e0b23c` (primary) with `--red #e05c5c` · `--green #5cb87a` · `--blue #6ea8e0`,
  each as a 4-token family (base / dim / bg @10% / border @25%).
- Radii `6 / 10 / 16 / 20 px`. Inter for UI, Crimson Pro for headings, JetBrains Mono for numbers.
- Component vocabulary to carry over: `.input-panel`, `.section`, `.stat-row`/`.stat`,
  `.notice-info`/`.notice-danger`, `.field-grid`/`.field`, `.btn-gold`/`.btn-ghost`, and `.pill`
  segmented controls. The dropzone and progress-bar rules already exist in `photo-kmz`'s page-local
  style block and can be lifted directly.

Egg Tools gets a `coming-soon` registry entry pointing at the deployed Plot Log URL, so the tool is
discoverable from the existing site — that's the only change proposed there, and only once it's
live.

---

## Pipeline

### 1. Import
Drag-drop, file picker, **and clipboard paste** (`Ctrl+V` — the fastest path for a screenshot).
PDFs get a page-thumbnail strip; the chosen page renders at 2–4× for crispness.

### 2. Vector extraction — the accuracy win on vendor PDFs
When a PDF page carries real vector art, tracing pixels is throwing away information. `pdf.js`
`getOperatorList()` gives path construction ops with their CTM, stroke colour, width and dash
pattern. Beziers are flattened to polylines at a set tolerance and mapped into image space so they
overlay the raster preview exactly.

Paths are then classified — axis-aligned/thin/grey/dashed → frame or gridline; long, coloured,
broadly monotone in x → candidate curve. In parallel `getTextContent()` yields every string with
its transform, so tick labels and axis titles are read **exactly, with no OCR at all**. On a
typical vendor datasheet this makes the whole extraction essentially automatic and error-free.

### 3. Raster auto-detect — screenshots
1. **Frame** — row/column ink-density projection profiles on a darkness map; borders appear as
   sharp peaks. Yields one or more candidate rectangles.
2. **Gridlines** — regular, uniform, light rows/cols inside the frame. Removed from the trace mask,
   and their regular spacing hands us **tick positions for free**.
3. **Ticks** — short perpendicular marks just outside the frame.
4. **Tick-label OCR** — crop the strip beside each axis, upscale ~4×, binarize, run Tesseract with
   a `0123456789.,-+eE%` whitelist. Each number pairs to its nearest tick, then a **least-squares
   fit of value against pixel** (or log-pixel) recovers the scale across *all* pairs. This is what
   makes OCR usable: two misreads out of six don't matter, the fit absorbs them, and a poor R²
   raises the ⚠ badge asking you to check that axis instead of silently producing wrong numbers.
5. **Axis titles** — OCR the rotated side strips and bottom strip, match against a pump vocabulary
   (`head`/`H`/`m`/`ft`, `kW`/`hp`, `efficiency`/`η`/`%`, `NPSH`, `flow`/`capacity`/`Q`/`m³/h`/
   `gpm`/`l/s`) to fill in quantity, unit and axis role automatically.
6. **Series colours** — quantize inside the frame, cluster in Lab space, discard grey/background
   clusters, rank by pixel count and spatial spread. Each survivor becomes a proposed series
   with a swatch.

### 4. Tracing
Per colour: Lab-distance mask, minus the gridline mask, morphological close to heal antialiasing.
Then a **column scan** — for each x, take connected runs and their centroids. One run per column is
the common case and traces trivially.

Where that breaks — curve crossings, and the very common case of *several same-coloured impeller
trims in one frame* — a **path follower** takes over: seed from a click, march both directions, and
at each column pick the run that best continues the local slope (predicted by extrapolating the
last few points) within a jump gate, bridging gaps where labels or other curves cross over. One
click per trim curve, each traced independently.

Fully monochrome charts fall back to the same tracer over a darkness mask instead of a colour mask.
Dashed curves (NPSHr, usually) just need a wider bridge distance — exposed as a "dashed" toggle.

Traces are then resampled to N evenly-spaced x (default 50), with optional Douglas–Peucker simplify
and an adjustable smoothing strength — all non-destructive.

### 5. Correction — the part that decides whether the tool is actually pleasant
Canvas stage with wheel zoom, space/middle-drag pan, rendered at devicePixelRatio.

- **Tools**: move point · add · delete · **box-delete** (drag a rect, everything inside goes —
  the single most useful cleanup gesture) · **redraw segment** (freehand a stroke, it replaces the
  points across that x-range) · mask region (excluded from auto-trace).
- Live data HUD while dragging (`Q = 182.4 m³/h, H = 64.2 m`).
- Arrow-key nudge, fine nudge with a modifier.
- **Magnifier loupe** while placing calibration points, and clicks snap to detected ticks — axis
  calibration is where a 2 px slip becomes a 3% error, so it gets the pixel-accuracy treatment.
- **Undo/redo on a command stack** (`Ctrl+Z` / `Ctrl+Shift+Z`), non-negotiable for an editor.
- Series panel: rename, recolour, hide, lock, reassign axis, duplicate, reorder, delete.

### 6. Pump analysis
- **Fits** — least-squares polynomial (degree 2–4) for H(Q), P(Q), η(Q), NPSHr(Q), on centred and
  normalised Q for conditioning. Coefficients and R² shown.
- **BEP** — maximum of the efficiency fit; or, where η wasn't digitized, derived from
  η = ρgQH/P and maximised.
- **Cross-check** — when H, P and η are all present, compare the digitized η against ρgQH/P. A
  mismatch is a strong, cheap signal that a curve was assigned to the wrong axis or a calibration
  is off. Surfaced as a warning rather than a silent wrong answer.
- **Affinity laws** — rescale to a new speed or impeller diameter (Q∝N, H∝N², P∝N³), with the
  usual caveat noted in-UI that trim scaling is approximate. Rescaled set overlays the original.
- **System curve** — H = H_static + k·Qⁿ (n default 2); set k directly or from a known duty point.
- **Duty point** — bisection on (H_pump − H_sys), reading off η, P, and NPSH margin against an
  entered NPSHa.

All of it renders in an interactive result chart drawn with the app's own canvas plotter.

### 7. Export & persistence
CSV (long or wide), **TSV to clipboard** for a straight Excel paste, full-project JSON, resampled
curve table at N points, and PNG/SVG of the reconstructed chart.

Projects save as `.plotlog.json` (image embedded as a data URL, with a "save without image" option
when size matters), and **autosave to IndexedDB** — a refresh must never cost an hour of tracing.
Recent-projects list on the landing screen.

---

## Verification

- **Vitest units** — axis mapping across linear/log/skew, polyfit, BEP, affinity, duty-point solve,
  bezier flattening, resampling, unit conversion, and the tracer over synthetic masks.
- **Synthetic round-trip test** — the important one. Render a chart from *known* equations to a
  canvas, push it through the full pipeline, and assert the recovered points land within tolerance.
  This gives genuine end-to-end regression coverage with no copyright-encumbered fixtures.
- **Manual pass** on one real vector vendor PDF and one screenshot, checking a handful of points
  against values read by eye.
- `npm run dev` for local work; `npm run build && npm run preview` to verify the production bundle
  and the `base` path before pushing.

## Build order

Each milestone is independently shippable; the tool is genuinely usable from M1.

| | |
|---|---|
| **M0** | Scaffold, CI, Pages deploy — a live URL on day one |
| **M1** | Import, canvas stage, manual calibration, manual points, CSV export |
| **M2** | Vector PDF extraction + text-content axis reading |
| **M3** | Raster auto-detect: frame, sub-panels, grid, ticks, OCR, colours |
| **M4** | Auto-tracing, correction tools, undo/redo |
| **M5** | Pump analysis |
| **M6** | Project save/load, autosave, tests, polish |

## Deployment notes

- `vite.config.ts` → `base: '/plot-log/'` for a project Pages site.
- `.github/workflows/deploy.yml` → `configure-pages` + `upload-pages-artifact` + `deploy-pages`
  on push to `main`. **Repo Settings → Pages → Source must be set to "GitHub Actions" once, by
  hand.**
- pdf.js worker imported with `?url` so it is served from our own origin.
- Tesseract wasm core and a **trimmed** `eng` traineddata vendored under `public/tesseract/`
  (`workerPath`/`corePath`/`langPath` pointed at them) — no third-party CDN at runtime.

## Deliberately out of scope for v1

Phone photos and poor scans (perspective unwarp, adaptive threshold) · iso-efficiency islands ·
multi-pump comparison · NPSH-margin curves against system NPSHa curves · vendor-specific datasheet
templates.
