import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const helperPaths = [
  '../../../test/bats/helpers/append-patch.ts',
  '../../../test/bats/helpers/seed-audit-graph.ts',
  '../../../test/bats/helpers/seed-doctor-graph.ts',
  '../../../test/bats/helpers/seed-graph.ts',
  '../../../test/bats/helpers/seed-multiwriter.ts',
  '../../../test/bats/helpers/seed-rich.ts',
  '../../../test/bats/helpers/seed-setup.ts',
  '../../../test/bats/helpers/seed-trust-sync.ts',
  '../../../test/bats/helpers/seed-trust.ts',
  '../../../test/helpers/concurrencyHarness.ts',
  '../../../test/integration/api/helpers/setup.ts',
  '../../../test/runtime/deno/helpers.ts',
] as const;

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

describe('WarpRuntime helper migration', () => {
  it('keeps seed and helper openers off the runtime class', () => {
    for (const path of helperPaths) {
      const text = source(path);
      expect(text, path).not.toContain('WarpRuntime.open(');
      expect(text, path).not.toContain('src/domain/WarpRuntime.ts');
      expect(text, path).not.toContain('import WarpRuntime');
      expect(text, path).not.toContain('import type WarpRuntime');
      expect(text, path).not.toContain('instanceof WarpRuntime');
    }
  });

  it('keeps helper docs from teaching WarpRuntime as the helper product', () => {
    for (const path of helperPaths) {
      const text = source(path);
      expect(text, path).not.toContain('Opened WarpRuntime');
      expect(text, path).not.toContain('fork() returns a usable WarpRuntime');
      expect(text, path).not.toContain('WarpRuntime instance');
    }
  });
});
