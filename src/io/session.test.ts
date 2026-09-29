import { describe, expect, it } from 'vitest';
import { ImportError } from './import';
import { buildSessionZip, readProjectFile } from './session';
import { readZip, buildZip } from './zip';
import { activeSeriesId, series, xAxis, yAxes } from '../state/project';
import type { AxisCal, ProjectImageData, Series } from '../state/project';

function fakeAxis(role: 'x' | 'y'): AxisCal {
  return {
    id: `${role}-axis`,
    role,
    name: role === 'x' ? 'Flow' : 'Head',
    unit: role === 'x' ? 'm³/h' : 'm',
    scale: 'linear',
    p1: { px: { x: 10, y: 400 }, value: 0 },
    p2: { px: { x: 500, y: 400 }, value: 300 },
  };
}

function fakeSeries(yAxisId: string): Series {
  return {
    id: 'series-1',
    label: 'Ø219 mm',
    color: '#e0b23c',
    yAxisId,
    points: [
      { id: 'pt-1', px: { x: 12, y: 50 } },
      { id: 'pt-2', px: { x: 300, y: 120 } },
    ],
    visible: true,
    locked: false,
  };
}

describe('buildSessionZip', () => {
  it('embeds the exact original image bytes and the full project state', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]); // fake PNG-ish bytes
    const blob = new Blob([imageBytes], { type: 'image/png' });
    const yAxis = fakeAxis('y');
    const img = {
      bitmap: {} as ImageBitmap, // unused by buildSessionZip
      width: 800,
      height: 600,
      name: 'pump-curve.png',
      blob,
    } satisfies ProjectImageData;

    // Point the module's live signals at our fixture state before building —
    // buildSessionZip reads xAxis/yAxes/series/activeSeriesId directly, not as arguments.
    xAxis.value = fakeAxis('x');
    yAxes.value = [yAxis];
    series.value = [fakeSeries(yAxis.id)];
    activeSeriesId.value = 'series-1';

    const zipBlob = await buildSessionZip(img);
    const entries = readZip(new Uint8Array(await zipBlob.arrayBuffer()));

    expect(entries.get('image.png')).toEqual(imageBytes);

    const parsed = readProjectFile(entries);
    expect(parsed.image).toEqual({ name: 'pump-curve.png', mime: 'image/png', width: 800, height: 600 });
    expect(parsed.xAxis.name).toBe('Flow');
    expect(parsed.yAxes).toHaveLength(1);
    expect(parsed.series).toHaveLength(1);
    expect(parsed.series[0].points).toHaveLength(2);
    expect(parsed.activeSeriesId).toBe('series-1');
  });
});

describe('readProjectFile', () => {
  it('rejects an archive with no project.json', () => {
    const archive = buildZip([{ name: 'image.png', data: new Uint8Array([1]) }]);
    const entries = readZip(archive);
    expect(() => readProjectFile(entries)).toThrow(ImportError);
  });

  it('rejects corrupt JSON', () => {
    const archive = buildZip([
      { name: 'project.json', data: new TextEncoder().encode('{not json') },
    ]);
    expect(() => readProjectFile(readZip(archive))).toThrow(ImportError);
  });

  it('rejects a project.json missing required fields', () => {
    const archive = buildZip([
      { name: 'project.json', data: new TextEncoder().encode(JSON.stringify({ version: 1 })) },
    ]);
    expect(() => readProjectFile(readZip(archive))).toThrow(ImportError);
  });

  it('rejects a session saved by a newer, unsupported version', () => {
    const archive = buildZip([
      {
        name: 'project.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            version: 999,
            image: { name: 'a.png', mime: 'image/png', width: 1, height: 1 },
            xAxis: fakeAxis('x'),
            yAxes: [fakeAxis('y')],
            series: [],
            activeSeriesId: null,
          }),
        ),
      },
    ]);
    expect(() => readProjectFile(readZip(archive))).toThrow(ImportError);
  });
});
