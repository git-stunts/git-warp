import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const MANIFESTS = [
  '../../policy/quarantines/HYGIENE-consistent-type-imports.json',
  '../../policy/quarantines/HYGIENE-restrict-template-expressions.json',
] as const;

const hygieneManifestSchema = z.object({
  files: z.array(z.string()),
}).passthrough();

type HygieneManifest = z.infer<typeof hygieneManifestSchema>;

function readManifest(relativePath: string): HygieneManifest {
  return hygieneManifestSchema.parse(JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'),
  ));
}

function expectEmptyFilesArray(manifest: HygieneManifest): void {
  expect(manifest.files).toEqual([]);
}

describe('hygiene quarantine graduation', () => {
  it('graduates both HYGIENE manifests to empty file lists', () => {
    for (const manifestPath of MANIFESTS) {
      expectEmptyFilesArray(readManifest(manifestPath));
    }
  });
});
