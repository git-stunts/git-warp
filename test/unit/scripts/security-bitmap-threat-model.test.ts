import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

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
