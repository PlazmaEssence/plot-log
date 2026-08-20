import { effect } from '@preact/signals';
import type { Vec2 } from '../geom/types';
import { checkpoint } from '../state/history';
import {
  activeSeriesId,
  addPoint,
  image,
  movePoint,
  removePoint,
  series,
  setCalibrationPixel,
  xAxis,
  yAxes,
} from '../state/project';
import type { AxisCal, Series } from '../state/project';
import { activeTool, calibrationArm, selectedPoint, view } from '../state/ui';

const POINT_RADIUS = 5;
const HIT_RADIUS = 9;
const MIN_SCALE = 0.05;
const MAX_SCALE = 24;
const AXIS_COLORS = ['#e0b23c', '#6ea8e0', '#5cb87a', '#e05c5c', '#c084fc'];
const BG = '#0e0f13';
const SELECT_STROKE = '#e8e6df';

type Drag =
  | { kind: 'pan'; startClient: Vec2; startOffset: Vec2 }
  | { kind: 'point'; seriesId: string; pointId: string };

/**
 * Imperative canvas renderer + interaction for the chart image, axis
 * calibration markers and digitized series points. Deliberately not a
 * component: this is the one part of the app where a framework buys nothing
 * and imperative control over exactly what redraws (and when) matters.
 */
export class Stage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private disposers: Array<() => void> = [];
  private resizeObserver: ResizeObserver;
  private drag: Drag | null = null;
  private pointerDownClient: Vec2 | null = null;
  private moved = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);

    this.disposers.push(effect(() => this.render()));
    this.disposers.push(
      effect(() => {
        const arm = calibrationArm.value;
        const tool = activeTool.value;
        canvas.style.cursor = arm ? 'crosshair' : tool === 'add-point' ? 'copy' : 'default';
      }),
    );

    this.resize();
  }

  destroy() {
    for (const dispose of this.disposers) dispose();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.render();
  }

  /** Scales and centers the image to fill the canvas. Call after loading a new image. */
  fitToView() {
    const img = image.value;
    const rect = this.canvas.getBoundingClientRect();
    if (!img || rect.width === 0 || rect.height === 0) return;
    const scale = Math.min(rect.width / img.width, rect.height / img.height) * 0.96;
    view.value = {
      scale,
      offsetX: (rect.width - img.width * scale) / 2,
      offsetY: (rect.height - img.height * scale) / 2,
    };
  }

  deleteSelected() {
    const sel = selectedPoint.value;
    if (!sel) return;
    checkpoint();
    removePoint(sel.seriesId, sel.pointId);
    selectedPoint.value = null;
  }

  // ---- coordinate transforms ----

  private imageToScreen(px: Vec2): Vec2 {
    const v = view.value;
    return { x: px.x * v.scale + v.offsetX, y: px.y * v.scale + v.offsetY };
  }

  private screenToImage(pt: Vec2): Vec2 {
    const v = view.value;
    return { x: (pt.x - v.offsetX) / v.scale, y: (pt.y - v.offsetY) / v.scale };
  }

  private clientToCanvas(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private hitTestPoint(canvasPt: Vec2): { seriesId: string; pointId: string } | null {
    let best: { seriesId: string; pointId: string; dist: number } | null = null;
    for (const s of series.value) {
      if (!s.visible || s.locked) continue;
      for (const p of s.points) {
        const screenPt = this.imageToScreen(p.px);
        const dist = Math.hypot(screenPt.x - canvasPt.x, screenPt.y - canvasPt.y);
        if (dist <= HIT_RADIUS && (!best || dist < best.dist)) {
          best = { seriesId: s.id, pointId: p.id, dist };
        }
      }
    }
    return best;
  }

  // ---- pointer / wheel / keyboard ----

  private onPointerDown = (e: PointerEvent) => {
    if (!image.value) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerDownClient = { x: e.clientX, y: e.clientY };
    this.moved = false;

    const canvasPt = this.clientToCanvas(e.clientX, e.clientY);
    const hit = this.hitTestPoint(canvasPt);
    if (hit) {
      checkpoint();
      this.drag = { kind: 'point', seriesId: hit.seriesId, pointId: hit.pointId };
      selectedPoint.value = hit;
      return;
    }

    const v = view.value;
    this.drag = {
      kind: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      startOffset: { x: v.offsetX, y: v.offsetY },
    };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    if (this.pointerDownClient) {
      const dx = e.clientX - this.pointerDownClient.x;
      const dy = e.clientY - this.pointerDownClient.y;
      if (Math.hypot(dx, dy) > 3) this.moved = true;
    }

    if (this.drag.kind === 'pan') {
      const { startClient, startOffset } = this.drag;
      view.value = {
        ...view.value,
        offsetX: startOffset.x + (e.clientX - startClient.x),
        offsetY: startOffset.y + (e.clientY - startClient.y),
      };
    } else {
      const imgPt = this.screenToImage(this.clientToCanvas(e.clientX, e.clientY));
      movePoint(this.drag.seriesId, this.drag.pointId, imgPt);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag) return;
    if (!this.moved && this.drag.kind === 'pan') {
      this.handleClick(this.clientToCanvas(e.clientX, e.clientY));
    }
    this.drag = null;
    this.pointerDownClient = null;
  };

  private handleClick(canvasPt: Vec2) {
    const img = image.value;
    if (!img) return;
    const imgPt = this.screenToImage(canvasPt);
    const inBounds = imgPt.x >= 0 && imgPt.y >= 0 && imgPt.x <= img.width && imgPt.y <= img.height;
    if (!inBounds) {
      selectedPoint.value = null;
      return;
    }

    const arm = calibrationArm.value;
    if (arm) {
      checkpoint();
      setCalibrationPixel(arm.axisId, arm.point, imgPt);
      calibrationArm.value = null;
      return;
    }

    if (activeTool.value === 'add-point') {
      const activeId = activeSeriesId.value;
      if (!activeId) return;
      checkpoint();
      const point = addPoint(activeId, imgPt);
      selectedPoint.value = { seriesId: activeId, pointId: point.id };
      return;
    }

    selectedPoint.value = null;
  }

  private onWheel = (e: WheelEvent) => {
    if (!image.value) return;
    e.preventDefault();
    const canvasPt = this.clientToCanvas(e.clientX, e.clientY);
    const v = view.value;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    const imgPt = this.screenToImage(canvasPt);
    view.value = {
      scale: nextScale,
      offsetX: canvasPt.x - imgPt.x * nextScale,
      offsetY: canvasPt.y - imgPt.y * nextScale,
    };
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    const sel = selectedPoint.value;
    if (!sel) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
      return;
    }

    const nudge: Record<string, Vec2> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const d = nudge[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const s = series.value.find((s) => s.id === sel.seriesId);
    const p = s?.points.find((p) => p.id === sel.pointId);
    if (!p) return;
    checkpoint();
    movePoint(sel.seriesId, sel.pointId, { x: p.px.x + d.x * step, y: p.px.y + d.y * step });
  };

  // ---- rendering ----

  private render() {
    const { ctx, canvas } = this;
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const img = image.value;
    if (!img) {
      ctx.restore();
      return;
    }

    const v = view.value;
    ctx.save();
    ctx.translate(v.offsetX, v.offsetY);
    ctx.scale(v.scale, v.scale);
    ctx.drawImage(img.bitmap, 0, 0);
    ctx.restore();

    this.drawAxisCalibration(xAxis.value, AXIS_COLORS[0]);
    yAxes.value.forEach((axis, i) => this.drawAxisCalibration(axis, AXIS_COLORS[i % AXIS_COLORS.length]));

    for (const s of series.value) {
      if (s.visible) this.drawSeries(s);
    }

    ctx.restore();
  }

  private drawAxisCalibration(axis: AxisCal, color: string) {
    for (const cp of [axis.p1, axis.p2]) {
      if (!cp) continue;
      const pt = this.imageToScreen(cp.px);
      const { ctx } = this;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pt.x - 7, pt.y);
      ctx.lineTo(pt.x + 7, pt.y);
      ctx.moveTo(pt.x, pt.y - 7);
      ctx.lineTo(pt.x, pt.y + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawSeries(s: Series) {
    const { ctx } = this;
    if (s.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const pt = this.imageToScreen(p.px);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    const sel = selectedPoint.value;
    for (const p of s.points) {
      const pt = this.imageToScreen(p.px);
      const isSelected = sel?.seriesId === s.id && sel.pointId === p.id;
      ctx.beginPath();
      ctx.fillStyle = s.color;
      ctx.arc(pt.x, pt.y, isSelected ? POINT_RADIUS + 2 : POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = SELECT_STROKE;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
