import { computed, signal } from '@preact/signals';
import { activeSeriesId, series, xAxis, yAxes } from './project';
import type { AxisCal, Series } from './project';

/**
 * Undo/redo for the project's domain state, as a snapshot-per-checkpoint stack
 * rather than an op-based command pattern: every mutation would otherwise need
 * a matching hand-written inverse. Projects here are small (a handful of axes,
 * at most a few hundred points), so cloning the plain-object state is cheap.
 * Worth revisiting if that stops being true.
 */

interface Snapshot {
  xAxis: AxisCal;
  yAxes: AxisCal[];
  series: Series[];
  activeSeriesId: string | null;
}

function snapshot(): Snapshot {
  return {
    xAxis: xAxis.value,
    yAxes: yAxes.value,
    series: series.value,
    activeSeriesId: activeSeriesId.value,
  };
}

function restore(s: Snapshot) {
  xAxis.value = s.xAxis;
  yAxes.value = s.yAxes;
  series.value = s.series;
  activeSeriesId.value = s.activeSeriesId;
}

const MAX_HISTORY = 100;
const undoStack = signal<Snapshot[]>([]);
const redoStack = signal<Snapshot[]>([]);
let suppress = false;

/**
 * Call once, right before a mutation that should be undoable (calibration
 * edits, point add/move/delete, series edits — not image import, and not pan
 * or zoom). Pushes the state *as it is right now* as the undo point, then
 * clears the redo stack.
 */
export function checkpoint() {
  if (suppress) return;
  const next = [...undoStack.value, snapshot()];
  undoStack.value = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
  redoStack.value = [];
}

export function undo() {
  const stack = undoStack.value;
  if (stack.length === 0) return;
  const prev = stack[stack.length - 1];
  suppress = true;
  redoStack.value = [...redoStack.value, snapshot()];
  undoStack.value = stack.slice(0, -1);
  restore(prev);
  suppress = false;
}

export function redo() {
  const stack = redoStack.value;
  if (stack.length === 0) return;
  const next = stack[stack.length - 1];
  suppress = true;
  undoStack.value = [...undoStack.value, snapshot()];
  redoStack.value = stack.slice(0, -1);
  restore(next);
  suppress = false;
}

export const canUndo = computed(() => undoStack.value.length > 0);
export const canRedo = computed(() => redoStack.value.length > 0);

export function clearHistory() {
  undoStack.value = [];
  redoStack.value = [];
}
