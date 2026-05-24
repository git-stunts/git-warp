import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW_COMPATIBILITY_PATTERN = /decodePropKey|decodeEdgePropKey|state\.prop|_content/u;
const DESIGN_DOC = 'docs/design/0203-v18-content-property-closeout-audit/v18-content-property-closeout-audit.md';
const EXPECTED_RAW_COMPATIBILITY_FILES = Object.freeze([
  'src/domain/graph/LegacyContentPropertyKeys.ts',
  'src/domain/services/ContentAttachmentProjection.ts',
  'src/domain/services/CoordinateFactExport.ts',
  'src/domain/services/ImmutableSnapshot.ts',
  'src/domain/services/JoinReducer.ts',
  'src/domain/services/KeyCodec.ts',
  'src/domain/services/OpStrategies.ts',
  'src/domain/services/OpStrategy.ts',
  'src/domain/services/PatchBuilder.ts',
  'src/domain/services/PatchBuilderValidation.ts',
  'src/domain/services/PatchCommitter.ts',
  'src/domain/services/TemporalQuery.ts',
  'src/domain/services/VisibleStateScope.ts',
  'src/domain/services/index/LogicalIndexBuildService.ts',
  'src/domain/services/state/CheckpointSerializer.ts',
  'src/domain/services/state/StateDiff.ts',
  'src/domain/services/state/StateSerializer.ts',
  'src/domain/services/state/WarpState.ts',
  'src/domain/services/state/checkpointHelpers.ts',
  'src/domain/services/strand/StrandPatchService.ts',
  'src/domain/services/transfer/transferOps.ts',
  'src/domain/types/CoordinateComparison.ts',
  'src/domain/types/ops/EdgePropSet.ts',
  'src/domain/types/ops/NodePropSet.ts',
  'src/domain/types/ops/PropSet.ts',
  'src/domain/types/ops/propHelpers.ts',
]);

describe('v18 content/property closeout audit', () => {
  it('keeps raw compatibility boundaries explicit and reviewed', async () => {
    const matches = await findRawCompatibilityFiles('src/domain');

    expect(matches).toEqual(EXPECTED_RAW_COMPATIBILITY_FILES);
  });

  it('documents every remaining raw compatibility boundary', async () => {
    const doc = await readFile(DESIGN_DOC, 'utf8');

    for (const file of EXPECTED_RAW_COMPATIBILITY_FILES) {
      expect(doc).toContain(file);
    }
  });
});

async function findRawCompatibilityFiles(root: string): Promise<readonly string[]> {
  const files = await collectTypeScriptFiles(root);
  const matches: string[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (RAW_COMPATIBILITY_PATTERN.test(content)) {
      matches.push(file);
    }
  }
  return Object.freeze(matches.sort());
}

async function collectTypeScriptFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(path));
      continue;
    }
    if (entry.isFile() && path.endsWith('.ts')) {
      files.push(toPosixPath(relative('', path)));
    }
  }
  return Object.freeze(files);
}

function toPosixPath(path: string): string {
  return path.split('\\').join('/');
}
