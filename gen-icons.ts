// Generates minimal PNG icons for the extension manifest.
// Run: npx tsx gen-icons.ts

import { writeFileSync, mkdirSync } from "fs";
import zlib from "zlib";

function createPng(size: number): Buffer {
  const bg = [15, 15, 19]; // #0f0f13
  const fg = [99, 102, 241]; // #6366f1

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 3;

  // Build raw RGBA pixel data with filter bytes
  const rawRows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + RGBA per pixel
    row[0] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
      const color = inside ? fg : bg;
      const offset = 1 + x * 4;
      row[offset] = color[0];
      row[offset + 1] = color[1];
      row[offset + 2] = color[2];
      row[offset + 3] = 255;
    }
    rawRows.push(row);
  }

  const raw = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(raw);

  // PNG file structure
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type: string, data: Buffer): Buffer {
    const typeB = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("static/icons", { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPng(size);
  writeFileSync(`static/icons/icon${size}.png`, png);
  console.log(`Created icon${size}.png`);
}
