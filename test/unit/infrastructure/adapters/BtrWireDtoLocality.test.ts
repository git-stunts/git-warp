import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const BTR_WIRE_DTO_FILES = [
  'src/infrastructure/adapters/BtrWireRecord.ts',
  'src/infrastructure/adapters/BtrWireProvenanceEntry.ts',
];
const FORBIDDEN_PROTOCOL_TERMS = [
  'Receipt',
  'Witness',
  'SuffixShell',
  'ImportOutcome',
  'SettlementResult',
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

describe('BTR wire DTO locality', () => {
  it('keeps BTR DTOs local to the git-warp BTR shell boundary', () => {
    for (const path of BTR_WIRE_DTO_FILES) {
      const source = readRepoFile(path);

      for (const term of FORBIDDEN_PROTOCOL_TERMS) {
        expect(source, `${path} must not grow ${term} responsibility`).not.toContain(term);
      }
    }
  });
});
