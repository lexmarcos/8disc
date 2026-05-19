import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const logoPath = resolve(root, 'static', 'Logo.svg');
const iconsDir = resolve(root, 'src-tauri', 'icons');
const viewBoxSize = 650;
const icons = [
  { size: 32, filename: '32x32.png' },
  { size: 128, filename: '128x128.png' },
  { size: 256, filename: '128x128@2x.png' },
  { size: 256, filename: '256x256.png' },
  { size: 512, filename: '512x512.png' }
];
const background = { r: 0x17, g: 0x13, b: 0xc8, a: 0xff };
const foreground = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };
const crcTable = createCrcTable();

const svg = readFileSync(logoPath, 'utf8');
const rects = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)H([\d.]+)V([\d.]+)H([\d.]+)V([\d.]+)Z" fill="white"\/>/g)].map(
  ([, startX, startY, firstX, firstY, secondX, secondY]) => {
    const xs = [Number(startX), Number(firstX), Number(secondX)];
    const ys = [Number(startY), Number(firstY), Number(secondY)];

    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys)
    };
  }
);

if (!rects.length) {
  throw new Error(`No white logo paths found in ${logoPath}`);
}

mkdirSync(iconsDir, { recursive: true });

for (const icon of icons) {
  writeFileSync(resolve(iconsDir, icon.filename), createPng(icon.size, rects));
}

function createPng(size, logoRects) {
  const pixelData = Buffer.alloc(size * size * 4);

  fillRect(pixelData, size, 0, 0, size, size, background);

  for (const rect of logoRects) {
    const left = Math.max(0, Math.floor((rect.left / viewBoxSize) * size));
    const right = Math.min(size, Math.ceil((rect.right / viewBoxSize) * size));
    const top = Math.max(0, Math.floor((rect.top / viewBoxSize) * size));
    const bottom = Math.min(size, Math.ceil((rect.bottom / viewBoxSize) * size));
    fillRect(pixelData, size, left, top, right, bottom, foreground);
  }

  const stride = size * 4;
  const scanlines = Buffer.alloc(size * (stride + 1));

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0;
    pixelData.copy(scanlines, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  header.writeUInt8(0, 10);
  header.writeUInt8(0, 11);
  header.writeUInt8(0, 12);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(scanlines)),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function fillRect(buffer, size, left, top, right, bottom, color) {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * size + x) * 4;
      buffer[offset] = color.r;
      buffer[offset + 1] = color.g;
      buffer[offset + 2] = color.b;
      buffer[offset + 3] = color.a;
    }
  }
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let value = 0; value < table.length; value += 1) {
    let crc = value;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[value] = crc >>> 0;
  }

  return table;
}
