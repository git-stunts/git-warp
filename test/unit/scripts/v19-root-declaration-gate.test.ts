import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findForbiddenRootDeclarationVocabulary } from '../../../scripts/v19-root-declaration-gate.ts';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('v19 root declaration vocabulary gate', () => {
  it('walks transitive declaration imports and reports substrate identifiers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'git-warp-v19-dts-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.d.ts'), "export type { Receipt } from './Receipt.ts';\n");
    writeFileSync(
      join(directory, 'Receipt.d.ts'),
      'export type Receipt = { readonly patchShas: string[]; readonly objectId: string };\n'
    );

    expect(findForbiddenRootDeclarationVocabulary(join(directory, 'index.d.ts'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'Receipt.d.ts', identifier: 'patchShas', token: 'sha' }),
        expect.objectContaining({
          file: 'Receipt.d.ts',
          identifier: 'objectId',
          token: 'object-id',
        }),
      ])
    );
  });

  it('accepts storage-neutral receipt and evidence declarations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'git-warp-v19-dts-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.d.ts'), "export type { Receipt } from './Receipt.ts';\n");
    writeFileSync(
      join(directory, 'Receipt.d.ts'),
      'export type Receipt = { readonly evidence: { readonly id: string } };\n'
    );

    expect(findForbiddenRootDeclarationVocabulary(join(directory, 'index.d.ts'))).toEqual([]);
  });
});
