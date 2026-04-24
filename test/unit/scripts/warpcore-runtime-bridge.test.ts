import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const warpCorePath = join(process.cwd(), 'src/domain/WarpCore.ts');
const warpCoreSource = readFileSync(warpCorePath, 'utf8');

describe('WarpCore runtime bridge', () => {
  it('does not import WarpRuntime directly', () => {
    expect(warpCoreSource).not.toContain("import type WarpRuntime");
    expect(warpCoreSource).not.toContain("import WarpRuntime");
  });

  it('does not call WarpRuntime prototype methods directly', () => {
    expect(warpCoreSource).not.toContain('WarpRuntime.prototype');
  });

  it('does not use record-shaped option bags for strand patch listing', () => {
    expect(warpCoreSource).not.toContain('Record<string, unknown>');
  });
});
