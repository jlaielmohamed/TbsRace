/**
 * Zero-dependency local web server for TbsRace.
 *
 * The app uses ES modules, which browsers refuse to load from file:// URLs.
 * Run this from the project root instead of double-clicking index.html:
 *
 *   node serve.mjs            → http://localhost:8080
 *   node serve.mjs 3000       → http://localhost:3000
 *   PORT=3000 node serve.mjs  → same, via environment variable
 *
 * It only serves this folder, on this machine, with no caching. Do not use it
 * in production; Render (or any static host) serves the deployed site.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const host = '127.0.0.1';
const port = Number(process.env.PORT || process.argv[2] || 8080);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/**
 * Resolve a request path to a file inside the project root.
 * Returns null for traversal attempts and malformed URLs.
 */
function toFilePath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }

  const target = resolve(join(root, normalize(pathname)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

function sendText(response, status, text) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(text);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let filePath = toFilePath(request.url || '/');
  if (!filePath) {
    sendText(response, 400, 'Bad request');
    return;
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }

    if (!info.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) sendText(response, 500, 'Read error');
      else response.destroy();
    });
    stream.pipe(response);
  } catch {
    sendText(response, 404, `Not found: ${request.url}`);
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: node serve.mjs ${port + 1}`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`TbsRace is running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});
