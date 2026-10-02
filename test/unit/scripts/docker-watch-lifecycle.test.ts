import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const docker = join(directory, 'docker');
  writeFileSync(docker, `#!${shell}
set -euo pipefail
while [[ "$1" != up && "$1" != watch && "$1" != exec && "$1" != down ]]; do
  if [[ "$1" == --profile ]]; then shift 2; else shift; fi
done
echo "$1" >> "$TRACE"
case "$1" in
  up) ;;
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
      failed-watch) exec sleep 30;;
      signal) kill -TERM "$PPID"; exec sleep 30;;
      completed-after-watch-failure) sleep 0.15; exit 0;;
      *) exit "$EXIT_STATUS";;
    esac
    ;;
  down) ;;
  *) exit 91;;
esac
`);
  chmodSync(docker, 0o755);
  const result = spawnSync(shell, [resolve('scripts/RunDockerWatch.sh'), 'test path with spaces.test.ts'], {
    encoding: 'utf8', timeout: 10000,
    env: { PATH: [directory, dirname(shell)].join(delimiter), TRACE: join(directory, 'trace'),
      MODE: mode, EXIT_STATUS: String(exitStatus) },
  });
  return { result, trace: readFileSync(join(directory, 'trace'), 'utf8').trim().split('\n') };
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
});
