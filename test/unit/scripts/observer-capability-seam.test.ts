import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const observerSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/services/query/Observer.ts', import.meta.url)),
  'utf8',
);

describe('Observer capability seam', () => {
  it('does not import WarpRuntime', () => {
    expect(observerSource).not.toContain("import type WarpRuntime");
    expect(observerSource).not.toContain("../../WarpRuntime.ts");
  });

  it('does not rely on as unknown as casts', () => {
    expect(observerSource).not.toContain('as unknown as');
  });

  it('uses the TypeScript state-reader import path', () => {
    expect(observerSource).not.toContain("../state/StateReader.js");
    expect(observerSource).toContain("../state/StateReader.ts");
  });

  it('constructs traversal directly from the observer seam', () => {
    expect(observerSource).toContain('this.traverse = new LogicalTraversal(this);');
  });
});
