import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const runtimeHostProductSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/RuntimeHostProduct.ts', import.meta.url)),
  'utf8',
);

const warpGraphProductSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpGraphRuntimeProduct.ts', import.meta.url)),
  'utf8',
);

const warpCoreProductSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpCoreRuntimeProduct.ts', import.meta.url)),
  'utf8',
);

describe('runtime host product seam', () => {
  it('introduces one explicit host-product opener that owns the runtime boot call', () => {
    expect(runtimeHostProductSource).toContain('export async function openRuntimeHostProduct(');
    expect(runtimeHostProductSource).toContain("await import('../WarpRuntime.ts')");
    expect(runtimeHostProductSource).toContain('runtimeModule.openWarpRuntime(options)');
  });

  it('moves the runtime product builders onto the shared host seam', () => {
    expect(warpGraphProductSource).not.toContain("from '../WarpRuntime.ts'");
    expect(warpCoreProductSource).not.toContain("from '../WarpRuntime.ts'");
    expect(warpGraphProductSource).toContain("from './RuntimeHostProduct.ts'");
    expect(warpCoreProductSource).toContain("from './RuntimeHostProduct.ts'");
    expect(warpGraphProductSource).toContain('openRuntimeHostProduct(options)');
    expect(warpCoreProductSource).toContain('openRuntimeHostProduct(options)');
  });
});
