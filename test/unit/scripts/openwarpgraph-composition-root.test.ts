import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const warpGraphBridgeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpGraphRuntimeBridge.ts', import.meta.url)),
  'utf8',
);

const warpCoreSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpCore.ts', import.meta.url)),
  'utf8',
);

const warpCoreProductSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpCoreRuntimeProduct.ts', import.meta.url)),
  'utf8',
);

const runtimeHostProductSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/RuntimeHostProduct.ts', import.meta.url)),
  'utf8',
);

const warpRuntimeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpRuntime.ts', import.meta.url)),
  'utf8',
);

const warpRuntimeBootSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpRuntimeBoot.ts', import.meta.url)),
  'utf8',
);

describe('openWarpGraph composition root', () => {
  it('keeps the public graph bridge off direct WarpRuntime imports and static open calls', () => {
    expect(warpGraphBridgeSource).not.toContain("import WarpRuntime");
    expect(warpGraphBridgeSource).not.toContain("import type WarpRuntime");
    expect(warpGraphBridgeSource).not.toContain('WarpRuntime.open(');
  });

  it('keeps WarpCore off the deleted runtime bridge and static open calls', () => {
    expect(warpCoreSource).not.toContain('./warp/WarpCoreRuntimeBridge.ts');
    expect(warpCoreSource).not.toContain('WarpRuntime.open(');
    expect(warpCoreProductSource).not.toContain('WarpRuntime.open(');
  });

  it('routes source-side runtime product boot through the shared host seam', () => {
    expect(warpGraphBridgeSource).not.toContain("from '../WarpRuntime.ts'");
    expect(warpCoreProductSource).not.toContain("from '../WarpRuntime.ts'");
    expect(runtimeHostProductSource).toContain("await import('../WarpRuntime.ts')");
    expect(runtimeHostProductSource).toContain('runtimeModule.openWarpRuntime(options)');
  });

  it('routes boot orchestration through the dedicated runtime boot module', () => {
    expect(warpRuntimeSource).toContain("from './warp/WarpRuntimeBoot.ts'");
    expect(warpRuntimeSource).toContain('resolveWarpRuntimeConstructionOptions');
    expect(warpRuntimeSource).toContain('return await openWarpRuntime(options);');
    expect(warpRuntimeBootSource).toContain('export async function resolveWarpRuntimeConstructionOptions(');
  });
});
