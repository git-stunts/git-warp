import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import {
  CBOR_TAG_CONTENT_REFUSED_REASON,
  CBOR_TAG_REFUSED_REASON,
} from '../../../../src/infrastructure/adapters/BoundedCborValidation.ts';

type FixtureManifest = Readonly<{ bundlePath: string; bundleSha256: string }>;
type CorpusCensus = { decoded: number; withBytes: number; tagRefusals: string[] };

const CORPORA = [
  ['v19 pre-worldline', resolve('fixtures/v19/pre-worldline'), { holdsBytes: true }],
  ['v20 late-writes', resolve('fixtures/v20/late-writes'), { holdsBytes: false }],
] as const;
const TAG_REASONS = new Set([CBOR_TAG_REFUSED_REASON, CBOR_TAG_CONTENT_REFUSED_REASON]);
const restored: string[] = [];

function git(cwd: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

async function restoreCorpus(directory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as FixtureManifest;
  const bundle = join(directory, manifest.bundlePath);
  expect(createHash('sha256').update(await readFile(bundle)).digest('hex')).toBe(manifest.bundleSha256);
  const repository = await mkdtemp(join(tmpdir(), 'git-warp-cbor-corpus-'));
  restored.push(repository);
  git(repository, ['init', '-q', '--initial-branch=fixture']);
  git(repository, ['fetch', '-q', bundle, '+refs/*:refs/*']);
  return repository;
}

function blobIds(repository: string): string[] {
  return git(repository, ['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)'])
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([, type]) => type === 'blob')
    .map(([oid]) => oid ?? '');
}

function containsBytes(value: unknown): boolean {
  if (value instanceof Uint8Array) { return true; }
  if (value === null || typeof value !== 'object') { return false; }
  return Object.values(value).some(containsBytes);
}

function censusBlob(census: CorpusCensus, oid: string, bytes: Uint8Array): void {
  try {
    const value = defaultCodec.decode(bytes);
    census.decoded += 1;
    if (containsBytes(value)) { census.withBytes += 1; }
  } catch (error) {
    if (!(error instanceof MessageCodecError)) { throw error; }
    const reason = error.context['reason'];
    if (typeof reason === 'string' && TAG_REASONS.has(reason)) { census.tagRefusals.push(oid); }
  }
}

describe('CborCodec over the released fixture corpora', () => {
  afterAll(async () => {
    for (const repository of restored) { await rm(repository, { recursive: true, force: true }); }
  });

  it.each(CORPORA)('decodes every %s blob without a tag refusal', async (_name, directory, { holdsBytes }) => {
    const repository = await restoreCorpus(directory);
    const census: CorpusCensus = { decoded: 0, withBytes: 0, tagRefusals: [] };

    for (const oid of blobIds(repository)) {
      censusBlob(census, oid, new Uint8Array(git(repository, ['cat-file', 'blob', oid])));
    }

    expect(census.tagRefusals).toEqual([]);
    expect(census.decoded).toBeGreaterThan(0);
    expect(census.withBytes > 0).toBe(holdsBytes);
  });
});
