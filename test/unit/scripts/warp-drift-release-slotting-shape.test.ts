import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const slotting = readDoc('docs/design/0037-remaining-warp-drift-release-slotting.md');
const driftAudit = readDoc('docs/audits/WARP_DRIFT.md');
const horizon = readDoc('docs/design/release-horizon-v20-v21.md');
const v19Lane = readDoc(
  'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v19.0.0/README.md'
);

describe('Remaining WARP drift release slotting docs', () => {
  it('assigns the unresolved drift families to v19, v20, and v21 explicitly', () => {
    expect(slotting).toContain('# Remaining WARP Drift Release Slotting');
    expect(slotting).toContain('| Observer surface still snapshot/materialize/filter');
    expect(slotting).toContain('| Slice-first runtime realization and fragment reuse');
    expect(slotting).toContain('| Braiding as pinned-base equality');
    expect(slotting).toContain('| Sync as frontier + patches rather than witnessed admission');
  });

  it('is linked from the drift ledger as part of the relevant design context', () => {
    expect(driftAudit).toContain(
      '- [remaining-warp-drift-release-slotting](../design/0037-remaining-warp-drift-release-slotting.md)'
    );
  });

  it('sharpens the release horizon and v19 lane handoff', () => {
    expect(horizon).toContain('Read this note together with:');
    expect(horizon).toContain(
      '- [0037-remaining-warp-drift-release-slotting.md](./0037-remaining-warp-drift-release-slotting.md)'
    );
    expect(horizon).toContain('- `v20` = operational slice-first runtime');
    expect(horizon).toContain(
      '- `v21` = plural/distributed observer geometry and admission reality'
    );
    expect(v19Lane).toContain('## Release handoff');
    expect(v19Lane).toContain(
      '- `v19` owns doctrine/runtime correction and the first honest observer/admission surfaces'
    );
    expect(v19Lane).toContain('- `v20` owns operational slice-first runtime realization');
    expect(v19Lane).toContain(
      '- `v21` owns plural/distributed semantics such as common-basis braid and fuller admission reality'
    );
  });
});
