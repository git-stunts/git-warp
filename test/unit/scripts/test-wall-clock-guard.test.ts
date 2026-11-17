import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { TEST_WALL_CLOCK_SELECTORS } from '../../../scripts/TestWallClockSelectors.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const RULE = 'no-restricted-syntax';

// Real files of each kind. lintText lints the fixture source as if it were
// that file, so the repository config decides which rules apply.
const TS_PATH = 'test/unit/scripts/test-wall-clock-guard.test.ts';
const MJS_PATH = 'test/fixtures/minimatch-security-probe.mjs';
const MTS_PATH = 'test/unit/scripts/run-stable-unit-tests-extension-fixture.test.mts';

// Oracle: each source reads the wall clock or waits on a real timer, so the
// repository lint config must report it.
const REJECTED = Object.freeze([
  { form: 'globalThis.Date.now()', path: TS_PATH, source: 'globalThis.Date.now();\n' },
  { form: 'new globalThis.Date()', path: TS_PATH, source: 'new globalThis.Date();\n' },
  { form: 'globalThis.Date()', path: TS_PATH, source: 'globalThis.Date();\n' },
  { form: "Date['now']", path: TS_PATH, source: "Date['now']();\n" },
  { form: 'an alias of Date', path: TS_PATH, source: 'const D = Date;\nD.now();\n' },
  { form: 'globalThis.performance.now()', path: TS_PATH, source: 'globalThis.performance.now();\n' },
  { form: 'performance imported under another name', path: TS_PATH,
    source: "import { performance as perf } from 'node:perf_hooks';\nperf.now();\n" },
  { form: 'now destructured from performance', path: TS_PATH, source: 'const { now } = performance;\nnow();\n' },
  { form: 'performance destructured from a dynamic import', path: TS_PATH,
    source: "const { performance: perf } = await import('node:perf_hooks');\nperf.now();\n" },
  { form: 'process.hrtime()', path: TS_PATH, source: 'process.hrtime();\n' },
  { form: 'process.hrtime.bigint()', path: TS_PATH, source: 'process.hrtime.bigint();\n' },
  { form: 'process.uptime()', path: TS_PATH, source: 'process.uptime();\n' },
  { form: 'hrtime destructured from process', path: TS_PATH, source: 'const { hrtime } = process;\nhrtime();\n' },
  { form: 'scheduler.wait()', path: TS_PATH,
    source: "import { scheduler } from 'node:timers/promises';\nawait scheduler.wait(5);\n" },
  { form: 'setTimeout destructured from a dynamic import', path: TS_PATH,
    source: "const { setTimeout: sleep } = await import('node:timers/promises');\nawait sleep(5);\n" },
  { form: "globalThis['setTimeout']", path: TS_PATH, source: "globalThis['setTimeout'](() => undefined, 5);\n" },
  { form: 'vi.waitFor()', path: TS_PATH, source: "import { vi } from 'vitest';\nawait vi.waitFor(() => undefined);\n" },
  { form: 'Date.now() in an .mjs test file', path: MJS_PATH, source: 'Date.now();\n' },
  { form: 'setTimeout() in an .mts test file', path: MTS_PATH, source: 'setTimeout(() => undefined, 5);\n' },
]);

// Oracle: none of these reads the wall clock or waits on a timer.
const ACCEPTED = Object.freeze([
  { form: 'a fixed date', source: "new Date(0);\nDate.parse('2026-01-01T00:00:00.000Z');\n" },
  { form: 'an injected clock', source: 'const clock = { now: () => 0 };\nconst { now } = clock;\nnow();\n' },
  { form: 'process.env', source: "const { env } = process;\nenv['X'] = '1';\n" },
  { form: 'fake timers', source: "import { vi } from 'vitest';\nvi.useFakeTimers();\nvi.useRealTimers();\n" },
  { form: 'an event-loop turn', source: "import { setImmediate as nextTurn } from 'node:timers/promises';\nawait nextTurn();\n" },
]);

async function restrictedSyntaxHits(path: string, source: string): Promise<{ hits: number; fatal: string[] }> {
  const [result] = await new ESLint({ cwd: repoRoot }).lintText(source, { filePath: path });
  const messages = result?.messages ?? [];
  return {
    hits: messages.filter((message) => message.ruleId === RULE).length,
    fatal: messages.filter((message) => message.fatal === true).map((message) => message.message),
  };
}

function filesUnder(relativePath: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(repoRoot, relativePath), { withFileTypes: true })) {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        files.push(...filesUnder(entryPath));
      }
    } else if (/\.(?:[cm]?ts|[cm]?js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

describe('test wall-clock lint guard', () => {
  it.each(REJECTED)('rejects $form', async ({ path, source }) => {
    const { hits, fatal } = await restrictedSyntaxHits(path, source);
    expect(fatal).toEqual([]);
    expect(hits).toBeGreaterThan(0);
  });

  it.each(ACCEPTED)('accepts $form', async ({ source }) => {
    expect(await restrictedSyntaxHits(TS_PATH, source)).toEqual({ hits: 0, fatal: [] });
  });

  // The lint config ignores test/runtime (Deno) and test/type-check (packed
  // type fixtures): the typed test rules cannot parse them. This applies the
  // same selectors to them directly, without types.
  it('finds no wall-clock reads in the test directories that lint ignores', () => {
    const files = [...filesUnder('test/runtime'), ...filesUnder('test/type-check')];
    expect(files.length).toBeGreaterThan(0);
    const linter = new Linter({ configType: 'flat' });
    const rule: Linter.RuleEntry = ['error', ...TEST_WALL_CLOCK_SELECTORS];
    const config: Linter.Config = {
      languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
      rules: { [RULE]: rule },
    };
    const hits = files.flatMap((file) => linter.verify(readFileSync(join(repoRoot, file), 'utf8'), config)
      .map((message) => `${file}:${message.line} ${message.message}`));
    expect(hits).toEqual([]);
  });
});
