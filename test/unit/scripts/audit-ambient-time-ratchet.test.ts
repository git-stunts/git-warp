import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

const DOMAIN_TIME_BOUNDARIES = Object.freeze([
  'src/domain/services/provenance/BTR.ts',
  'src/domain/services/audit/AuditReceiptService.ts',
  'src/domain/services/audit/AuditVerifierService.ts',
  'src/domain/services/sync/SyncAuthService.ts',
]);

const AMBIENT_TIME_PATTERNS = Object.freeze([
  'Date.now(',
  'new Date(',
  'Date(',
  'performance.now(',
]);

const WALL_CLOCK_SUPPRESSION_PATTERN =
  /eslint-disable-next-line[^\n]*(?:no-restricted-syntax|Date\.now|new Date|Date\(|performance\.now|wall-clock|ambient time)/;

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function domainSourceFiles(relativePath = 'src/domain'): string[] {
  const absolutePath = join(repoRoot, relativePath);
  const files: string[] = [];
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...domainSourceFiles(entryPath));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

describe('domain ambient time ratchet', () => {
  it('keeps audit, provenance, and sync auth from generating wall-clock time in domain code', () => {
    for (const relativePath of DOMAIN_TIME_BOUNDARIES) {
      const text = source(relativePath);
      for (const pattern of AMBIENT_TIME_PATTERNS) {
        expect(text, `${relativePath} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });

  it('forbids wall-clock lint suppressions in domain code', () => {
    for (const relativePath of domainSourceFiles()) {
      const text = source(relativePath);
      expect(text, `${relativePath} must not suppress wall-clock restrictions`)
        .not.toMatch(WALL_CLOCK_SUPPRESSION_PATTERN);
    }
  });
});
