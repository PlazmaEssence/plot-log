import { describe, expect, it } from 'vitest';
import { ZipError, buildZip, crc32, readZip } from './zip';

describe('zip round-trip', () => {
  it('reads back exactly what was written, byte for byte', () => {
    const a = new TextEncoder().encode('{"hello":"world"}');
    const b = new Uint8Array(256);
    for (let i = 0; i < b.length; i++) b[i] = i;

    const archive = buildZip([
      { name: 'project.json', data: a },
      { name: 'image.png', data: b },
    ]);
    const entries = readZip(archive);

    expect(entries.size).toBe(2);
    expect(entries.get('project.json')).toEqual(a);
    expect(entries.get('image.png')).toEqual(b);
  });

  it('round-trips an empty file', () => {
    const archive = buildZip([{ name: 'empty.txt', data: new Uint8Array(0) }]);
    expect(readZip(archive).get('empty.txt')).toEqual(new Uint8Array(0));
  });

  it('round-trips names with unicode and nested-looking paths', () => {
    const data = new TextEncoder().encode('x');
    const archive = buildZip([{ name: 'assets/pump curve — 219mm.txt', data }]);
    expect(readZip(archive).get('assets/pump curve — 219mm.txt')).toEqual(data);
  });

  it('rejects a non-zip buffer', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(ZipError);
  });

  it('crc32 is deterministic and sensitive to content', () => {
    const a = crc32(new TextEncoder().encode('hello'));
    const b = crc32(new TextEncoder().encode('hello'));
    const c = crc32(new TextEncoder().encode('hellp'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
