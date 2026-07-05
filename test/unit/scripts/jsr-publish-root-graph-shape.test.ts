import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import jsrJson from '../../../jsr.json' with { type: 'json' };

const ROOT_EXPORT_FILE = '../../../legacy.ts';
const ROOT_COMPATIBILITY_IMPORT = "from './rootCompatibility.ts'";
const ROOT_COMPATIBILITY_PUBLISH_ENTRY = 'rootCompatibility.ts';

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('JSR publish root graph shape', () => {
  it('publishes the root compatibility module imported by the root export', () => {
    expect(readRepoFile(ROOT_EXPORT_FILE)).toContain(ROOT_COMPATIBILITY_IMPORT);
    expect(jsrJson.publish.include).toContain(ROOT_COMPATIBILITY_PUBLISH_ENTRY);
  });
});
