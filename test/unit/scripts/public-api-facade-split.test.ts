import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const barrel = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
  'utf8',
);

const warpAppSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpApp.ts', import.meta.url)),
  'utf8',
);

describe('public facade split', () => {
  it('exports WarpApp as the default product-facing entrypoint', async () => {
    const pkg = /** @type {{ default?: unknown; WarpApp?: unknown }} */ (await import('../../../index.ts'));
    expect(pkg.default).toBe(pkg.WarpApp);
    expect(barrel).toContain('export default WarpApp;');
  });

  it('exposes WarpCore and does not export WarpRuntime anymore', async () => {
    const pkg = /** @type {{ WarpCore?: unknown; WarpRuntime?: unknown }} */ (await import('../../../index.ts'));
    expect(pkg.WarpCore).toBeDefined();
    expect((pkg as any).WarpRuntime).toBeUndefined();
    expect(barrel).not.toContain('WarpCore as WarpRuntime,');
  });

  it('declares WarpApp as a curated surface with an explicit core escape hatch', () => {
    expect(warpAppSource).toContain('export default class WarpApp {');
    expect(warpAppSource).toMatch(/core\(\): WarpCore/);
    expect(warpAppSource).not.toMatch(/\n\s+materialize\(/);
    expect(warpAppSource).not.toMatch(/\n\s+getNodes\(\): Promise<string\[]>/);
    expect(warpAppSource).not.toMatch(/\n\s+query\(\): QueryBuilder/);
  });
});
