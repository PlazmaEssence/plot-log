import { describe, expect, it } from 'vitest';
import { pxToValue, toCalibration, valueToPx } from './axis';
import type { CalibratableAxis } from './axis';

describe('linear calibration', () => {
  const axis: CalibratableAxis = {
    role: 'x',
    scale: 'linear',
    p1: { px: { x: 100, y: 0 }, value: 0 },
    p2: { px: { x: 500, y: 0 }, value: 400 },
  };
  const cal = toCalibration(axis)!;

  it('maps pixel to value linearly', () => {
    expect(pxToValue(cal, 100)).toBeCloseTo(0);
    expect(pxToValue(cal, 500)).toBeCloseTo(400);
    expect(pxToValue(cal, 300)).toBeCloseTo(200);
  });

  it('round-trips value -> px -> value', () => {
    for (const v of [0, 37.5, 200, 400]) {
      expect(pxToValue(cal, valueToPx(cal, v))).toBeCloseTo(v);
    }
  });

  it('extrapolates beyond the calibrated range', () => {
    expect(pxToValue(cal, 700)).toBeCloseTo(600);
  });
});

describe('log calibration', () => {
  const axis: CalibratableAxis = {
    role: 'y',
    scale: 'log',
    p1: { px: { x: 0, y: 600 }, value: 1 },
    p2: { px: { x: 0, y: 100 }, value: 100 },
  };
  const cal = toCalibration(axis)!;

  it('maps pixel to value on a log scale', () => {
    expect(pxToValue(cal, 600)).toBeCloseTo(1);
    expect(pxToValue(cal, 100)).toBeCloseTo(100);
    expect(pxToValue(cal, 350)).toBeCloseTo(10);
  });

  it('round-trips value -> px -> value', () => {
    for (const v of [1, 5, 50, 100]) {
      expect(pxToValue(cal, valueToPx(cal, v))).toBeCloseTo(v);
    }
  });
});

describe('toCalibration', () => {
  it('is null until both points are set', () => {
    expect(
      toCalibration({ role: 'x', scale: 'linear', p1: null, p2: null }),
    ).toBeNull();
    expect(
      toCalibration({
        role: 'x',
        scale: 'linear',
        p1: { px: { x: 10, y: 0 }, value: 0 },
        p2: null,
      }),
    ).toBeNull();
  });

  it('is null when the two pixels coincide', () => {
    expect(
      toCalibration({
        role: 'x',
        scale: 'linear',
        p1: { px: { x: 10, y: 0 }, value: 0 },
        p2: { px: { x: 10, y: 0 }, value: 100 },
      }),
    ).toBeNull();
  });

  it('is null for a log axis with a non-positive value', () => {
    expect(
      toCalibration({
        role: 'y',
        scale: 'log',
        p1: { px: { x: 0, y: 600 }, value: 0 },
        p2: { px: { x: 0, y: 100 }, value: 100 },
      }),
    ).toBeNull();
  });
});
