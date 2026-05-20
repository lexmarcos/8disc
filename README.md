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
PUBLIC_SITE_URL=https://your-domain.example pnpm build
```

Run the production static server locally on port 2000:

```bash
pnpm build
pnpm serve:prod
```

## GitHub Actions VPS Deploy

The workflow in `.github/workflows/deploy-vps.yml` builds a Docker image, sends it to a VPS, and runs it with Docker Compose on port `2000`.

Prepare the VPS with Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo docker compose version
sudo ufw allow 2000/tcp
```

Use `root` or a user with passwordless `sudo` for deployment commands (`docker`, `mkdir`, `cp`). The workflow runs Docker through `sudo` on the VPS.

Add these GitHub environment secrets (`production`):

- `VPS_HOST`: server IP or hostname
- `VPS_USER`: SSH user
- `VPS_SSH_KEY`: private SSH key allowed to connect to the VPS
- `PUBLIC_SITE_URL`: required final public origin, for example `https://8disc.example.com`

Optional:

- `VPS_PORT`: SSH port, defaults to `22`
- `VPS_APP_DIR`: deployment directory, defaults to `/opt/8disc`

The workflow creates/updates:

- `${VPS_APP_DIR}/docker-compose.yml`
- `${VPS_APP_DIR}/.env`
- `${VPS_APP_DIR}/8disc-image.tar`

Verify a deployment:

```bash
sudo docker ps --filter name=8disc
curl -I http://127.0.0.1:2000/robots.txt
```

## Optional Caddy Reverse Proxy

Set `PUBLIC_SITE_URL` to the final production origin before building so canonical URLs, Open Graph URLs, `robots.txt`, and `sitemap.xml` point to the correct domain.

The production server already sends the COOP and COEP headers required by FFmpeg WASM multithreading. If you want a domain with HTTPS in front of port 2000, use Caddy as a reverse proxy:

```caddyfile
example.com {
  encode zstd gzip

  header {
    Cross-Origin-Opener-Policy "same-origin"
    Cross-Origin-Embedder-Policy "require-corp"
  }

  reverse_proxy 127.0.0.1:2000
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

For Linux builds, point the sidecar preparation to Linux executables:

```bash
FFMPEG_BINARY=/usr/bin/ffmpeg FFPROBE_BINARY=/usr/bin/ffprobe pnpm prepare-ffmpeg-sidecar
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

Build Linux packages:

```bash
pnpm build:linux
```

## Privacy

Videos are processed locally in your browser. The app does not need to upload your media to a backend service for compression.
