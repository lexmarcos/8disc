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
- Target common Discord-friendly sizes: 8 MB, 16 MB, 25 MB, 50 MB, and 100 MB
- Drag-and-drop video upload
- English and Portuguese interface
- Download the compressed MP4 immediately after processing

## Tech Stack

- SvelteKit
- TypeScript
- Tailwind CSS
- FFmpeg WASM
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

Build for production:

```bash
pnpm build
```

## Privacy

Videos are processed locally in your browser. The app does not need to upload your media to a backend service for compression.
