import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../../../package.json' with { type: 'json' };

// Size: medium. Actual launcher/runner/exporter, controlled Docker transport.
// Oracle: only complete argument-free npm coverage may raise host thresholds.

const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const fixtures: string[] = [];
const baseline = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { coverage: { include: ['src/**/*.ts'], thresholds: { lines: 0, autoUpdate: false } } } });
`;

function fixture(outcome: 'passed' | 'unhandled-error') {
  const directory = mkdtempSync(join(tmpdir(), 'coverage Docker route '));
  fixtures.push(directory);
  const root = join(directory, 'host');
  const copied = join(directory, 'copied');
  const commands = join(directory, 'commands');
  for (const path of [join(root, 'scripts'), join(copied, 'src'), join(copied, 'test/unit'), commands]) {
    mkdirSync(path, { recursive: true });
  }
  copyFileSync(resolve('scripts/RunDockerTestContainer.sh'), join(root, 'scripts/RunDockerTestContainer.sh'));
  for (const path of [root, copied]) writeFileSync(join(path, 'vitest.config.ts'), baseline);
  writeFileSync(join(root, '.gitignore'), 'coverage/\n.ratchet/\n');
  execFileSync('git', ['init', '--initial-branch=main', root]);
  execFileSync('git', ['-C', root, 'add', '.gitignore', 'vitest.config.ts']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Source baseline']);
  symlinkSync(resolve('node_modules'), join(copied, 'node_modules'), 'dir');
  symlinkSync(resolve('scripts'), join(copied, 'scripts'), 'dir');
  writeFileSync(join(copied, 'package.json'), '{"type":"module"}');
  writeFileSync(join(copied, 'src/value.ts'), 'export function value() { return 42; }\n');
  writeFileSync(join(copied, 'test/unit/value.test.ts'), `import { it, expect } from 'vitest';
import { value } from '../../src/value.ts';
it('passes', async () => {
  ${outcome === 'unhandled-error' ? "Promise.reject(new Error('controlled route error')); await new Promise(resolve => setTimeout(resolve, 25));" : ''}
  expect(value()).toBe(42);
});
`);
  const docker = join(commands, 'docker');
  writeFileSync(docker, `#!${shell}
set -euo pipefail
for arg in "$@"; do case "$arg" in --mount|--volume|-v) exit 91;; esac; done
case "$1" in
  compose) echo controlled-container;;
  exec)
    shift
    [[ "$1" == --interactive ]] && shift
    shift
    cd "$COPIED"
    unset npm_lifecycle_event
    exec "$@"
    ;;
  stop|rm) :;;
  cp)
    case "$2" in
      *:/app/coverage) cp -R "$COPIED/coverage" "$3";;
      *:/app/vitest.config.ts) cp "$COPIED/vitest.config.ts" "$3";;
      *) exit 92;;
    esac;;
  *) exit 93;;
esac
`);
  chmodSync(docker, 0o755);
  return { directory, root, copied, commands };
}

function run(input: ReturnType<typeof fixture>, script: 'test:coverage' | 'test:coverage:ci', args: string[] = []) {
  const receiving = packageJson.scripts[script].split(' -- ')[1];
  if (!receiving) throw new Error('Missing actual Docker receiving command');
  return spawnSync(shell, [join(input.root, 'scripts/RunDockerTestContainer.sh'),
    '0', script === 'test:coverage' ? '1' : '0', '2', 'none', 'directory:coverage', '--',
    ...receiving.split(' '), ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { PATH: [input.commands, dirname(process.execPath), dirname(shell)].join(delimiter),
      COPIED: input.copied, npm_lifecycle_event: script },
  });
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('coverage update intent through the actual Docker command and exporter', () => {
  it('raises an authorized full threshold when Docker exec does not forward npm lifecycle metadata', () => {
    const input = fixture('passed');
    const result = run(input, 'test:coverage');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('complete (1 files); zero errors');
    expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8')).toBe(baseline.replace('lines: 0,', 'lines: 100,'));
  });
  it.each(['ci', 'targeted'])('keeps the %s threshold unchanged without lifecycle metadata', mode => {
    const input = fixture('passed');
    const result = mode === 'ci' ? run(input, 'test:coverage:ci') : run(input, 'test:coverage', ['test/unit/value.test.ts']);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8')).toBe(baseline);
  });
  it('keeps both copied and host thresholds unchanged when the receiving run has an error', () => {
    const input = fixture('unhandled-error');
    const result = run(input, 'test:coverage');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain('controlled route error');
    expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8')).toBe(baseline);
    expect(readFileSync(join(input.copied, 'vitest.config.ts'), 'utf8')).toBe(baseline);
  });
});
