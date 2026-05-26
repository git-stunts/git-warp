import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('materialize API classification', () => {
  it('marks full materialize APIs as deprecated application read paths', () => {
    const capability = readRepoFile('src/domain/capabilities/MaterializeCapability.ts');
    const core = readRepoFile('src/domain/WarpCore.ts');

    expect(capability).toContain('Compatibility substrate capability.');
    expect(capability).toContain('@deprecated For application reads, use openWarpWorldline().live(), seek(), or observer reads.');
    expect(capability).toContain('@deprecated For application coordinate reads, use worldline seek/read handles.');
    expect(capability).toContain('@deprecated For application checkpoint reads, use historical worldline reads.');
    expect(core).toContain('@deprecated For application reads, use openWarpWorldline().live(), seek(), or observer reads.');
  });

  it('classifies provenance and strand materialization as diagnostics', () => {
    const provenance = readRepoFile('src/domain/capabilities/ProvenanceCapability.ts');
    const strand = readRepoFile('src/domain/capabilities/StrandCapability.ts');
    const core = readRepoFile('src/domain/WarpCore.ts');

    expect(provenance).toContain('Diagnostic/provenance slice inspection; not a first-use application read path.');
    expect(strand).toContain('Diagnostic/speculative-lane snapshot inspection; not a first-use application read path.');
    expect(core).toContain('Diagnostic/provenance slice inspection; not a first-use application read path.');
    expect(core).toContain('Diagnostic/speculative-lane snapshot inspection; not a first-use application read path.');
  });

  it('classifies sync materialization as a compatibility convenience', () => {
    const sync = readRepoFile('src/domain/capabilities/SyncCapability.ts');

    expect(sync).toContain('Compatibility convenience: materialize after sync for legacy callers.');
  });
});
