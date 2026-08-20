import { pxToValue, toCalibration } from '../geom/axis';
import type { AxisCal, Series } from '../state/project';

export interface ResolvedPoint {
  x: number | null;
  y: number | null;
}

/** Runs a series's raw pixel points through both axes' calibrations to get real data values. */
export function resolveSeriesPoints(xAxis: AxisCal, yAxis: AxisCal, s: Series): ResolvedPoint[] {
  const xCal = toCalibration(xAxis);
  const yCal = toCalibration(yAxis);
  return s.points.map((p) => ({
    x: xCal ? pxToValue(xCal, p.px.x) : null,
    y: yCal ? pxToValue(yCal, p.px.y) : null,
  }));
}

function axisLabel(axis: AxisCal): string {
  return axis.unit ? `${axis.name} (${axis.unit})` : axis.name;
}

function formatNum(v: number | null): string {
  return v === null || Number.isNaN(v) ? '' : String(v);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * One row per point, across every series — "long" format. This is the only
 * layout that's always valid regardless of how many series or Y-axes a
 * project has, since different series generally have different x-samples.
 */
export function buildLongCsv(xAxis: AxisCal, allYAxes: AxisCal[], seriesList: Series[]): string {
  const rows: string[][] = [['Series', axisLabel(xAxis), 'Value', 'Axis']];
  for (const s of seriesList) {
    const yAxis = allYAxes.find((a) => a.id === s.yAxisId);
    if (!yAxis) continue;
    const yLabel = axisLabel(yAxis);
    for (const r of resolveSeriesPoints(xAxis, yAxis, s)) {
      rows.push([s.label, formatNum(r.x), formatNum(r.y), yLabel]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Two tab-separated columns for one series — pastes straight into an Excel sheet. */
export function buildSeriesTsv(xAxis: AxisCal, yAxis: AxisCal, s: Series): string {
  const header = `${axisLabel(xAxis)}\t${axisLabel(yAxis)}`;
  const rows = resolveSeriesPoints(xAxis, yAxis, s).map((r) => `${formatNum(r.x)}\t${formatNum(r.y)}`);
  return [header, ...rows].join('\n');
}

/**
 * Full project as JSON: axes, series and their raw pixel points. Does not
 * embed the source image yet (see the M6 milestone for save/reload with the
 * image included) — reopening a project still needs the image re-attached.
 */
export function buildProjectJson(xAxis: AxisCal, allYAxes: AxisCal[], seriesList: Series[]): string {
  return JSON.stringify({ version: 1, xAxis, yAxes: allYAxes, series: seriesList }, null, 2);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime: string) {
  download(new Blob([text], { type: mime }), filename);
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
