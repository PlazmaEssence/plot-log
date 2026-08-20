import { signal } from '@preact/signals';
import type { Vec2 } from '../geom/types';
import type { CalibrationPoint, Scale } from '../geom/axis';

/**
 * The project's domain state — everything that gets saved, undone, and exported.
 * Transient UI-only state (active tool, pan/zoom, selection) lives in ./ui.ts
 * instead, so panning the canvas doesn't get pushed onto the undo stack.
 *
 * Series points are stored in image-pixel space, never in data space — see the
 * README for why. Values are only ever derived through the axis calibration,
 * on read (geom/axis.ts, io/export.ts), so re-calibrating an axis instantly
 * recomputes every number without re-touching a single point.
 */

export interface AxisCal {
  id: string;
  role: 'x' | 'y';
  name: string;
  unit: string;
  scale: Scale;
  p1: CalibrationPoint | null;
  p2: CalibrationPoint | null;
}

export interface SeriesPoint {
  id: string;
  px: Vec2;
}

export interface Series {
  id: string;
  label: string;
  color: string;
  yAxisId: string;
  points: SeriesPoint[];
  visible: boolean;
  locked: boolean;
}

export interface ProjectImageData {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  name: string;
}

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export const SERIES_PALETTE = [
  '#e0b23c',
  '#e05c5c',
  '#5cb87a',
  '#6ea8e0',
  '#c084fc',
  '#f0a868',
];

function createDefaultXAxis(): AxisCal {
  return {
    id: nextId('axis'),
    role: 'x',
    name: 'Flow',
    unit: 'm³/h',
    scale: 'linear',
    p1: null,
    p2: null,
  };
}

function createDefaultYAxis(name = 'Head', unit = 'm'): AxisCal {
  return {
    id: nextId('axis'),
    role: 'y',
    name,
    unit,
    scale: 'linear',
    p1: null,
    p2: null,
  };
}

export const image = signal<ProjectImageData | null>(null);
export const xAxis = signal<AxisCal>(createDefaultXAxis());
export const yAxes = signal<AxisCal[]>([createDefaultYAxis()]);
export const series = signal<Series[]>([]);
export const activeSeriesId = signal<string | null>(null);

export function setImage(next: ProjectImageData | null) {
  image.value?.bitmap.close();
  image.value = next;
}

export function addYAxis(name?: string, unit?: string): AxisCal {
  const axis = createDefaultYAxis(name ?? `Axis ${yAxes.value.length + 1}`, unit ?? '');
  yAxes.value = [...yAxes.value, axis];
  return axis;
}

export function removeYAxis(id: string) {
  if (yAxes.value.length <= 1) return;
  const remaining = yAxes.value.filter((a) => a.id !== id);
  yAxes.value = remaining;
  const fallbackId = remaining[0].id;
  series.value = series.value.map((s) => (s.yAxisId === id ? { ...s, yAxisId: fallbackId } : s));
}

export function updateXAxis(patch: Partial<AxisCal>) {
  xAxis.value = { ...xAxis.value, ...patch };
}

export function updateYAxis(id: string, patch: Partial<AxisCal>) {
  yAxes.value = yAxes.value.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

/** Records the pixel half of a calibration point (picked on the canvas). Leaves its value untouched. */
export function setCalibrationPixel(axisId: string, which: 'p1' | 'p2', px: Vec2) {
  const patch = (axis: AxisCal): AxisCal => ({
    ...axis,
    [which]: { px, value: axis[which]?.value ?? 0 },
  });
  if (xAxis.value.id === axisId) {
    xAxis.value = patch(xAxis.value);
    return;
  }
  yAxes.value = yAxes.value.map((a) => (a.id === axisId ? patch(a) : a));
}

/** Records the data-value half of a calibration point (typed into a field). Leaves its pixel untouched. */
export function setCalibrationValue(axisId: string, which: 'p1' | 'p2', value: number) {
  const patch = (axis: AxisCal): AxisCal => {
    const existing = axis[which];
    return existing ? { ...axis, [which]: { ...existing, value } } : axis;
  };
  if (xAxis.value.id === axisId) {
    xAxis.value = patch(xAxis.value);
    return;
  }
  yAxes.value = yAxes.value.map((a) => (a.id === axisId ? patch(a) : a));
}

export function addSeries(label?: string): Series {
  const used = new Set(series.value.map((s) => s.color));
  const color =
    SERIES_PALETTE.find((c) => !used.has(c)) ??
    SERIES_PALETTE[series.value.length % SERIES_PALETTE.length];
  const s: Series = {
    id: nextId('series'),
    label: label ?? `Series ${series.value.length + 1}`,
    color,
    yAxisId: yAxes.value[0].id,
    points: [],
    visible: true,
    locked: false,
  };
  series.value = [...series.value, s];
  activeSeriesId.value = s.id;
  return s;
}

export function updateSeries(id: string, patch: Partial<Series>) {
  series.value = series.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function removeSeries(id: string) {
  series.value = series.value.filter((s) => s.id !== id);
  if (activeSeriesId.value === id) {
    activeSeriesId.value = series.value[0]?.id ?? null;
  }
}

function sortedByX(points: SeriesPoint[]): SeriesPoint[] {
  return [...points].sort((a, b) => a.px.x - b.px.x);
}

export function addPoint(seriesId: string, px: Vec2): SeriesPoint {
  const point: SeriesPoint = { id: nextId('pt'), px };
  series.value = series.value.map((s) =>
    s.id === seriesId ? { ...s, points: sortedByX([...s.points, point]) } : s,
  );
  return point;
}

export function movePoint(seriesId: string, pointId: string, px: Vec2) {
  series.value = series.value.map((s) =>
    s.id === seriesId
      ? { ...s, points: sortedByX(s.points.map((p) => (p.id === pointId ? { ...p, px } : p))) }
      : s,
  );
}

export function removePoint(seriesId: string, pointId: string) {
  series.value = series.value.map((s) =>
    s.id === seriesId ? { ...s, points: s.points.filter((p) => p.id !== pointId) } : s,
  );
}

export function resetProject() {
  setImage(null);
  xAxis.value = createDefaultXAxis();
  yAxes.value = [createDefaultYAxis()];
  series.value = [];
  activeSeriesId.value = null;
}
