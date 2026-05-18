import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const binariesDir = join(root, 'src-tauri', 'binaries');
const targetTriple = process.env.TAURI_TARGET_TRIPLE || detectTargetTriple();
const exe = targetTriple.includes('windows') ? '.exe' : '';

const ffmpegSource = process.env.FFMPEG_BINARY;
const ffprobeSource = process.env.FFPROBE_BINARY;

if (!ffmpegSource || !ffprobeSource) {
  throw new Error(
    'Set FFMPEG_BINARY and FFPROBE_BINARY to local ffmpeg/ffprobe executables before running this script.'
  );
}

copySidecar(ffmpegSource, 'ffmpeg', process.env.FFMPEG_SHA256);
copySidecar(ffprobeSource, 'ffprobe', process.env.FFPROBE_SHA256);

function copySidecar(source, name, expectedSha256) {
  const absoluteSource = resolve(source);

  if (!existsSync(absoluteSource)) {
    throw new Error(`${name} source not found: ${absoluteSource}`);
  }

  if (expectedSha256) {
    const actualSha256 = createHash('sha256').update(readFileSync(absoluteSource)).digest('hex');

    if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error(
        `${name} checksum mismatch for ${basename(absoluteSource)}. Expected ${expectedSha256}, got ${actualSha256}.`
      );
    }
  }

  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(absoluteSource, join(binariesDir, `${name}-${targetTriple}${exe}`));
}

function detectTargetTriple() {
  return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
}
