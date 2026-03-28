import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexJs = readFileSync(
  fileURLToPath(new URL('../../../index.js', import.meta.url)),
  'utf8',
);

const indexDts = readFileSync(
  fileURLToPath(new URL('../../../index.d.ts', import.meta.url)),
  'utf8',
);

/**
 * @param {string} source
 * @param {string} marker
 * @returns {string}
 */
function extractClassBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Unable to find class marker: ${marker}`);
  }
  const end = source.indexOf('\n}\n', start);
  if (end === -1) {
    throw new Error(`Unable to find class terminator for: ${marker}`);
  }
  return source.slice(start, end + 3);
}

describe('public facade split', () => {
  it('exports WarpApp as the default product-facing entrypoint', async () => {
    const pkg = /** @type {{ default?: unknown; WarpApp?: unknown }} */ (await import('../../../index.js'));
    expect(pkg.default).toBe(pkg.WarpApp);
    expect(indexJs).toContain('export default WarpApp;');
    expect(indexDts).toContain('export default WarpApp;');
  });

  it('exposes WarpCore and does not export WarpRuntime anymore', async () => {
    const pkg = /** @type {{ WarpCore?: unknown; WarpRuntime?: unknown }} */ (await import('../../../index.js'));
    expect(pkg.WarpCore).toBeDefined();
    expect(pkg.WarpRuntime).toBeUndefined();
    expect(indexJs).not.toContain('WarpCore as WarpRuntime,');
    expect(indexDts).not.toContain('export declare class WarpRuntime {');
  });

  it('declares WarpApp as a curated surface with an explicit core escape hatch', () => {
    const warpAppBlock = extractClassBlock(indexDts, 'export declare class WarpApp {');
    expect(indexDts).toContain('export declare class WarpApp {');
    expect(warpAppBlock).toContain('core(): WarpCore;');
    expect(warpAppBlock).not.toMatch(/\n\s+materialize\(/);
    expect(warpAppBlock).not.toMatch(/\n\s+getNodes\(\): Promise<string\[]>;/);
    expect(warpAppBlock).not.toMatch(/\n\s+query\(\): QueryBuilder;/);
  });
});
