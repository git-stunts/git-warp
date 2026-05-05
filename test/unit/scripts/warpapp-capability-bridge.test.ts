import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const warpAppPath = join(process.cwd(), 'src/domain/WarpApp.ts');
const warpAppSource = readFileSync(warpAppPath, 'utf8');

describe('WarpApp capability bridge', () => {
  it('does not import WarpRuntime directly', () => {
    expect(warpAppSource).not.toContain("import type WarpRuntime");
    expect(warpAppSource).not.toContain("import WarpRuntime");
  });

  it('does not use callInternalRuntimeMethod for content reads', () => {
    expect(warpAppSource).not.toContain('callInternalRuntimeMethod');
  });
});
