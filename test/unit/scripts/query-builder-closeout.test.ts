import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const queryBuilderNotePath = join(
  process.cwd(),
  'docs/method/graveyard/v17.0.0-residual-backlog/GOD_query-builder.md',
);
const workloads = readFileSync(
  join(process.cwd(), 'docs/method/backlog/WORKLOADS.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('query builder closeout', () => {
  it('removes the stale live card', () => {
    expect(existsSync(queryBuilderNotePath)).toBe(false);
  });

  it('removes the completed god kill from the live workload inventory', () => {
    expect(workloads).not.toContain('GOD_query-builder');
  });

  it('preserves the shipped milestone in the release ledger', () => {
    expect(releaseLedger).toContain('[x] GOD_query-builder');
    expect(releaseLedger).toContain('cycle 0087 retired stale live card');
  });
});
