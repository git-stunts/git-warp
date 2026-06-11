import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REDUCER_TEST_FILES = [
  '../../../test/unit/domain/properties/Join.property.test.ts',
  '../../../test/unit/domain/services/BoundaryTransitionRecord.test.ts',
  '../../../test/unit/domain/services/JoinReducer.edgeProps.test.ts',
  '../../../test/unit/domain/services/JoinReducer.integration.test.ts',
  '../../../test/unit/domain/services/JoinReducer.pathEquivalence.test.ts',
  '../../../test/unit/domain/services/JoinReducer.receipts.test.ts',
  '../../../test/unit/domain/services/JoinReducer.test.ts',
  '../../../test/unit/domain/services/JoinReducer.trackDiff.test.ts',
  '../../../test/unit/domain/services/JoinReducer.validation.test.ts',
  '../../../test/unit/domain/services/MaterializedView.equivalence.test.ts',
  '../../../test/unit/domain/services/ProvenancePayload.test.ts',
  '../../../test/unit/domain/services/SyncProtocol.test.ts',
  '../../../test/unit/domain/services/WormholeService.test.ts',
  '../../../test/unit/scripts/visible-state-upgrade.test.ts',
] as const;

const REDUCE_PATCHES_ALIAS = /reducePatches\s+as\s+_reducePatches/;
const REDUCE_PATCHES_ANY_SIGNATURE = /const\s+reducePatches[\s\S]*?\(\s*\.\.\.args:\s*any\[\]\s*\)\s*=>\s*any/;
const REDUCE_PATCHES_ANY_CAST = /reducePatches\([^;\n]*\)\s+as\s+any/;
const REDUCE_PATCHES_TYPED_WRAPPER = /const\s+reducePatches\s*=\s*\([^)]*any[^)]*\)\s*:\s*any\s*=>/;

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('reducePatches test type hygiene', () => {
  it('does not launder reducePatches through any-typed aliases', () => {
    const offenders = REDUCER_TEST_FILES.flatMap((path) => {
      const source = readRepoFile(path);
      const failures = [
        REDUCE_PATCHES_ALIAS.test(source) ? 'aliased import' : '',
        REDUCE_PATCHES_ANY_SIGNATURE.test(source) ? 'any rest signature' : '',
        REDUCE_PATCHES_ANY_CAST.test(source) ? 'any return cast' : '',
        REDUCE_PATCHES_TYPED_WRAPPER.test(source) ? 'any wrapper signature' : '',
      ].filter((failure) => failure.length > 0);

      return failures.map((failure) => `${path}: ${failure}`);
    });

    expect(offenders).toEqual([]);
  });
});
