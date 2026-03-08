import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleStaticRequest } from '../../../../src/infrastructure/adapters/staticFileHandler.js';

describe('handleStaticRequest', () => {
  /** @type {string} */
  let root;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'static-test-'));
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<html><body>Hello</body></html>');
    await writeFile(join(root, 'assets', 'app.js'), 'console.log("hi")');
    await writeFile(join(root, 'assets', 'style.css'), 'body { color: red }');
    await writeFile(join(root, 'data.json'), '{"ok":true}');
    await writeFile(join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(root, 'favicon.ico'), Buffer.from([0x00]));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('serves index.html for /', async () => {
    const result = await handleStaticRequest(root, '/');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/html');
    expect(new TextDecoder().decode(result.body)).toContain('Hello');
  });

  it('serves index.html for trailing slash', async () => {
    const result = await handleStaticRequest(root, '/subdir/');
    // subdir doesn't have index.html, so 404
    expect(result.status).toBe(404);
  });

  it('serves JS files with correct MIME type', async () => {
    const result = await handleStaticRequest(root, '/assets/app.js');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/javascript');
    expect(new TextDecoder().decode(result.body)).toBe('console.log("hi")');
  });

  it('serves CSS files with correct MIME type', async () => {
    const result = await handleStaticRequest(root, '/assets/style.css');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/css');
  });

  it('serves JSON files with correct MIME type', async () => {
    const result = await handleStaticRequest(root, '/data.json');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('application/json');
  });

  it('serves PNG files with correct MIME type', async () => {
    const result = await handleStaticRequest(root, '/image.png');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
  });

  it('serves ICO files with correct MIME type', async () => {
    const result = await handleStaticRequest(root, '/favicon.ico');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/x-icon');
  });

  it('returns 404 for missing files with extension', async () => {
    const result = await handleStaticRequest(root, '/missing.js');
    expect(result.status).toBe(404);
  });

  it('SPA fallback: serves index.html for extensionless paths', async () => {
    const result = await handleStaticRequest(root, '/some/deep/route');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/html');
    expect(new TextDecoder().decode(result.body)).toContain('Hello');
  });

  it('returns content-length header', async () => {
    const result = await handleStaticRequest(root, '/data.json');
    expect(result.headers['content-length']).toBe('11');
  });

  it('contains path traversal with .. inside root', async () => {
    // resolve() normalizes ../.. to stay inside root — the file
    // path becomes <root>/etc/passwd. With extension .js it would 404;
    // without extension, SPA fallback serves index.html. Either way,
    // /etc/passwd is never read.
    const result = await handleStaticRequest(root, '/../../../etc/passwd.js');
    expect(result.status).toBe(404);
  });

  it('blocks null bytes in path', async () => {
    const result = await handleStaticRequest(root, '/index.html\0.js');
    expect(result.status).toBe(403);
  });

  it('contains encoded traversal inside root', async () => {
    const result = await handleStaticRequest(root, '/%2e%2e/%2e%2e/etc/passwd.js');
    expect(result.status).toBe(404);
  });

  it('uses application/octet-stream for unknown extensions', async () => {
    await writeFile(join(root, 'data.xyz'), 'binary');
    const result = await handleStaticRequest(root, '/data.xyz');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('application/octet-stream');
  });
});
