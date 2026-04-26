import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MANIFESTS = [
  '../../policy/quarantines/HYGIENE-consistent-type-imports.json',
  '../../policy/quarantines/HYGIENE-restrict-template-expressions.json',
] as const;

function readManifest(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function expectEmptyFilesArray(manifest: string): void {
  expect(manifest).toMatch(/"files"\s*:\s*\[\s*\]/u);
}

describe('hygiene quarantine graduation', () => {
  it('graduates both HYGIENE manifests to empty file lists', () => {
    for (const manifestPath of MANIFESTS) {
      expectEmptyFilesArray(readManifest(manifestPath));
    }
  });
});
