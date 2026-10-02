import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const fixtures: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'warp Docker exports '));
  fixtures.push(directory);
  const root = join(directory, 'repository');
  const copied = join(directory, 'copied');
  const commands = join(directory, 'commands');
  for (const path of [join(root, 'scripts'), join(copied, 'coverage'), commands])
    mkdirSync(path, { recursive: true });
  copyFileSync(resolve('scripts/RunDockerTestContainer.sh'), join(root, 'scripts/RunDockerTestContainer.sh'));
  writeFileSync(join(root, 'vitest.config.ts'), 'baseline\n');
  writeFileSync(join(root, 'tracked.ts'), 'preserved source\n');
  writeFileSync(join(root, '.gitignore'), '.ratchet/\ncoverage/\n');
  git(root, 'init', '--initial-branch=main');
  git(root, 'add', 'tracked.ts', 'vitest.config.ts', '.gitignore');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-m', 'Source identity');
  writeFileSync(join(copied, 'coverage/report.txt'), 'coverage evidence\n');
  writeFileSync(join(copied, 'vitest.config.ts'), 'candidate\n');
  mkdirSync(join(copied, '.ratchet/fixture'), { recursive: true });
  writeFileSync(join(copied, '.ratchet/fixture/snapshot.json'), 'snapshot evidence\n');
  const docker = join(commands, 'docker');
  writeFileSync(docker, `#!${shell}
set -euo pipefail
echo "$1" >> "$TRACE"
case "$1" in
  compose)
    for arg in "$@"; do case "$arg" in --rm|--mount|--volume|-v) exit 91;; esac; done
    if [[ "$*" == *" down "* ]]; then
      [[ "$*" == *"--rmi local"* ]]
    fi
    echo fixture-container
    ;;
  exec)
    if [[ "$3" == mkdir ]]; then mkdir -p "$COPIED/\${5#/app/}"; exit; fi
    if [[ "$CHANGE_HOST_CONFIG" == 1 ]]; then echo concurrent-edit > "$ROOT/vitest.config.ts"; fi
    if [[ "$SIGNAL" == 1 ]]; then
      echo "$$" > "$TRACE.client"
      kill -TERM "$PPID"
      exec sleep 30
    fi
    exit "$EXEC_STATUS"
    ;;
  stop)
    if [[ -f "$TRACE.client" ]]; then kill "$(cat "$TRACE.client")" 2>/dev/null || true; fi
    ;;
  cp)
    case "$2" in
      */source.git/.)
        mkdir -p "$COPIED/.git"
        cp -R "$2" "$COPIED/.git/"
        ;;
      *:/app/coverage) cp -R "$COPIED/coverage" "$3";;
      *:/app/.ratchet) cp -R "$COPIED/.ratchet" "$3";;
      *:/app/vitest.config.ts) cp "$COPIED/vitest.config.ts" "$3";;
      *)
        if [[ "$3" == *:/app/* ]]; then cp "$2" "$COPIED/\${3#*:/app/}";
        else echo "Unexpected copy: $*" >&2; exit 92; fi
        ;;
    esac
    ;;
  rm) touch "$COPIED/removed";;
  *) echo "Unexpected operation: $*" >&2; exit 93;;
esac
`);
  chmodSync(docker, 0o755);
  return { directory, root, copied, commands };
}

function run(input: ReturnType<typeof fixture>, entries: string[], status = 0,
  options = { updateRatchet: false, sourceHistory: false, concurrentEdit: false, signal: false }) {
  return spawnSync(shell, [join(input.root, 'scripts/RunDockerTestContainer.sh'),
    options.sourceHistory ? '1' : '0', options.updateRatchet ? '1' : '0',
    String(entries.length + 1), 'none', ...entries, '--', 'fixture-command'], {
    encoding: 'utf8', timeout: 15000,
    env: { PATH: [input.commands, dirname(process.execPath), dirname(shell)].join(delimiter),
      ROOT: input.root, COPIED: input.copied, TRACE: join(input.directory, 'trace'),
      EXEC_STATUS: String(status), CHANGE_HOST_CONFIG: options.concurrentEdit ? '1' : '0',
      SIGNAL: options.signal ? '1' : '0' },
  });
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Docker artifact exports', () => {
  it('copies a selected ignored input without exporting it or exposing a mount', () => {
    const input = fixture();
    mkdirSync(join(input.root, '.ratchet/input'), { recursive: true });
    writeFileSync(join(input.root, '.ratchet/input/report.txt'), 'selected input\n');
    const result = run(input, ['input:.ratchet/input/report.txt'], 7);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(7);
    expect(readFileSync(join(input.copied, '.ratchet/input/report.txt'), 'utf8')).toBe('selected input\n');
    expect(readFileSync(join(input.root, '.ratchet/input/report.txt'), 'utf8')).toBe('selected input\n');
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });
  it.each([0, 7])('exports reports before removal and preserves command status %i', (status) => {
    const input = fixture();
    const result = run(input, ['directory:coverage'], status);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(status);
    expect(readFileSync(join(input.root, 'coverage/report.txt'), 'utf8')).toBe('coverage evidence\n');
    expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8')).toBe('baseline\n');
    expect(readFileSync(join(input.directory, 'trace'), 'utf8').trim().split('\n'))
      .toEqual(['compose', 'exec', 'stop', 'cp', 'rm', 'compose']);
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });

  it('applies an authorized coverage update after success', () => {
    const input = fixture();
    const result = run(input, ['directory:coverage'], 0,
      { updateRatchet: true, sourceHistory: false, concurrentEdit: false, signal: false });
    expect(result.status).toBe(0);
    expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8')).toBe('candidate\n');
  });

  it.each([[true, 0, 1], [false, 7, 7]])(
    'retains the candidate when host configuration changes or the suite fails (%j, %i)',
    (concurrentEdit, commandStatus, expectedStatus) => {
      const input = fixture();
      const result = run(input, ['directory:coverage'], commandStatus,
        { updateRatchet: true, sourceHistory: false, concurrentEdit, signal: false });
      expect(result.status).toBe(expectedStatus);
      expect(readFileSync(join(input.root, 'vitest.config.ts'), 'utf8'))
        .toBe(concurrentEdit ? 'concurrent-edit\n' : 'baseline\n');
      const evidence = join(input.root, '.ratchet/docker-results');
      const owner = readdirSync(evidence)[0];
      expect(owner).toBeDefined();
      expect(readFileSync(join(evidence, owner ?? '', 'vitest.config.ts'), 'utf8')).toBe('candidate\n');
      expect(existsSync(join(input.copied, 'removed'))).toBe(true);
    });

  it.each(['file:tracked.ts', 'file:vitest.config.ts', 'directory:../escape', 'file:a//b', 'file:.GIT/config', 'file:.GiT/config', 'file:cache/.GIT/config', 'file:NODE_MODULES/package.json', 'file:TRACKED.ts', 'file:VITEST.CONFIG.TS'])(
    'refuses unsafe or tracked export destination %s before starting Docker', (entry) => {
      const input = fixture();
      const result = run(input, [entry]);
      expect(result.status).toBe(1);
      expect(existsSync(join(input.directory, 'trace'))).toBe(false);
      expect(readFileSync(join(input.root, 'tracked.ts'), 'utf8')).toBe('preserved source\n');
    });

  it('refuses a symlink payload and still removes the container', () => {
    const input = fixture();
    symlinkSync(join(input.root, 'tracked.ts'), join(input.copied, 'coverage/link'));
    const result = run(input, ['directory:coverage']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing symlink');
    expect(readFileSync(join(input.root, 'tracked.ts'), 'utf8')).toBe('preserved source\n');
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });

  it('exports partial evidence and removes the container on termination', () => {
    const input = fixture();
    const result = run(input, ['directory:coverage'], 0,
      { updateRatchet: false, sourceHistory: false, concurrentEdit: false, signal: true });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(143);
    expect(readFileSync(join(input.root, 'coverage/report.txt'), 'utf8')).toBe('coverage evidence\n');
    expect(existsSync(join(input.copied, 'removed'))).toBe(true);
  });

  it('copies source identity and refs for snapshots while excluding graph refs and host config', () => {
    const input = fixture();
    const head = git(input.root, 'rev-parse', 'HEAD');
    git(input.root, 'update-ref', 'refs/warp/private-data', head);
    git(input.root, 'update-ref', 'refs/remotes/origin/main', head);
    git(input.root, 'tag', 'fixture-base', head);
    git(input.root, 'config', 'core.hooksPath', 'caller-hooks');
    const result = run(input, ['directory:.ratchet'], 0,
      { updateRatchet: false, sourceHistory: true, concurrentEdit: false, signal: false });
    expect(result.status).toBe(0);
    expect(git(input.copied, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(input.copied, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git(input.copied, 'rev-parse', 'refs/remotes/origin/main')).toBe(head);
    expect(git(input.copied, 'rev-parse', 'refs/tags/fixture-base')).toBe(head);
    expect(git(input.copied, 'for-each-ref', 'refs/warp/')).toBe('');
    expect(git(input.copied, 'config', '--local', '--list')).not.toContain('caller-hooks');
    expect(git(input.copied, 'config', '--local', '--list')).not.toContain(input.directory);
    expect(readFileSync(join(input.root, '.ratchet/fixture/snapshot.json'), 'utf8'))
      .toBe('snapshot evidence\n');
    expect(git(input.root, 'for-each-ref', 'refs/warp/')).toContain('private-data');
  });
});
