import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCTRINE_FILES = Object.freeze([
  'CHANGELOG.md',
  'docs/READINGS_AND_OPTICS.md',
  'docs/topics/cli.md',
  'src/domain/api/Intent.ts',
  'src/domain/api/IntentRuntime.ts',
  'src/domain/services/PatchBuilder.ts',
  'src/domain/services/PatchBuilderEntity.ts',
  'src/domain/types/EntityCapturePayload.ts',
  'test/unit/domain/IntentRuntime.entity.test.ts',
  'test/unit/domain/services/PatchBuilder.entity.test.ts',
]);

const PAYLOAD_WORDING_FILES = Object.freeze([
  'src/domain/services/PatchBuilderEntity.ts',
  'test/unit/domain/Intent.entity.test.ts',
  'test/unit/domain/services/PatchBuilder.entity.test.ts',
]);

describe('entity capture doctrine', () => {
  it.each(DOCTRINE_FILES)('%s does not overclaim semantic dependency exactness', (path) => {
    expect(read(path)).not.toMatch(
      /dependency-pure|exact\s+by\s+construction|exactness\s+is\s+guaranteed|syntactic footprint is exact/i
    );
  });

  it('states that a declared empty read set cannot prove the caller made no pre-read', () => {
    expect(read('docs/READINGS_AND_OPTICS.md')).toMatch(
      /does not prove that\s+application code made no prior graph read/
    );
  });

  it.each(PAYLOAD_WORDING_FILES)('%s does not claim application payload completeness', (path) => {
    expect(read(path)).not.toMatch(/complete (?:initial )?payload/i);
  });
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}
