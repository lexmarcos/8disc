<p align="center">
  <img src="https://i.imgur.com/Q8WxIFi.png" alt="8disc logo" width="780" />
</p>

<p align="center">
  A local video compressor for making files fit Discord upload limits.
</p>

## About

8disc compresses videos directly in the browser using FFmpeg WASM. It is designed for quick, local MP4 compression without uploading your files to a server.

## Features

- Compress videos locally in the browser
- Desktop compression with native FFmpeg through Tauri
- Target common Discord-friendly sizes: 8 MB, 16 MB, 25 MB, 50 MB, and 100 MB
- Drag-and-drop video upload
- English and Portuguese interface
- Download the compressed MP4 immediately after processing

## Tech Stack

- SvelteKit
- TypeScript
- Tailwind CSS
- FFmpeg WASM
- Tauri
- Native FFmpeg sidecar
- Vite

## Getting Started

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Run project checks:

```bash
pnpm check
```

Run all frontend and Tauri checks:

```bash
pnpm check:all
```

Build for production:

```bash
pnpm build
```

## Web Deploy on Caddy

The web build uses FFmpeg WASM multithreading when the page is cross-origin isolated. On a VPS with Caddy, serve the static `build` folder with COOP and COEP headers:

```caddyfile
example.com {
  root * /var/www/8disc
  encode zstd gzip

  header {
    Cross-Origin-Opener-Policy "same-origin"
    Cross-Origin-Embedder-Policy "require-corp"
  }

  @immutable path /_app/immutable/*
  header @immutable Cache-Control "public, max-age=31536000, immutable"

  try_files {path} /index.html
  file_server
}
```

After deploying, verify this in the browser console:

```js
globalThis.crossOriginIsolated === true
typeof SharedArrayBuffer !== 'undefined'
```

## Desktop App

The Tauri desktop app uses native FFmpeg and can use hardware H.264 encoders when available on Windows: NVIDIA NVENC, Intel Quick Sync, or AMD AMF. If no GPU encoder works, it falls back to `libx264`.

Prepare the FFmpeg sidecars before building the desktop app:

```bash
FFMPEG_BINARY=/path/to/ffmpeg.exe FFPROBE_BINARY=/path/to/ffprobe.exe pnpm prepare-ffmpeg-sidecar
```

When preparing Windows sidecars from another OS, set `TAURI_TARGET_TRIPLE` explicitly, for example `x86_64-pc-windows-msvc`.

Optional checksum validation:

```bash
FFMPEG_BINARY=/path/to/ffmpeg.exe \
FFPROBE_BINARY=/path/to/ffprobe.exe \
FFMPEG_SHA256=<sha256> \
FFPROBE_SHA256=<sha256> \
pnpm prepare-ffmpeg-sidecar
```

Release builds should require checksums:

```bash
FFMPEG_BINARY=/path/to/ffmpeg.exe \
FFPROBE_BINARY=/path/to/ffprobe.exe \
FFMPEG_SHA256=<sha256> \
FFPROBE_SHA256=<sha256> \
pnpm prepare-ffmpeg-sidecar:release
```

Run the desktop app in development:

```bash
pnpm tauri dev
```

Build the desktop app:

```bash
pnpm build:tauri
```

## Privacy

Videos are processed locally in your browser. The app does not need to upload your media to a backend service for compression.
