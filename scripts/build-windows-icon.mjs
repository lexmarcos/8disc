import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const logoPath = resolve(root, 'static', 'Logo.svg');
const iconPath = resolve(root, 'src-tauri', 'icons', 'icon.ico');
const viewBoxSize = 650;
const iconSizes = [16, 32, 48, 64, 128, 256];
const background = { r: 0x17, g: 0x13, b: 0xc8, a: 0xff };
const foreground = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

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

const images = iconSizes.map((size) => createIcoImage(size, rects));
const headerSize = 6 + images.length * 16;
let imageOffset = headerSize;
const fileParts = [Buffer.alloc(headerSize)];
const directory = fileParts[0];

directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);

images.forEach((image, index) => {
  const entryOffset = 6 + index * 16;
  directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset);
  directory.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset + 1);
  directory.writeUInt8(0, entryOffset + 2);
  directory.writeUInt8(0, entryOffset + 3);
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(image.buffer.length, entryOffset + 8);
  directory.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += image.buffer.length;
  fileParts.push(image.buffer);
});

writeFileSync(iconPath, Buffer.concat(fileParts));

function createIcoImage(size, logoRects) {
  const pixelData = Buffer.alloc(size * size * 4);

  fillRect(pixelData, size, 0, 0, size, size, background);

  for (const rect of logoRects) {
    const left = Math.max(0, Math.floor((rect.left / viewBoxSize) * size));
    const right = Math.min(size, Math.ceil((rect.right / viewBoxSize) * size));
    const top = Math.max(0, Math.floor((rect.top / viewBoxSize) * size));
    const bottom = Math.min(size, Math.ceil((rect.bottom / viewBoxSize) * size));
    fillRect(pixelData, size, left, top, right, bottom, foreground);
  }

  const rowMaskBytes = Math.ceil(size / 32) * 4;
  const maskData = Buffer.alloc(rowMaskBytes * size);
  const bitmapHeader = Buffer.alloc(40);

  bitmapHeader.writeUInt32LE(40, 0);
  bitmapHeader.writeInt32LE(size, 4);
  bitmapHeader.writeInt32LE(size * 2, 8);
  bitmapHeader.writeUInt16LE(1, 12);
  bitmapHeader.writeUInt16LE(32, 14);
  bitmapHeader.writeUInt32LE(0, 16);
  bitmapHeader.writeUInt32LE(pixelData.length, 20);
  bitmapHeader.writeInt32LE(0, 24);
  bitmapHeader.writeInt32LE(0, 28);
  bitmapHeader.writeUInt32LE(0, 32);
  bitmapHeader.writeUInt32LE(0, 36);

  return {
    size,
    buffer: Buffer.concat([bitmapHeader, flipRows(pixelData, size), maskData])
  };
}

function fillRect(buffer, size, left, top, right, bottom, color) {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * size + x) * 4;
      buffer[offset] = color.b;
      buffer[offset + 1] = color.g;
      buffer[offset + 2] = color.r;
      buffer[offset + 3] = color.a;
    }
  }
}

function flipRows(buffer, size) {
  const rowBytes = size * 4;
  const flipped = Buffer.alloc(buffer.length);

  for (let y = 0; y < size; y += 1) {
    const sourceStart = y * rowBytes;
    const targetStart = (size - 1 - y) * rowBytes;
    buffer.copy(flipped, targetStart, sourceStart, sourceStart + rowBytes);
  }

  return flipped;
}
