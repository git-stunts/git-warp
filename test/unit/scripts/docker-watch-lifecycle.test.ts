import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const fixtures: string[] = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runWatch(mode: string, exitStatus: number) {
  const directory = mkdtempSync(join(tmpdir(), 'warp Docker watch '));
  fixtures.push(directory);
  const root = join(directory, 'source');
  const copied = join(directory, 'copied');
  for (const path of [join(root, 'scripts'), join(root, 'test/__snapshots__'),
    join(copied, 'test/__snapshots__')]) mkdirSync(path, { recursive: true });
  copyFileSync(resolve('scripts/RunDockerWatch.sh'), join(root, 'scripts/RunDockerWatch.sh'));
  if (existsSync('scripts/ExportDockerWatchSnapshots.sh'))
    copyFileSync(resolve('scripts/ExportDockerWatchSnapshots.sh'), join(root, 'scripts/ExportDockerWatchSnapshots.sh'));
  for (const path of [root, copied]) writeFileSync(join(path, 'test/__snapshots__/fixture.test.ts.snap'), 'baseline\n');
  const docker = join(directory, 'docker');
  writeFileSync(docker, `#!${shell}
set -euo pipefail
if [[ "$1" == cp ]]; then
  echo cp >> "$TRACE"
  cp -R "$COPIED/test" "$3"
  exit
fi
while [[ "$1" != up && "$1" != watch && "$1" != exec && "$1" != down && "$1" != ps && "$1" != stop ]]; do
  if [[ "$1" == --profile ]]; then shift 2; else shift; fi
done
echo "$1" >> "$TRACE"
case "$1" in
  up) ;;
  ps) echo fixture-watch;;
  stop)
    if [[ -f "$TRACE.client" ]]; then kill "$(cat "$TRACE.client")" 2>/dev/null || true; fi
    ;;
  watch)
    touch "$TRACE.ready"
    if [[ "$MODE" == failed-watch ]]; then exit 8; fi
    if [[ "$MODE" == completed-after-watch-failure ]]; then sleep 0.05; exit 8; fi
    exec sleep 30
    ;;
  exec)
    while [[ ! -f "$TRACE.ready" ]]; do sleep 0.01; done
    test "$2" = --no-TTY
    test "$3" = test-watch
    test "$4" = bash
    test "$5" = scripts/run-in-docker.sh
    test "$6" = vitest
    test "$7" = watch
    test "$8" = 'test path with spaces.test.ts'
    case "$MODE" in
      snapshot-update) echo updated > "$COPIED/test/__snapshots__/fixture.test.ts.snap"; exit "$EXIT_STATUS";;
      failed-watch) exec sleep 30;;
      signal) echo "$$" > "$TRACE.client"; kill -TERM "$PPID"; exec sleep 30;;
      completed-after-watch-failure) sleep 0.15; exit 0;;
      *) exit "$EXIT_STATUS";;
    esac
    ;;
  down) ;;
  *) exit 91;;
esac
`);
  chmodSync(docker, 0o755);
  const result = spawnSync(shell, [join(root, 'scripts/RunDockerWatch.sh'), 'test path with spaces.test.ts'], {
    encoding: 'utf8', timeout: 10000,
    env: { PATH: [directory, dirname(shell)].join(delimiter), TRACE: join(directory, 'trace'),
      MODE: mode, EXIT_STATUS: String(exitStatus), COPIED: copied },
  });
  return { result, root, trace: readFileSync(join(directory, 'trace'), 'utf8').trim().split('\n') };
}

describe('Docker watch lifecycle', () => {
  it.each([0, 7])('preserves test completion status %i and removes its watch project', (status) => {
    const { result, trace } = runWatch('normal', status);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(status);
    expect(trace[0]).toBe('up');
    expect(trace).toContain('watch');
    expect(trace).toContain('exec');
    expect(trace.at(-1)).toBe('down');
  });

  it('terminates the test client if source synchronization stops', () => {
    const { result, trace } = runWatch('failed-watch', 0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Docker source synchronization stopped');
    expect(trace.at(-1)).toBe('down');
  });

  it('cleans up the watch project on termination', () => {
    const { result, trace } = runWatch('signal', 0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(143);
    expect(trace.at(-1)).toBe('down');
  });

  it('fails closed when synchronization and tests finish before the monitor polls', () => {
    const { result, trace } = runWatch('completed-after-watch-failure', 0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Docker source synchronization stopped');
    expect(trace.at(-1)).toBe('down');
  });

  it('exports updated snapshots before removing the copied watch service', () => {
    const { result, root, trace } = runWatch('snapshot-update', 0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, 'test/__snapshots__/fixture.test.ts.snap'), 'utf8')).toBe('updated\n');
    expect(trace.indexOf('cp')).toBeLessThan(trace.indexOf('down'));
  });
});
