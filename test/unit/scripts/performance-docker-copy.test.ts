import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve('.github/workflows/performance.yml'), 'utf8');
const fixtures: string[] = [];
const shell = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();

function comparisonStep(): string {
  const start = workflow.indexOf('      - name: Run copied performance comparison\n');
  const end = workflow.indexOf('      - name: Retain raw samples', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const source = workflow.slice(start, end);
  const run = source.indexOf('        run: |\n');
  expect(run).toBeGreaterThanOrEqual(0);
  return source.slice(run + '        run: |\n'.length).trimEnd().split('\n')
    .map((line) => line.slice(10)).join('\n');
}

function executable(path: string, source: string): void {
  writeFileSync(path, `#!${shell}\nset -euo pipefail\n${source}\n`);
  chmodSync(path, 0o755);
}

function runComparison(gateStatus: number, migratedStatus: number, exportStatus = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'warp copied performance '));
  fixtures.push(directory);
  const commands = join(directory, 'commands');
  const copied = join(directory, 'copied');
  mkdirSync(commands);
  mkdirSync(copied);
  executable(join(commands, 'docker'), `
    echo "$1" >> "$TRACE"
    case "$1" in
      build) ;;
      create)
        for arg in "$@"; do
          case "$arg" in --mount|--volume|-v) exit 91;; esac
        done
        echo fixture-container
        ;;
      start)
        status=0
        (cd "$COPIED"; bash -s) || status=$?
        echo "$status" > "$COPIED/exit-status"
        ;;
      inspect) cat "$COPIED/exit-status";;
      stop) ;;
      cp)
        if [[ "$EXPORT_STATUS" != 0 ]]; then exit "$EXPORT_STATUS"; fi
        cp -R "$COPIED/performance-results" "$3"
        ;;
      rm) touch "$COPIED/removed";;
      *) echo "Unexpected Docker operation: $*" >&2; exit 92;;
    esac`);
  executable(join(commands, 'npm'), `
    test "$1" = --prefix
    test "$3" = run
    test "$4" = build:maintainer
    echo "build-$2" >> "$TRACE"`);
  executable(join(commands, 'node'), `
    case "$1" in
      head/dist/scripts/performance/RunPerformanceComparison.js)
        mkdir -p performance-results
        echo comparison > performance-results/comparison.json
        echo measure >> "$TRACE"
        ;;
      head/dist/scripts/performance/GatePerformance.js)
        echo performance-summary > performance-results/summary.md
        echo gate >> "$TRACE"
        exit "$GATE_STATUS"
        ;;
      head/dist/scripts/v18-to-v19/performance/RunMigratedReadPerformance.js)
        mkdir -p performance-results/migrated-read
        echo migrated-summary > performance-results/migrated-read/summary.md
        echo migrated >> "$TRACE"
        exit "$MIGRATED_STATUS"
        ;;
      *) echo "Unexpected program: $*" >&2; exit 93;;
    esac`);
  const result = spawnSync(shell, ['-c', comparisonStep()], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: [commands, dirname(shell)].join(delimiter),
      TRACE: join(directory, 'trace'), COPIED: copied,
      GITHUB_RUN_ID: '17', GITHUB_RUN_ATTEMPT: '1', ORDER_SEED: '17',
      GITHUB_STEP_SUMMARY: join(directory, 'summary'),
      GATE_STATUS: String(gateStatus), MIGRATED_STATUS: String(migratedStatus),
      EXPORT_STATUS: String(exportStatus),
    },
  });
  return { directory, copied, result };
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('copied performance execution', () => {
  it('uses an image with both Git identities instead of a runner job container', () => {
    expect(workflow).not.toMatch(/^\s+container:/mu);
    const image = readFileSync('docker/Dockerfile.performance-comparison', 'utf8');
    expect(image).toContain('COPY base ./base');
    expect(image).toContain('COPY head ./head');
    expect(image).toMatch(/^FROM node:22-slim@sha256:[a-f0-9]{64}$/mu);
    const ignored = readFileSync('docker/Dockerfile.performance-comparison.dockerignore', 'utf8');
    expect(ignored).not.toMatch(/(?:^|\/)\.git(?:\n|$)/u);
  });

  it.each([[0, 0, 0], [7, 0, 7], [0, 9, 9], [7, 9, 7]])(
    'exports both summaries and preserves failure status (%i, %i)',
    (gate, migrated, expectedStatus) => {
      const { directory, copied, result } = runComparison(gate, migrated);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(expectedStatus);
      expect(readFileSync(join(directory, 'performance-results/comparison.json'), 'utf8'))
        .toBe('comparison\n');
      expect(readFileSync(join(directory, 'summary'), 'utf8'))
        .toBe('performance-summary\nmigrated-summary\n');
      expect(existsSync(join(copied, 'removed'))).toBe(true);
      expect(readFileSync(join(directory, 'trace'), 'utf8').trim().split('\n')).toEqual([
        'build', 'create', 'start', 'build-base', 'build-head', 'measure', 'gate',
        'migrated', 'inspect', 'stop', 'cp', 'rm',
      ]);
    },
  );

  it.each([[0, 1], [7, 7]])('fails closed on export failure while preserving prior failure (%i)',
    (gate, expectedStatus) => {
      const { copied, result } = runComparison(gate, 0, 19);
      expect(result.status).toBe(expectedStatus);
      expect(result.stderr).toContain('Failed to export performance evidence');
      expect(existsSync(join(copied, 'removed'))).toBe(true);
    });
});
