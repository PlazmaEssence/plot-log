import { signal } from '@preact/signals';

/**
 * Transient, non-undoable UI state: which tool is active, the canvas pan/zoom,
 * and the current point selection. Kept separate from ./project.ts so that
 * panning around or clicking a point never pushes a step onto the undo stack.
 */

export type Tool = 'view' | 'add-point';

export const activeTool = signal<Tool>('view');

/** Set while the user has clicked "Pick" for one calibration point; the next canvas click consumes it. */
export interface CalibrationArm {
  axisId: string;
  point: 'p1' | 'p2';
}

export const calibrationArm = signal<CalibrationArm | null>(null);

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const view = signal<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });

export interface PointSelection {
  seriesId: string;
  pointId: string;
}

export const selectedPoint = signal<PointSelection | null>(null);

export function resetUi() {
  activeTool.value = 'view';
  calibrationArm.value = null;
  view.value = { scale: 1, offsetX: 0, offsetY: 0 };
  selectedPoint.value = null;
}
