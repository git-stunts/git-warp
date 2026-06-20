import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

const AUDIT_TIME_BOUNDARIES = Object.freeze([
  'src/domain/services/provenance/BTR.ts',
  'src/domain/services/audit/AuditReceiptService.ts',
  'src/domain/services/audit/AuditVerifierService.ts',
]);

const AMBIENT_TIME_PATTERNS = Object.freeze([
  'Date.now(',
  'new Date(',
  'Date(',
  'performance.now(',
]);

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('audit/provenance ambient time ratchet', () => {
  it('keeps BTR and audit services from generating wall-clock time in domain code', () => {
    for (const relativePath of AUDIT_TIME_BOUNDARIES) {
      const text = source(relativePath);
      for (const pattern of AMBIENT_TIME_PATTERNS) {
        expect(text, `${relativePath} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });
});
