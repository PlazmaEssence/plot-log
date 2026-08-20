import type { Vec2 } from './types';

export type Scale = 'linear' | 'log';

export interface CalibrationPoint {
  /** The pixel coordinate the user clicked, in full image space. */
  px: Vec2;
  /** The data value they said that pixel corresponds to. */
  value: number;
}

/** A single axis's two calibration points, reduced to the one pixel coordinate that matters for it. */
export interface AxisCalibration {
  scale: Scale;
  p1: { px: number; value: number };
  p2: { px: number; value: number };
}

export interface CalibratableAxis {
  role: 'x' | 'y';
  scale: Scale;
  p1: CalibrationPoint | null;
  p2: CalibrationPoint | null;
}

/**
 * Reduces an axis's two (2-D image-space) calibration points down to the scalar
 * pixel coordinate along that axis's own direction, and validates them. Returns
 * null while calibration is incomplete or degenerate (identical pixels, or a
 * non-positive value on a log axis).
 */
export function toCalibration(axis: CalibratableAxis): AxisCalibration | null {
  if (!axis.p1 || !axis.p2) return null;
  const coord = (v: Vec2) => (axis.role === 'x' ? v.x : v.y);
  const p1px = coord(axis.p1.px);
  const p2px = coord(axis.p2.px);
  if (p1px === p2px) return null;
  if (axis.scale === 'log' && (axis.p1.value <= 0 || axis.p2.value <= 0)) return null;
  return {
    scale: axis.scale,
    p1: { px: p1px, value: axis.p1.value },
    p2: { px: p2px, value: axis.p2.value },
  };
}

/** Maps an image-pixel coordinate (along the axis's own direction) to a data value. */
export function pxToValue(cal: AxisCalibration, px: number): number {
  const t = (px - cal.p1.px) / (cal.p2.px - cal.p1.px);
  if (cal.scale === 'log') {
    const v1 = Math.log(cal.p1.value);
    const v2 = Math.log(cal.p2.value);
    return Math.exp(v1 + t * (v2 - v1));
  }
  return cal.p1.value + t * (cal.p2.value - cal.p1.value);
}

/** Maps a data value to an image-pixel coordinate — the inverse of {@link pxToValue}. */
export function valueToPx(cal: AxisCalibration, value: number): number {
  if (cal.scale === 'log') {
    const v1 = Math.log(cal.p1.value);
    const v2 = Math.log(cal.p2.value);
    const t = (Math.log(value) - v1) / (v2 - v1);
    return cal.p1.px + t * (cal.p2.px - cal.p1.px);
  }
  const t = (value - cal.p1.value) / (cal.p2.value - cal.p1.value);
  return cal.p1.px + t * (cal.p2.px - cal.p1.px);
}
