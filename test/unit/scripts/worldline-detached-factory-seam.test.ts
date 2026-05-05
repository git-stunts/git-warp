import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const worldlinePath = join(process.cwd(), 'src/domain/services/Worldline.ts');
const worldlineSource = readFileSync(worldlinePath, 'utf8');

describe('Worldline detached factory seam', () => {
  it('does not import WarpRuntime directly', () => {
    expect(worldlineSource).not.toContain("import WarpRuntime");
    expect(worldlineSource).not.toContain("import type WarpRuntime");
  });

  it('does not rely on direct runtime detached-open logic', () => {
    expect(worldlineSource).not.toContain('WarpRuntime.open(');
    expect(worldlineSource).not.toContain('buildDetachedOpenOptions(');
  });

  it('does not use the observer cast corridor', () => {
    expect(worldlineSource).not.toContain('as unknown as');
  });
});
