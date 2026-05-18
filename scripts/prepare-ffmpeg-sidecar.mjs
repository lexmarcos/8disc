import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const binariesDir = join(root, 'src-tauri', 'binaries');
const targetTriple = process.env.TAURI_TARGET_TRIPLE || detectTargetTriple();
const exe = targetTriple.includes('windows') ? '.exe' : '';
const requireChecksums =
  process.argv.includes('--require-checksums') || process.env.REQUIRE_FFMPEG_CHECKSUMS === '1';

const ffmpegSource = process.env.FFMPEG_BINARY;
const ffprobeSource = process.env.FFPROBE_BINARY;
const ffmpegSha256 = process.env.FFMPEG_SHA256;
const ffprobeSha256 = process.env.FFPROBE_SHA256;

if (!ffmpegSource || !ffprobeSource) {
  throw new Error(
    'Set FFMPEG_BINARY and FFPROBE_BINARY to local ffmpeg/ffprobe executables before running this script.'
  );
}

if (requireChecksums && (!ffmpegSha256 || !ffprobeSha256)) {
  throw new Error(
    'Release sidecar preparation requires FFMPEG_SHA256 and FFPROBE_SHA256. Provide both hashes or run the non-release script.'
  );
}

copySidecar(ffmpegSource, 'ffmpeg', ffmpegSha256);
copySidecar(ffprobeSource, 'ffprobe', ffprobeSha256);

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
