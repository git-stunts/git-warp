import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'warp sibling comparison '));
  fixtures.push(directory);
  const root = join(directory, 'head');
  const base = join(directory, 'base outside context');
  const commands = join(directory, 'commands');
  const copied = join(directory, 'copied');
  for (const path of [join(root, 'scripts'), join(root, 'docker'), base, commands, copied])
    mkdirSync(path, { recursive: true });
  copyFileSync(resolve('scripts/RunDockerPerformanceComparison.sh'), join(root, 'scripts/RunDockerPerformanceComparison.sh'));
  for (const name of ['Dockerfile.performance-comparison', 'Dockerfile.performance-comparison.dockerignore'])
    copyFileSync(resolve('docker', name), join(root, 'docker', name));
  for (const path of [root, base]) {
    writeFileSync(join(path, '.gitignore'), '.performance/\n');
    writeFileSync(join(path, 'source.txt'), path === root ? 'head source\n' : 'base source\n');
    git(path, 'init', '--initial-branch=main');
    git(path, 'add', '.');
    git(path, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Source');
  }
  const docker = join(commands, 'docker');
  writeFileSync(docker, `#!${shell}
set -euo pipefail
echo "$1" >> "$TRACE"
case "$1" in
  build)
    context="\${!#}"
    git -C "$context/base" rev-parse HEAD > "$COPIED/base"
    git -C "$context/head" rev-parse HEAD > "$COPIED/head"
    test "$(cat "$context/base/source.txt")" = 'base source'
    test "$(cat "$context/head/source.txt")" = 'head source'
    test -z "$(git -C "$context/head" config --get remote.origin.url || true)"
    ;;
  create)
    for arg in "$@"; do case "$arg" in --mount|--volume|-v) exit 91;; esac; done
    ;;
  start)
    mkdir -p "$COPIED/results"
    cp "$COPIED/base" "$COPIED/results/base.txt"
    cp "$COPIED/head" "$COPIED/results/head.txt"
    if [[ "$PAYLOAD_LINK" == 1 ]]; then ln -s "$COPIED/base" "$COPIED/results/link"; fi
    exit "$COMMAND_STATUS"
    ;;
  inspect) echo "$COMMAND_STATUS";;
  stop) ;;
  cp) cp -R "$COPIED/results" "$3";;
  rm) touch "$COPIED/removed";;
  *) exit 92;;
esac
`);
  chmodSync(docker, 0o755);
  return { directory, root, base, commands, copied };
}
function run(input: ReturnType<typeof fixture>, status = 0, output = '.performance/comparison', options = { payloadLink: false }) {
  return spawnSync(shell, [join(input.root, 'scripts/RunDockerPerformanceComparison.sh'),
    '--base-directory', input.base, '--head-directory', '.', '--output-directory', output, '--order-seed', '1'], {
    cwd: input.root, encoding: 'utf8', timeout: 15000,
    env: { PATH: [input.commands, dirname(shell)].join(delimiter), TRACE: join(input.directory, 'trace'),
      COPIED: input.copied, COMMAND_STATUS: String(status), PAYLOAD_LINK: options.payloadLink ? '1' : '0' },
  });
}
describe('manual copied-revision comparison', () => {
  it.each([0, 7])('copies sibling source identities, exports reports, and preserves status %i', (status) => {
    const input = fixture();
    const actual = run(input, status);
    expect(actual.error).toBeUndefined();
    expect(actual.status).toBe(status);
    expect(readFileSync(join(input.root, '.performance/comparison/base.txt'), 'utf8').trim())
      .toBe(git(input.base, 'rev-parse', 'HEAD'));
    expect(readFileSync(join(input.root, '.performance/comparison/head.txt'), 'utf8').trim())
      .toBe(git(input.root, 'rev-parse', 'HEAD'));
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });
  it('refuses a dirty source before building', () => {
    const input = fixture();
    writeFileSync(join(input.base, 'source.txt'), 'uncommitted\n');
    const actual = run(input);
    expect(actual.status).toBe(1);
    expect(actual.stderr).toContain('checkout must be clean');
    expect(existsSync(join(input.directory, 'trace'))).toBe(false);
  });
  it.each(['../outside', 'source.txt', '/tmp/outside'])('refuses unsafe or tracked output %s before building', (path) => {
    const input = fixture();
    expect(run(input, 0, path).status).toBe(2);
    expect(existsSync(join(input.directory, 'trace'))).toBe(false);
    expect(readFileSync(join(input.root, 'source.txt'), 'utf8')).toBe('head source\n');
  });
  it('refuses a symlink payload and still removes the container', () => {
    const input = fixture();
    const actual = run(input, 0, '.performance/comparison', { payloadLink: true });
    expect(actual.status).toBe(1);
    expect(existsSync(join(input.root, '.performance/comparison'))).toBe(false);
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });
  it('refuses a symlink destination before building', () => {
    const input = fixture();
    symlinkSync(input.copied, join(input.root, '.performance'));
    expect(run(input).status).toBe(2);
    expect(existsSync(join(input.directory, 'trace'))).toBe(false);
  });
});
