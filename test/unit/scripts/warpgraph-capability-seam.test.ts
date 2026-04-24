import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const warpGraphSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpGraph.ts', import.meta.url)),
  'utf8',
);

const apiReference = readFileSync(
  fileURLToPath(new URL('../../../docs/API_REFERENCE.md', import.meta.url)),
  'utf8',
);

describe('WarpGraph public capability seam', () => {
  it('does not import WarpRuntime directly', () => {
    expect(warpGraphSource).not.toContain("import type WarpRuntime");
    expect(warpGraphSource).not.toContain("import WarpRuntime");
  });

  it('does not expose _runtime on the public WarpGraph surface', () => {
    expect(warpGraphSource).not.toContain('readonly _runtime:');
  });

  it('does not use as unknown as when wiring capabilities', () => {
    expect(warpGraphSource).not.toContain('as unknown as');
  });

  it('teaches direct sync through the capability bag, not graph._runtime', () => {
    expect(apiReference).not.toContain('graphB._runtime');
    expect(apiReference).toContain('graphA.sync.syncWith(graphB)');
  });
});
