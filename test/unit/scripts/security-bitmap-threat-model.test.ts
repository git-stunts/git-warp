import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

it('documents bitmap input provenance and expired risk acceptance honestly', () => {
  const document = readFileSync('.github/SECURITY.md', 'utf8');
  const bitmapRows = document.split('\n').filter((line) => line.startsWith('| `roaring-wasm`'));
  expect(bitmapRows).toHaveLength(2);
  for (const row of bitmapRows) {
    expect(row).not.toContain('No network-facing input');
    expect(row).not.toContain('no untrusted input');
    expect(row).toContain('peer-controlled');
  }
  expect(bitmapRows[1]).toContain('EXPIRED 2026-08-01');
});

it('keeps the dependency risk inventory aligned with direct production dependencies', () => {
  const { dependencies } = new PackedArtifactBoundaryAdapter().read(
    'package.json', z.object({ dependencies: z.record(z.string()) })
  );
  const document = readFileSync('.github/SECURITY.md', 'utf8');
  const table = document.split('## Dependency Risk Assessment')[1]?.split('## Accepted Risks')[0] ?? '';
  const packages = [...table.matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]);
  expect(packages.sort()).toEqual(Object.keys(dependencies).sort());
});
