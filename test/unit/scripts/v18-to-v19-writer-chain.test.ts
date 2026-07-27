import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import ContentAddressableStore, {
  AssetHandle as GitCasAssetHandle,
  CborCodec as GitCasCborCodec,
} from '@git-stunts/git-cas';
import { afterEach, describe, expect, it } from 'vitest';

import warpCborCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import { V18MigrationGitObjectReader } from '../../../scripts/v18-to-v19/V18MigrationGitObjectReader.ts';
import { readV18PatchCommit } from '../../../scripts/v18-to-v19/V18PatchCommit.ts';
import V18PatchTranslator from '../../../scripts/v18-to-v19/V18PatchTranslator.ts';
import {
  rewriteV18WriterChain,
  type V18WriterChainRewrite,
} from '../../../scripts/v18-to-v19/V18WriterChainRewriter.ts';
import { v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { collectAsyncBytes } from '../../helpers/collectAsyncBytes.ts';

const MANIFEST_PATH = resolve(
  'fixtures/v18/retained-substrate-golden/manifest.json',
);

describe('v18-to-v19 writer chain migration', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it('rewrites patch and content references into current explicit handles', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-chain-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const objectReader = new V18MigrationGitObjectReader(restored.repositoryPath);
    const translator = await V18PatchTranslator.open({
      objectReader,
      repositoryPath: restored.repositoryPath,
    });
    const rewrites: V18WriterChainRewrite[] = [];
    const commitMap = new Map<string, string>();
    try {
      for (const ref of restored.manifest.refs) {
        if (ref.kind === 'writer') {
          rewrites.push(await rewriteV18WriterChain({
            commitMap,
            graph: restored.manifest.graphId,
            refName: ref.refName,
            repositoryPath: restored.repositoryPath,
            translator,
            writer: ref.writerId,
          }));
        }
      }
    } finally {
      await Promise.all([objectReader.close(), translator.close()]);
    }

    expect(rewrites.map((rewrite) => rewrite.translatedCount)).toEqual([2, 1]);
    for (const rewrite of rewrites) {
      expect(commitMap.get(rewrite.oldHead)).toBe(rewrite.newHead);
    }
    const aliceHead = rewrites.find((rewrite) => rewrite.writer === 'alice')?.newHead;
    expect(aliceHead).toBeDefined();
    if (aliceHead === undefined) {
      throw new Error('missing rewritten alice head');
    }
    const firstSha = (
      await v18MigrationGitText(restored.repositoryPath, [
        'rev-list',
        '--reverse',
        aliceHead,
      ])
    ).split('\n')[0];
    expect(firstSha).toBeDefined();
    if (firstSha === undefined) {
      throw new Error('missing rewritten first commit');
    }
    const first = await readV18PatchCommit(restored.repositoryPath, firstSha);
    expect(first.storage.kind).toBe('current');
    if (first.storage.kind !== 'current') {
      throw new Error('rewritten patch did not use current storage');
    }
    const cas = await ContentAddressableStore.open({
      cwd: restored.repositoryPath,
      codec: new GitCasCborCodec(),
    });
    try {
      const patchBytes = await collectAsyncBytes(cas.assets.open({ handle: first.storage.handle }));
      const decoded = warpCborCodec.decode(patchBytes);
      const contentHandle = findContentHandle(decoded);
      const parsed = GitCasAssetHandle.parse(contentHandle);
      const content = await collectAsyncBytes(cas.assets.open({ handle: parsed }));
      expect(Buffer.from(content).toString('utf8')).toBe(
        'v18 blob-backed content retained for v19 migration proof\n',
      );
    } finally {
      await cas.close();
    }
  });
});

function findContentHandle(decoded: unknown): string {
  if (decoded === null || typeof decoded !== 'object' || !('ops' in decoded)) {
    throw new Error('decoded patch has no ops');
  }
  const ops = decoded.ops;
  if (!Array.isArray(ops)) {
    throw new Error('decoded patch ops are not an array');
  }
  for (const op of ops) {
    if (
      op !== null
      && typeof op === 'object'
      && 'key' in op
      && op.key === '_content'
      && 'value' in op
      && typeof op.value === 'string'
    ) {
      return op.value;
    }
  }
  throw new Error('rewritten patch has no content handle');
}
