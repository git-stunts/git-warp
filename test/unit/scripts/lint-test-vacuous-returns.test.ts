import { describe, expect, it } from 'vitest';
import { collectBareTestReturnsFromSource } from '../../../scripts/lint-test-vacuous-returns.ts';

describe('lint-test-vacuous-returns', () => {
  it('reports bare returns directly inside it callbacks', () => {
    const findings = collectBareTestReturnsFromSource('sample.test.ts', [
      "import { it } from 'vitest';",
      "it('can silently pass', () => {",
      '  if (!ready) {',
      '    return;',
      '  }',
      '  expect(ready).toBe(true);',
      '});',
    ].join('\n'));

    expect(findings).toEqual([
      { filePath: 'sample.test.ts', line: 4, column: 5 },
    ]);
  });

  it('ignores returns inside nested helper functions and classes', () => {
    const findings = collectBareTestReturnsFromSource('sample.test.ts', [
      "import { it } from 'vitest';",
      "it('uses local helpers', () => {",
      '  function helper(): void {',
      '    return;',
      '  }',
      '  class Stub {',
      '    method(): void {',
      '      return;',
      '    }',
      '  }',
      '  helper();',
      '  expect(new Stub()).toBeInstanceOf(Stub);',
      '});',
    ].join('\n'));

    expect(findings).toEqual([]);
  });
});
