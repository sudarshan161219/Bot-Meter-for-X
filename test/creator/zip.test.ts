import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from '../../src/creator/thread-exporter/zip';

// Reads entries back by walking the central directory, as unzip tools do.
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    out.push({ name, crc, data: zip.subarray(start, start + size) });
    at += 46 + nameLength;
  }
  return out;
}

describe('createZip', () => {
  it('computes the standard CRC-32', () => {
    const data = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
    expect(crc32(data)).toBe(0x414fa339);
    expect(crc32(data)).toBe(nodeCrc32(data));
  });

  it('writes entries a ZIP reader can find, with matching data and CRCs', () => {
    const a = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const b = new TextEncoder().encode('second file ✓');
    const entries = readZip(createZip([{ name: 'slide-01.png', data: a }, { name: 'notes ✓.txt', data: b }]));
    expect(entries.map((e) => e.name)).toEqual(['slide-01.png', 'notes ✓.txt']);
    expect([...entries[0]!.data]).toEqual([...a]);
    expect(new TextDecoder().decode(entries[1]!.data)).toBe('second file ✓');
    for (const e of entries) expect(e.crc).toBe(nodeCrc32(e.data));
  });
});
