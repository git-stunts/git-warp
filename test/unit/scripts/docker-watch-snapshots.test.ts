import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];
const snapshot = '__snapshots__/test with spaces.test.ts.snap';
const inline = 'inline.test.ts';
const script = resolve('scripts/ExportDockerWatchSnapshots.sh');
const project = 'git-warp-watch-123';

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'warp watch snapshots '));
  fixtures.push(directory);
  const root = join(directory, 'repository');
  const scratch = join(directory, 'scratch');
  for (const path of [join(root, 'test/__snapshots__'), join(scratch, 'candidate/__snapshots__')])
    mkdirSync(path, { recursive: true });
  for (const path of [snapshot, inline, 'fixture-data.txt']) {
    writeFileSync(join(root, 'test', path), 'baseline\n');
    copyFileSync(join(root, 'test', path), join(scratch, 'candidate', path));
  }
  const capture = spawnSync('bash', [script, 'capture', root, scratch, project], { encoding: 'utf8' });
  expect(capture.status).toBe(0);
  return { root, scratch };
}

function apply(input: ReturnType<typeof fixture>) {
  return spawnSync('bash', [script, 'apply', input.root, input.scratch, project], { encoding: 'utf8' });
}

describe('Docker watch snapshot export', () => {
  it.each([snapshot, inline])('applies updated %s when the host matches the baseline', (path) => {
    const input = fixture();
    writeFileSync(join(input.scratch, 'candidate', path), 'updated\n');
    expect(apply(input).status).toBe(0);
    expect(readFileSync(join(input.root, 'test', path), 'utf8')).toBe('updated\n');
  });

  it('exports a new external snapshot', () => {
    const input = fixture();
    writeFileSync(join(input.scratch, 'candidate/__snapshots__/new.test.ts.snap'), 'new\n');
    expect(apply(input).status).toBe(0);
    expect(readFileSync(join(input.root, 'test/__snapshots__/new.test.ts.snap'), 'utf8')).toBe('new\n');
  });

  it('removes a deleted external snapshot without treating its duplicate inventory entry as a conflict', () => {
    const input = fixture();
    rmSync(join(input.scratch, 'candidate', snapshot));
    expect(apply(input).status).toBe(0);
    expect(existsSync(join(input.root, 'test', snapshot))).toBe(false);
  });

  it.each([snapshot, inline])('retains conflicting %s without overwriting host edits', (path) => {
    const input = fixture();
    writeFileSync(join(input.root, 'test', path), 'host edit\n');
    writeFileSync(join(input.scratch, 'candidate', path), 'updated\n');
    const result = apply(input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Watch snapshot conflict:');
    expect(readFileSync(join(input.root, 'test', path), 'utf8')).toBe('host edit\n');
    expect(readFileSync(join(input.root, '.ratchet/docker-results', project, 'watch-snapshots', path), 'utf8'))
      .toBe('updated\n');
  });

  it('retains a deletion conflict as evidence', () => {
    const input = fixture();
    writeFileSync(join(input.root, 'test', snapshot), 'host edit\n');
    rmSync(join(input.scratch, 'candidate', snapshot));
    expect(apply(input).status).toBe(1);
    expect(readFileSync(join(input.root, 'test', snapshot), 'utf8')).toBe('host edit\n');
    expect(existsSync(join(input.root, '.ratchet/docker-results', project, 'watch-snapshots', `${snapshot}.deleted`)))
      .toBe(true);
  });

  it('leaves unchanged container files alone when the host changes', () => {
    const input = fixture();
    writeFileSync(join(input.root, 'test', inline), 'host edit\n');
    expect(apply(input).status).toBe(0);
    expect(readFileSync(join(input.root, 'test', inline), 'utf8')).toBe('host edit\n');
  });

  it('does not export synchronized host edits twice', () => {
    const input = fixture();
    for (const path of [join(input.root, 'test', inline), join(input.scratch, 'candidate', inline)])
      writeFileSync(path, 'host edit\n');
    expect(apply(input).status).toBe(0);
    expect(existsSync(join(input.root, '.ratchet'))).toBe(false);
  });

  it('does not export fixture data, newly created test modules, or deleted inline test modules', () => {
    const input = fixture();
    writeFileSync(join(input.scratch, 'candidate/fixture-data.txt'), 'mutated fixture\n');
    writeFileSync(join(input.scratch, 'candidate/new.test.ts'), 'new source\n');
    rmSync(join(input.scratch, 'candidate', inline));
    expect(apply(input).status).toBe(0);
    expect(readFileSync(join(input.root, 'test/fixture-data.txt'), 'utf8')).toBe('baseline\n');
    expect(existsSync(join(input.root, 'test/new.test.ts'))).toBe(false);
    expect(readFileSync(join(input.root, 'test', inline), 'utf8')).toBe('baseline\n');
  });

  it.each(['candidate', 'host', 'evidence'])('refuses a symlink in the %s tree', (location) => {
    const input = fixture();
    const outside = join(input.scratch, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'marker'), 'protected\n');
    writeFileSync(join(input.scratch, 'candidate', inline), 'updated\n');
    writeFileSync(join(input.root, 'test', inline), 'host edit\n');
    const target = location === 'candidate' ? join(input.scratch, 'candidate/link')
      : location === 'host' ? join(input.root, 'test/link') : join(input.root, '.ratchet');
    symlinkSync(outside, target);
    expect(apply(input).status).toBe(1);
    expect(readFileSync(join(outside, 'marker'), 'utf8')).toBe('protected\n');
    expect(readFileSync(join(input.root, 'test', inline), 'utf8')).toBe('host edit\n');
  });
});
