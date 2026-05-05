import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bridgeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/WarpGraphRuntimeBridge.ts', import.meta.url)),
  'utf8',
);

describe('openWarpRuntime bridge closeout', () => {
  it('keeps WarpGraphRuntimeBridge off WarpRuntime imports and openWarpRuntime calls', () => {
    expect(bridgeSource).not.toContain("from '../WarpRuntime.ts'");
    expect(bridgeSource).not.toContain('openWarpRuntime(');
  });
});
