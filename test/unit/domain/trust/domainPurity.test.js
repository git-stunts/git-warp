/**
 * Domain purity test for src/domain/trust/.
 *
 * Ensures no infrastructure leakage into the trust domain layer:
 * - No process.env references
 * - No imports from infrastructure/ or adapters/
 * - No direct console usage
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TRUST_DIR = path.resolve('src/domain/trust');

function getTrustFiles() {
  return fs.readdirSync(TRUST_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({
      name: f,
      content: fs.readFileSync(path.join(TRUST_DIR, f), 'utf8'),
    }));
}

describe('domain/trust/ purity', () => {
  const files = getTrustFiles();

  it('has at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { name, content } of files) {
    describe(name, () => {
      it('does not reference process.env', () => {
        expect(content).not.toMatch(/process\.env/);
      });

      it('does not import from infrastructure/', () => {
        expect(content).not.toMatch(/from\s+['"].*infrastructure\//);
      });

      it('does not import from adapters/', () => {
        expect(content).not.toMatch(/from\s+['"].*adapters\//);
      });

      it('does not use console directly', () => {
        // Allow console in comments but not in code
        const lines = content.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
        const codeOnly = lines.join('\n');
        expect(codeOnly).not.toMatch(/\bconsole\./);
      });
    });
  }
});
