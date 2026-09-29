/**
 * Minimal dependency-free ZIP reader/writer, store method only (no
 * compression). Mirrors the hand-rolled ZIP writer used across the Egg Tools
 * sister site (photo-kmz, kml-to-excel) rather than pulling in a library for
 * something this small and self-contained. Store-only keeps the reader
 * trivial too — there's no deflate to implement, just byte copies — and a
 * session's image is already a compressed format (PNG/JPEG), so there's
 * little to gain from deflating the archive on top of it.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_FILE_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time fields for the local/central headers — informational only, nothing reads it back. */
function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_FILE_SIG, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed size
    local.setUint32(22, size, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra length
    localParts.push(new Uint8Array(local.buffer), nameBytes, entry.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, CENTRAL_DIR_SIG, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true); // flags
    central.setUint16(10, 0, true); // method: store
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra length
    central.setUint16(32, 0, true); // comment length
    central.setUint16(34, 0, true); // disk number start
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, offset, true); // offset of local header
    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralDirSize = centralParts.reduce((n, p) => n + p.length, 0);
  const centralDirOffset = offset;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, EOCD_SIG, true);
  eocd.setUint16(4, 0, true); // disk number
  eocd.setUint16(6, 0, true); // central dir start disk
  eocd.setUint16(8, entries.length, true); // records on this disk
  eocd.setUint16(10, entries.length, true); // total records
  eocd.setUint32(12, centralDirSize, true);
  eocd.setUint32(16, centralDirOffset, true);
  eocd.setUint16(20, 0, true); // comment length

  const total = offset + centralDirSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, new Uint8Array(eocd.buffer)]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

export class ZipError extends Error {}

/** Reads back an archive written by {@link buildZip}. Throws {@link ZipError} on anything else. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(bytes.length - 22, true) !== EOCD_SIG) {
    throw new ZipError('Not a valid session file (missing end-of-directory record).');
  }
  const eocdOffset = bytes.length - 22;
  const recordCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let pos = centralDirOffset;

  for (let i = 0; i < recordCount; i++) {
    if (view.getUint32(pos, true) !== CENTRAL_DIR_SIG) {
      throw new ZipError('Not a valid session file (corrupt central directory).');
    }
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));

    if (method !== 0) {
      throw new ZipError(`"${name}" uses a compression method this reader doesn't support.`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));

    pos += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
