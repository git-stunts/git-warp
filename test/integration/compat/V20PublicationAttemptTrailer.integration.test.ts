/**
 * Compatibility witnesses (#1079) for the released v20.0.0 reader, installed from its
 * published tarball into `test/fixtures/v20-reader`.
 *
 * What users meet: v20 refuses a repository that v21 `Warp` wrote, on its substrate
 * marker (`E_SUBSTRATE_VERSION_UNSUPPORTED`), before it reads any patch, and it changes
 * no ref. A v20 clone therefore never reads an `eg-publication-attempt` trailer through
 * its runtime.
 *
 * What the trailer alone does: v20 writes a patch, then this checkout's own codec
 * re-encodes that commit's message with an `eg-publication-attempt` trailer in the
 * format `Warp` writes, keeping the tree and parent. v20 then decodes that message,
 * materializes and reads the lane, and extends the writer's chain on top of it. v20
 * reads a lane only after its own materialization repair, so the witness runs that
 * command, which reads every patch, before each read. This one characterizes shipped
 * v20 behaviour: it has no meaningful red, because v20 cannot change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { disposeWarpFixtures, open, repository as warpRepository, retained } from '../../helpers/WarpWriteFixture.ts';
import { intent } from '../../../advanced.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import EntropyObservationAttemptSource from '../../../src/infrastructure/adapters/EntropyObservationAttemptSource.ts';
import { TRAILER_KEYS, TrailerCommitMessageCodecAdapter } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

const FIXTURE = resolve(import.meta.dirname, '../../fixtures/v20-reader');
const READER = join(FIXTURE, 'V20Reader.mjs');
const LANE = 'todos';
const ATTEMPT = new EntropyObservationAttemptSource().next().value;
const directories: string[] = [];

function git(at: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], { cwd: at, encoding: 'utf8', ...(input === undefined ? {} : { input }) }).trim();
}

/** Runs one operation of the released v20 package in its own process. */
function v20(args: readonly string[]): string {
  return execFileSync(process.execPath, [READER, ...args], { cwd: FIXTURE, encoding: 'utf8' }).trim();
}

async function repository(): Promise<string> {
  const at = await mkdtemp(join(tmpdir(), 'warp-v20-trailer-'));
  directories.push(at);
  git(at, ['init', '--quiet']);
  git(at, ['config', 'user.name', 'v20 witness']);
  git(at, ['config', 'user.email', 'v20@example.invalid']);
  return at;
}

/** Replaces the writer's tip with the same patch, its message carrying the attempt trailer. */
function withPublicationAttempt(at: string, writer: string): { readonly message: string; readonly tree: string } {
  const ref = buildWriterRef(LANE, writer);
  const tip = git(at, ['rev-parse', ref]);
  const codec = new TrailerCommitMessageCodecAdapter();
  const message = codec.encodePatch({ ...codec.decodePatch(git(at, ['log', '-1', '--format=%B', tip])), publicationAttempt: ATTEMPT });
  const tree = git(at, ['rev-parse', `${tip}^{tree}`]);
  const parents = git(at, ['log', '-1', '--format=%P', tip]).split(' ').filter((parent) => parent.length > 0);
  const rewritten = git(at, ['commit-tree', tree, ...parents.flatMap((parent) => ['-p', parent]), '-F', '-'], message);
  git(at, ['update-ref', ref, rewritten, tip]);
  return { message, tree };
}

beforeAll(() => {
  expect(existsSync(join(FIXTURE, 'node_modules/@git-stunts/git-warp/package.json'))).toBe(true);
  expect(v20(['version'])).toBe('20.0.0');
});

afterEach(async () => {
  await disposeWarpFixtures();
  await Promise.all(directories.splice(0).map(async (at) => await rm(at, { recursive: true, force: true })));
});

describe('a released v20 reader meets a repository that v21 Warp wrote', () => {
  it('refuses to read, repair or write it on the substrate marker, and changes no ref', async () => {
    const at = await warpRepository();
    const warp = await open(at);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'todo' })));
    await warp.close();
    expect(git(at, ['log', '-1', '--format=%(trailers:key=eg-publication-attempt,valueonly)', buildWriterRef(LANE, 'alice')])).toMatch(/^[0-9a-f]{32}$/u);
    const refs = git(at, ['for-each-ref']);

    expect(JSON.parse(v20(['read', at, 'todo']))).toEqual({ error: 'E_SUBSTRATE_VERSION_UNSUPPORTED' });
    // v20's CLI reports a runtime refusal as E_INTERNAL, carrying the gate's message.
    const repair = JSON.parse(v20(['repair', at]));
    expect(repair.error).toBe('E_INTERNAL');
    expect(repair.message).toContain('Unsupported retained-substrate marker');
    expect(JSON.parse(v20(['write', at, 'alice', 'todo', 'from v20']))).toEqual({ error: 'E_SUBSTRATE_VERSION_UNSUPPORTED' });
    expect(git(at, ['for-each-ref'])).toBe(refs);
  });
});

describe("v20's decoder and patch reader ignore an eg-publication-attempt trailer", () => {
  it('decodes, reads, and extends the chain as if the trailer were absent', async () => {
    const at = await repository();
    expect(JSON.parse(v20(['write', at, 'alice', 'todo', 'first']))).toEqual({ outcome: 'derived' });
    const original = git(at, ['log', '-1', '--format=%B', buildWriterRef(LANE, 'alice')]);

    const { message, tree } = withPublicationAttempt(at, 'alice');

    const tip = buildWriterRef(LANE, 'alice');
    expect(git(at, ['log', '-1', '--format=%(trailers:key=eg-publication-attempt,valueonly)', tip])).toBe(ATTEMPT);
    expect(git(at, ['rev-parse', `${tip}^{tree}`])).toBe(tree);
    expect(message).toContain(`${TRAILER_KEYS.publicationAttempt}: ${ATTEMPT}`);
    const messages = await mkdtemp(join(tmpdir(), 'warp-v20-messages-'));
    directories.push(messages);
    const path = join(messages, 'with-attempt.txt');
    const originalPath = join(messages, 'original.txt');
    await writeFile(path, message);
    await writeFile(originalPath, original);
    expect(JSON.parse(v20(['decode', path]))).toEqual(JSON.parse(v20(['decode', originalPath])));

    expect(JSON.parse(v20(['repair', at]))).toEqual({ repaired: true });
    expect(JSON.parse(v20(['read', at, 'todo']))).toEqual({ status: 'completed', reason: null, values: ['first'] });
    expect(JSON.parse(v20(['write', at, 'alice', 'todo', 'second']))).toEqual({ outcome: 'derived' });
    expect(git(at, ['log', '-1', '--format=%P', tip])).toBe(git(at, ['rev-parse', `${tip}~1`]));
    expect(git(at, ['log', '-1', '--format=%(trailers:key=eg-publication-attempt,valueonly)', `${tip}~1`])).toBe(ATTEMPT);
    expect(JSON.parse(v20(['repair', at]))).toEqual({ repaired: true });
    expect(JSON.parse(v20(['read', at, 'todo']))).toEqual({ status: 'completed', reason: null, values: ['second'] });
  });
});
