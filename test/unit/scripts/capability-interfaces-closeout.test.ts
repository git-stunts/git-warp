import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const capabilityNotePath = join(
  process.cwd(),
  'docs/method/backlog/v17.0.0/API_capability-interfaces.md',
);
const factoryCycle = readFileSync(
  join(process.cwd(), 'docs/design/0089-close-warpgraph-factory.md'),
  'utf8',
);
const queryControllerNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/GOD_query-controller.md'),
  'utf8',
);
const strandServiceNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/GOD_strand-service.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('capability interfaces closeout', () => {
  it('removes the stale live card', () => {
    expect(existsSync(capabilityNotePath)).toBe(false);
  });

  it('unblocks downstream v17 notes from the stale foundation card', () => {
    expect(factoryCycle).toContain('The stale `API_warpgraph-factory` card is removed');
    expect(factoryCycle).not.toContain('API_capability-interfaces');
    expect(queryControllerNote).not.toContain('API_capability-interfaces');
    expect(strandServiceNote).not.toContain('API_capability-interfaces');
  });

  it('preserves the shipped milestone in the release ledger', () => {
    expect(releaseLedger).toContain('[x] API_capability-interfaces');
    expect(releaseLedger).toContain('cycle 0086 retired stale live card');
  });
});
