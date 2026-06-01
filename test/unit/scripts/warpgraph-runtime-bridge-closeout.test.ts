import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bridgeNotePath = join(
  process.cwd(),
  'docs/archive/backlog/v17.0.0-residual-backlog/API_warpgraph-runtime-bridge.md',
);
const warpGraphSource = readFileSync(
  join(process.cwd(), 'src/domain/WarpGraph.ts'),
  'utf8',
);
const workloads = readFileSync(
  join(process.cwd(), 'docs/method/backlog/WORKLOADS.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('warpgraph runtime bridge closeout', () => {
  it('removes the stale live card', () => {
    expect(existsSync(bridgeNotePath)).toBe(false);
  });

  it('keeps the public factory off direct runtime-host imports', () => {
    expect(warpGraphSource).not.toContain("from './RuntimeHost.ts'");
    expect(warpGraphSource).not.toContain("from '../RuntimeHost.ts'");
    expect(warpGraphSource).not.toContain('RuntimeHost.open(');
    expect(warpGraphSource).toContain("from './warp/WarpGraphRuntimeBridge.ts'");
  });

  it('removes the completed bridge cut from workload inventory', () => {
    expect(workloads).not.toContain('API_warpgraph-runtime-bridge');
  });

  it('preserves shipped history in the release ledger', () => {
    expect(releaseLedger).toContain('cycle 0067 bridge cut');
    expect(releaseLedger).toContain('Cycle 0088 retired the stale');
  });
});
