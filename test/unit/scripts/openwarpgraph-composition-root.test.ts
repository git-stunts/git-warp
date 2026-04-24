import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const warpGraphBridgeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpGraphRuntimeBridge.ts', import.meta.url)),
  'utf8',
);

const warpCoreBridgeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpCoreRuntimeBridge.ts', import.meta.url)),
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
  it('keeps the bridge files off direct WarpRuntime imports and static open calls', () => {
    expect(warpGraphBridgeSource).not.toContain("import WarpRuntime");
    expect(warpGraphBridgeSource).not.toContain("import type WarpRuntime");
    expect(warpGraphBridgeSource).not.toContain('WarpRuntime.open(');

    expect(warpCoreBridgeSource).not.toContain("import WarpRuntime");
    expect(warpCoreBridgeSource).not.toContain("import type WarpRuntime");
    expect(warpCoreBridgeSource).not.toContain('WarpRuntime.open(');
  });

  it('routes boot orchestration through the dedicated runtime boot module', () => {
    expect(warpRuntimeSource).toContain("from './warp/WarpRuntimeBoot.ts'");
    expect(warpRuntimeSource).toContain('resolveWarpRuntimeConstructionOptions');
    expect(warpRuntimeSource).toContain('return await openWarpRuntime(options);');
    expect(warpRuntimeBootSource).toContain('export async function resolveWarpRuntimeConstructionOptions(');
  });
});
