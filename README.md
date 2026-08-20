# Plot Log

Digitize pump performance curves from an image — right in your browser. Drop in a chart,
calibrate the axes, trace the curves, export the numbers. No backend, no upload, no build
step needed to run it locally — everything runs client-side and deploys as a static site.

Live: `https://plazmaessence.github.io/plot-log/` (once GitHub Pages is enabled — see below).

## Why

Pump datasheets almost always arrive as a picture, and pump charts are awkward for generic
digitizers: they carry several Y axes at once (head, power, efficiency, NPSHr), often as
stacked sub-panels sharing one flow axis. Plot Log is built around that shape from the start —
multiple, independently-calibrated Y axes and multiple series per chart — and, once the curves
are digitized, does the pump engineering on top (fits, best-efficiency point, affinity-law
rescaling, system curve, duty point).

See [`PLAN.md`](./PLAN.md) for the full design and the milestone roadmap (this is milestone M1:
import, manual calibration, manual point placement, CSV/JSON export — the auto-detection,
tracing, and pump analysis milestones are still ahead).

## How points are stored

Series points are kept in **image pixel space**, never in data space. Data values are only ever
derived through the current axis calibration, on read. Re-calibrate an axis — or fix a mistake in
one of its two calibration points — and every value recomputes instantly, without touching a
single point.

## Development

```
npm install
npm run dev       # local dev server with HMR
npm run build     # typecheck + production build to dist/
npm run preview   # serve the production build locally
npm test          # vitest
```

Stack: [Preact](https://preactjs.com/) + [`@preact/signals`](https://preactjs.com/guide/v10/signals/)
for the UI panels, a plain imperative `<canvas>` renderer for the chart stage (no framework
overhead where pixel-level control and 60fps interaction matter), [Vite](https://vite.dev/) for
the build, [Vitest](https://vitest.dev/) for tests. No CDN dependencies — everything ships bundled
so the app keeps working offline.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), which
builds and publishes `dist/` to GitHub Pages via Actions.

**One-time setup required:** in this repo's Settings → Pages, set Source to "GitHub Actions".
GitHub Pages also requires the repository to be public (or a paid plan for a private repo).
