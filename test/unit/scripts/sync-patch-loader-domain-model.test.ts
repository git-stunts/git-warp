import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/domain/services/sync/syncPatchLoader.ts'),
  'utf8',
);

describe('sync patch loader domain model', () => {
  it('reserves interface declarations for ports', () => {
    expect(SOURCE).not.toMatch(/export interface (DecodedPatch|LoadPatchRangeOptions)\b/u);
  });
});
