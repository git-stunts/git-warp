import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const factoryNotePath = join(
  process.cwd(),
  'docs/archive/backlog/v17.0.0-residual-backlog/API_warpgraph-factory.md'
);
const barrel = readFileSync(join(process.cwd(), 'index.ts'), 'utf8');
const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
const releaseLedger = readFileSync(join(process.cwd(), 'docs/releases/v17.0.0/README.md'), 'utf8');
const workloads = readFileSync(
  join(
    process.cwd(),
    'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/WORKLOADS.md'
  ),
  'utf8'
);

describe('warpgraph factory closeout', () => {
  it('removes the stale live factory card', () => {
    expect(existsSync(factoryNotePath)).toBe(false);
  });

  it('keeps openWarpGraph as the advanced compatibility composition root', () => {
    expect(barrel).toContain('openWarpGraph,');
    expect(barrel).toContain('First-use application code should open a named worldline');
    expect(readme).toContain(
      "import { GitGraphAdapter, openWarpWorldline } from '@git-stunts/git-warp';"
    );
    expect(readme).toContain('`openWarpGraph()`. That surface is supported for compatibility');
  });

  it('removes completed factory work from the workload inventory', () => {
    expect(workloads).not.toContain('API_warpgraph-factory');
    expect(workloads).not.toContain('WL-30-v17-provider-foundations');
  });

  it('preserves shipped history without stale composition-root residue', () => {
    expect(releaseLedger).toContain('[x] API_warpgraph-factory');
    expect(releaseLedger).toContain('cycle 0089 retired stale live card');
    expect(releaseLedger).toContain('runtime/composition-root residue');
    expect(releaseLedger).not.toContain(
      'The remaining\n                                          work is the `openWarpGraph()`'
    );
    expect(releaseLedger).not.toContain('`WarpRuntime` composition-root residue');
  });
});
