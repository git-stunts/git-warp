import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep, normalize } from 'node:path';

/**
 * Minimal MIME type map covering typical SPA assets.
 * @type {Record<string, string>}
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const FORBIDDEN = { status: 403, headers: { 'content-type': 'text/plain' }, body: new TextEncoder().encode('Forbidden') };
const NOT_FOUND = { status: 404, headers: { 'content-type': 'text/plain' }, body: new TextEncoder().encode('Not Found') };

/**
 * Resolves and validates a URL path against a static directory root.
 * Returns null if the path escapes the root (traversal attack).
 *
 * @param {string} root - Absolute path to the static directory
 * @param {string} urlPath - URL path (e.g., "/assets/index.js")
 * @returns {string|null} Resolved absolute file path, or null if blocked
 */
function safePath(root, urlPath) {
  if (urlPath.includes('\0')) {
    return null;
  }

  /** @type {string} */
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) {
    return null;
  }

  const resolved = resolve(root, `.${normalize(`/${decoded}`)}`);

  if (!resolved.startsWith(`${root}${sep}`) && resolved !== root) {
    return null;
  }

  return resolved;
}

/**
 * Reads a file and returns a static response with the correct MIME type.
 * Resolves symlinks before reading and re-checks the real path against
 * the root directory to prevent symlink-based traversal attacks.
 *
 * @param {string} root - Absolute path to the static directory root
 * @param {string} filePath - Absolute path to the file
 * @param {string} [mimeOverride] - Optional MIME type override
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: Uint8Array }|null>}
 */
async function tryReadFile(root, filePath, mimeOverride) {
  try {
    // Resolve symlinks to prevent traversal via symlinks pointing outside root.
    // Both root and filePath must be resolved — on macOS, /var → /private/var.
    const realRoot = await realpath(root);
    const real = await realpath(filePath);
    if (!real.startsWith(`${realRoot}${sep}`) && real !== realRoot) {
      return null;
    }
    const body = await readFile(real);
    const contentType = mimeOverride || MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    return {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': String(body.byteLength),
      },
      body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    };
  } catch {
    return null;
  }
}

/**
 * Handles an HTTP request for a static file.
 *
 * - Serves `index.html` for `/` and directory-like paths
 * - Returns correct MIME types for known extensions
 * - SPA fallback: extensionless paths serve `index.html`
 * - Path traversal prevention: rejects `..` escapes and null bytes
 *
 * @param {string} staticDir - Absolute path to the static file directory
 * @param {string} urlPath - Request URL path (e.g., "/", "/assets/index.js")
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: Uint8Array|null }>}
 */
export async function handleStaticRequest(staticDir, urlPath) {
  const cleanPath = urlPath === '/' || urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
  const filePath = safePath(staticDir, cleanPath);

  if (!filePath) {
    return FORBIDDEN;
  }

  const result = await tryReadFile(staticDir, filePath);
  if (result) {
    return result;
  }

  // SPA fallback: extensionless paths serve index.html
  if (!extname(cleanPath)) {
    const indexPath = safePath(staticDir, '/index.html');
    if (indexPath) {
      const indexResult = await tryReadFile(staticDir, indexPath, 'text/html; charset=utf-8');
      if (indexResult) {
        return indexResult;
      }
    }
  }

  return NOT_FOUND;
}
