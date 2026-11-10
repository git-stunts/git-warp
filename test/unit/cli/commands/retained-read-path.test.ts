import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { intent } from '../../../../advanced.ts';
import handleObserve from '../../../../bin/cli/commands/observe.ts';
import handleRepair from '../../../../bin/cli/commands/repair.ts';
import type { McpJsonValue } from '../../../../bin/cli/commands/mcp/McpJsonValue.ts';
import { closeCliStorages } from '../../../../bin/cli/shared.ts';
import type { CliOptions } from '../../../../bin/cli/types.ts';
import { writeThroughWarp } from '../../../helpers/WarpSeed.ts';

const READING_ARGS = ['--observer', 'role-reader', '--reading',
  '{"kind":"property.get","subject":"user:alice","key":"role"}'];

describe('retained CLI read path with real Git storage', () => {
  let repository: string;
  let options: CliOptions;

  beforeEach(async () => {
    repository = await mkdtemp(join(tmpdir(), 'warp-cli-retained-'));
    execFileSync('git', ['init', '-q', repository], { timeout: 10_000 });
    options = { repo: repository, lane: 'events', writer: 'cli-reader',
      writerExplicit: true, json: true, jsonl: false, help: false };
    await writeThroughWarp(repository, 'events', 'alice', [
      intent.node.add({ subject: 'user:alice' }),
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }),
    ]);
    await writeThroughWarp(repository, 'other', 'alice', [
      intent.node.add({ subject: 'user:alice' }),
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'guest' }),
    ]);
  });

  afterEach(async () => {
    await closeCliStorages();
    await rm(repository, { recursive: true, force: true });
  });

  it('observes the selected Lane through the retained Runtime read path', async () => {
    await handleRepair({ options, args: ['--action', 'materialization'] });
    await handleRepair({ options: { ...options, lane: 'other' }, args: ['--action', 'materialization'] });
    const result = await handleObserve({ options, args: READING_ARGS });

    expect(result.payload).toMatchObject({
      type: 'Observation', lane: 'events', observer: { id: 'role-reader' },
      readings: [{ type: 'Reading', value: 'admin' }],
      receipt: { type: 'Receipt', operation: 'observe', lane: 'events',
        writer: 'cli-reader', status: 'completed', observer: { id: 'role-reader' } },
    });
    expect(result.human).toContain('admin');
    const lines: McpJsonValue[] = [];
    for await (const line of result.lines) lines.push(line);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ type: 'Reading', value: 'admin' });
    expect(lines[1]).toMatchObject({ type: 'Receipt', status: 'completed', lane: 'events' });
  });

  it('streams the selected Lane followed by its observation receipt', async () => {
    await handleRepair({ options, args: ['--action', 'materialization'] });
    await handleRepair({ options: { ...options, lane: 'other' }, args: ['--action', 'materialization'] });
    const result = await handleObserve({ options: { ...options, jsonl: true }, args: READING_ARGS });
    expect(result.payload).toBeUndefined();
    expect(result.human).toBeUndefined();
    const lines: McpJsonValue[] = [];
    for await (const line of result.lines) lines.push(line);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ type: 'Reading', value: 'admin' });
    expect(lines[1]).toMatchObject({ type: 'Receipt', operation: 'observe', lane: 'events',
      writer: 'cli-reader', status: 'completed', observer: { id: 'role-reader' } });
  });

  it.each([null, ''])('rejects an absent Lane (%s) before observing', async (lane) => {
    for (const jsonl of [false, true]) {
      await expect(handleObserve({ options: { ...options, lane, jsonl }, args: READING_ARGS }))
        .rejects.toMatchObject({ message: '--lane <name> is required', code: 'E_USAGE', exitCode: 1 });
    }
  });

  it('repairs materialization and publishes a checkpoint for the selected Lane', async () => {
    const checkpoints = () => execFileSync('git', ['for-each-ref', '--format=%(refname)',
      'refs/warp/events/checkpoints'], { cwd: repository, encoding: 'utf8', timeout: 10_000 }).trim();
    expect(checkpoints()).toBe('');

    const result = await handleRepair({ options, args: ['--action', 'materialization'] });

    expect(result).toMatchObject({
      payload: { type: 'Repair', action: 'materialization', lane: 'events', status: 'completed' },
      exitCode: 0,
    });
    expect(result.human).toContain('"status": "completed"');
    expect(checkpoints()).toBe('refs/warp/events/checkpoints/head');
    const observed = await handleObserve({ options, args: READING_ARGS });
    expect(observed.payload).toMatchObject({ readings: [{ value: 'admin' }] });
  });

  it.each([null, ''])('rejects an absent Lane (%s) before repair', async (lane) => {
    await expect(handleRepair({ options: { ...options, lane }, args: ['--action', 'materialization'] }))
      .rejects.toMatchObject({ message: '--lane <name> is required', code: 'E_USAGE', exitCode: 1 });
  });
});
