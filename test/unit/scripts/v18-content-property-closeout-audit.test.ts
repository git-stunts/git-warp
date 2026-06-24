import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Matches raw prop-key decode calls, direct state.prop map access, and legacy
// _content property key usage.
//
// The _content alternation has two arms:
//   1. (?<![a-z])_content(?![A-Z]) — matches standalone _content usages (property
//      key literals, _content.mime, _content_${oid}) but NOT op-name suffixes like
//      "attach_node_content" (preceded by lowercase 't') or field prefixes like
//      "_contentBlobs" (followed by uppercase 'B').
//   2. \\t_content_ — catches the Git tree-entry format `\t_content_${oid}` written
//      inside template literals, where \t appears as the two source chars '\' and 't',
//      making the simple lookbehind miss it.
const RAW_COMPATIBILITY_PATTERN = /decodePropKey|decodeEdgePropKey|state\.prop|(?:(?<![a-z])_content(?![A-Z])|\\t_content_)/u;
const EXPECTED_RAW_COMPATIBILITY_FILES = Object.freeze([
  'src/domain/graph/LegacyContentPropertyKeys.ts',
  'src/domain/services/KeyCodec.ts',
  'src/domain/services/PatchCommitter.ts',
  'src/domain/services/state/StateDiff.ts',
  'src/domain/services/state/WarpState.ts',
  'src/domain/services/state/checkpointHelpers.ts',
  'src/domain/services/strand/StrandPatchService.ts',
]);

describe('v18 content/property closeout audit', () => {
  it('keeps raw compatibility boundaries explicit and reviewed', async () => {
    const matches = await findRawCompatibilityFiles('src/domain');

    expect(matches).toEqual(EXPECTED_RAW_COMPATIBILITY_FILES);
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
