import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'build'));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 2000);
const fallbackFile = path.join(rootDir, '200.html');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

const baseHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff'
};

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, { ...baseHeaders, ...headers });
  response.end(body);
}

function sanitizePathname(requestUrl) {
  const { pathname } = new URL(requestUrl || '/', `http://${host}:${port}`);
  const decoded = decodeURIComponent(pathname);

  if (decoded.includes('\0')) {
    return null;
  }

  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
  const filePath = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function getContentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function getCacheControl(filePath) {
  const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');

  if (relativePath.startsWith('_app/immutable/')) {
    return 'public, max-age=31536000, immutable';
  }

  if (relativePath.endsWith('.html') || relativePath === 'robots.txt' || relativePath === 'sitemap.xml') {
    return 'public, max-age=300';
  }

  return 'public, max-age=3600';
}

async function resolveFile(request) {
  const requestedPath = sanitizePathname(request.url);

  if (!requestedPath) {
    return null;
  }

  try {
    const requestedStat = await stat(requestedPath);

    if (requestedStat.isDirectory()) {
      const indexPath = path.join(requestedPath, 'index.html');
      return { filePath: indexPath, fileStat: await stat(indexPath), statusCode: 200 };
    }

    return { filePath: requestedPath, fileStat: requestedStat, statusCode: 200 };
  } catch {
    const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;

    if (!acceptsHtml) {
      return null;
    }

    return { filePath: fallbackFile, fileStat: await stat(fallbackFile), statusCode: 200 };
  }
}

const server = createServer(async (request, response) => {
  if (!request.url || !['GET', 'HEAD'].includes(request.method || '')) {
    send(response, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
    return;
  }

  try {
    const resolved = await resolveFile(request);

    if (!resolved) {
      send(response, 404, 'Not Found\n', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    const headers = {
      'Content-Type': getContentType(resolved.filePath),
      'Content-Length': String(resolved.fileStat.size),
      'Cache-Control': getCacheControl(resolved.filePath)
    };

    response.writeHead(resolved.statusCode, { ...baseHeaders, ...headers });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(resolved.filePath).pipe(response);
  } catch (error) {
    console.error(error);
    send(response, 500, 'Internal Server Error\n', {
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }
});

server.listen(port, host, () => {
  console.log(`8disc static server listening on http://${host}:${port}`);
  console.log(`Serving ${rootDir}`);
});
