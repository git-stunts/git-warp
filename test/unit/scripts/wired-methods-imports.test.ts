import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const wiredMethods = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/_wiredMethods.d.ts', import.meta.url)),
  'utf8',
);

describe('_wiredMethods import shape', () => {
  it('does not reference stale JavaScript module specifiers', () => {
    const staleSpecifiers = wiredMethods.matchAll(/(?:from|import\()\s*['"][^'"]+\.js['"]/g);
    expect([...staleSpecifiers].map((match) => match[0])).toEqual([]);
  });
});
