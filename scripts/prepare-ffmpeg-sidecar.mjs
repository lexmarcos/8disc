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
  const hostTriple = getKnownHostTriple();

  if (hostTriple) {
    return hostTriple;
  }

  try {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
  } catch {
    const versionInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    const host = versionInfo.match(/^host: (.+)$/m)?.[1];

    if (!host) {
      throw new Error('Could not detect the Rust host target triple from rustc.');
    }

    return host;
  }
}

function getKnownHostTriple() {
  if (process.platform === 'linux') {
    if (process.arch === 'x64') return 'x86_64-unknown-linux-gnu';
    if (process.arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') return 'x86_64-pc-windows-msvc';
    if (process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'x64') return 'x86_64-apple-darwin';
    if (process.arch === 'arm64') return 'aarch64-apple-darwin';
  }

  return undefined;
}
