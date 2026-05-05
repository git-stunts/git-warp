import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const driftAudit = readDoc('docs/audits/WARP_DRIFT.md');

describe('WARP drift ledger crosslinks', () => {
  it('keeps the audit as a drift ledger while pointing at the canonical noun and ladder docs', () => {
    expect(driftAudit).toContain('This file is the **drift ledger**, not the canonical noun wall-chart or');
    expect(driftAudit).toContain('- [GLOSSARY](../GLOSSARY.md)');
    expect(driftAudit).toContain('- [observer-geometry-architecture-ladder](../design/0035-observer-geometry-architecture-ladder.md)');
    expect(driftAudit).toContain('- [release-horizon-v20-v21](../design/release-horizon-v20-v21.md)');
  });

  it('references the new wall-chart artifacts in backlog capture status and relevant design context', () => {
    expect(driftAudit).toContain('The canonical noun and runtime-planning surfaces for this drift now live in:');
    expect(driftAudit).toContain('## Relevant design context');
    expect(driftAudit).toContain('- [GLOSSARY](../GLOSSARY.md)');
    expect(driftAudit).toContain('- [observer-geometry-architecture-ladder](../design/0035-observer-geometry-architecture-ladder.md)');
    expect(driftAudit).toContain('- [release-horizon-v20-v21](../design/release-horizon-v20-v21.md)');
  });
});
