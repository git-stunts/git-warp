import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const shimPath = join(process.cwd(), 'src/domain/warp/_internal.ts');
const queryControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/QueryController.ts'),
  'utf8',
);
const queryReadsSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/QueryReads.ts'),
  'utf8',
);
const queryContentSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/QueryContent.ts'),
  'utf8',
);
const provenanceControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/ProvenanceController.ts'),
  'utf8',
);
const checkpointControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/CheckpointController.ts'),
  'utf8',
);
const patchControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/PatchController.ts'),
  'utf8',
);
const syncControllerSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/SyncController.ts'),
  'utf8',
);
const materializeHelpersSource = readFileSync(
  join(process.cwd(), 'src/domain/services/controllers/MaterializeHelpers.ts'),
  'utf8',
);

describe('internal runtime shim closeout', () => {
  it('deletes the _internal runtime shim file', () => {
    expect(existsSync(shimPath)).toBe(false);
  });

  it('keeps the remaining controller surfaces off the shim import path', () => {
    const sources = [
      queryControllerSource,
      queryReadsSource,
      queryContentSource,
      provenanceControllerSource,
      checkpointControllerSource,
      patchControllerSource,
      syncControllerSource,
      materializeHelpersSource,
    ];
    for (const source of sources) {
      expect(source).not.toContain("warp/_internal");
    }
  });
});
