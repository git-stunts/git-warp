import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const warpCorePath = join(process.cwd(), 'src/domain/WarpCore.ts');
const warpCoreSource = readFileSync(warpCorePath, 'utf8');
const warpCoreBridgePath = join(process.cwd(), 'src/domain/warp/WarpCoreRuntimeBridge.ts');

describe('WarpCore runtime bridge', () => {
  it('does not depend on the deleted runtime bridge file', () => {
    expect(existsSync(warpCoreBridgePath)).toBe(false);
    expect(warpCoreSource).not.toContain('./warp/WarpCoreRuntimeBridge.ts');
  });

  it('does not route through callInternalRuntimeMethod', () => {
    expect(warpCoreSource).not.toContain('callInternalRuntimeMethod');
  });

  it('declares an explicit structural product surface instead of prototype linking', () => {
    expect(warpCoreSource).toContain("from './warp/WarpCoreRuntimeProduct.ts'");
    expect(warpCoreSource).not.toContain('linkWarpCorePrototype');
    expect(warpCoreSource).not.toContain("from './warp/WarpCoreRuntimeBridge.ts'");
  });
});
