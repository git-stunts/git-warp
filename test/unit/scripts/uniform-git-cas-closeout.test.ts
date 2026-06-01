import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('uniform git-cas closeout', () => {
  it('removes the stale live v17 card', () => {
    expect(existsSync(join(
      repoRoot,
      'docs/method/graveyard/v17.0.0-residual-backlog/INFRA_uniform-git-cas.md',
    ))).toBe(false);
  });

  it('ratchets GitGraphAdapter as the Git-backed runtime CAS provider', () => {
    const adapter = readRepoFile('src/infrastructure/adapters/GitGraphAdapter.ts');

    expect(adapter).toContain('new CasBlobAdapter({');
    expect(adapter).toContain('persistence: this');
    expect(adapter).toContain('return createGitCasPatchStorage(false)');
    expect(adapter).toContain('new GitTrieStoreAdapter({');
  });

  it('ratchets runtime boot to inject one blob-storage surface into payload adapters', () => {
    const runtimeBoot = readRepoFile('src/domain/warp/RuntimeHostBoot.ts');
    const runtimeHelpers = readRepoFile('src/domain/runtimeHelpers.ts');

    expect(runtimeHelpers).toContain('return await persistence.createRuntimeBlobStorage()');
    expect(runtimeBoot).toContain('const resolvedBlobStorage = await resolveBlobStorage(blobStorage, persistence)');
    expect(runtimeBoot).toContain('...(patchWriteStorage.strategy === \'git-cas\' ? { blobStorage: resolvedBlobStorage } : {})');
    expect(runtimeBoot).toContain('blobStorage: resolvedBlobStorage');
    expect(runtimeBoot).toContain('const resolvedIndexStore = await resolveIndexStore(indexStore, {');
  });

  it('ratchets checkpoint and index payloads through CAS payload pointers', () => {
    const checkpointStore = readRepoFile('src/infrastructure/adapters/CborCheckpointStoreAdapter.ts');
    const indexStore = readRepoFile('src/infrastructure/adapters/CborIndexStoreAdapter.ts');
    const pointer = readRepoFile('src/infrastructure/adapters/CasPayloadPointer.ts');

    expect(checkpointStore).toContain('writePayloadBlob({');
    expect(checkpointStore).toContain('readPayloadBlob(this._blobPort, this._blobStorage');
    expect(indexStore).toContain('writePayloadBlob({');
    expect(indexStore).toContain('readPayloadBlob(adapter._blobPort, adapter._blobStorage, blobOid)');
    expect(pointer).toContain('const storageOid = await blobStorage.store(bytes, options)');
    expect(pointer).toContain('return await blobPort.writeBlob(encodeCasPayloadPointer(storageOid))');
    expect(pointer).toContain('return await blobStorage.retrieve(storageOid)');
  });

  it('ratchets trust records onto git-cas and preserves the trie carve-out', () => {
    const trust = readRepoFile('src/infrastructure/adapters/GitTrustChainAdapter.ts');
    const trie = readRepoFile('src/infrastructure/adapters/GitTrieStoreAdapter.ts');
    const releaseLedger = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(trust).toContain('Uses git-cas for CBOR blob storage');
    expect(trust).toContain('const manifest = await cas.store({');
    expect(trust).toContain('const treeOid = await cas.createTree({ manifest })');
    expect(trie).toContain('per design 0018 git-cas carve-out');
    expect(releaseLedger).toContain('[x] INFRA_uniform-git-cas');
    expect(releaseLedger).toContain('cycle 0092 retired stale live card');
    expect(releaseLedger).toContain('Core trie publication uses native Git objects');
  });

  it('keeps raw-substrate compatibility behind the upgrade command, not mainline policy', () => {
    const packageJson = readRepoFile('package.json');
    const design = readRepoFile('docs/design/0092-close-uniform-git-cas.md');
    const releaseLedger = readRepoFile('docs/releases/v17.0.0/README.md');
    const upgradeTool = readRepoFile('docs/method/graveyard/v17.0.0-residual-backlog/INFRA_substrate-upgrade-tool.md');
    const upgradeEntrypoint = readRepoFile('scripts/upgrade-v16-to-v17.ts');
    const migrationHelper = readRepoFile('scripts/migrations/v17.0.0/migrate.ts');

    expect(packageJson).toContain('"upgrade": "npm run build --silent && node dist/scripts/upgrade-v16-to-v17.js"');
    expect(packageJson).toContain('"dist"');
    expect(design).not.toContain('legacy raw blobs may still be read');
    expect(releaseLedger).not.toContain('legacy raw reads');
    expect(releaseLedger).toContain('Old raw\n                                      substrate readers belong to `npm run\n                                      upgrade`');
    expect(upgradeTool).toContain('The package-level command is:');
    expect(upgradeTool).toContain('npm run upgrade -- --graph <name>');
    expect(upgradeTool).toContain('Mainline cleanup requirement');
    expect(upgradeEntrypoint).toContain('Top-level v16 -> v17 graph substrate upgrade utility');
    expect(upgradeEntrypoint).toContain('upgradeCheckpointSchema');
    expect(migrationHelper).toContain('not in shipped runtime code under src/');
  });

  it('tracks broader adapter parity as a split successor', () => {
    const workloads = readRepoFile('docs/method/backlog/WORKLOADS.md');
    const archivedWorkloads = readRepoFile(
      'docs/method/graveyard/backlog-workloads-v17-era.md',
    );
    const releaseLedger = readRepoFile('docs/releases/v17.0.0/README.md');
    const successor = readRepoFile('docs/method/graveyard/v17.0.0-residual-backlog/INFRA_git-cas-adapter-parity.md');

    expect(workloads).not.toContain('INFRA_uniform-git-cas');
    expect(workloads).not.toContain('INFRA_unify-persistence-on-git-cas');
    expect(workloads).not.toContain('INFRA_git-cas-adapter-parity');
    expect(archivedWorkloads).toContain('INFRA_git-cas-adapter-parity');
    expect(releaseLedger).toContain('INFRA_unify-persistence-on-git-cas');
    expect(releaseLedger).toContain('[x] INFRA_git-cas-adapter-parity');
    expect(successor).toContain('GitPersistenceAdapter.readBlobStream()');
    expect(successor).toContain('GitRecursiveTreeOidReaderAdapter');
    expect(successor).toContain('one recursive `git ls-tree -rz` call');
    expect(successor).toContain('compare-and-swap ref updates');
  });
});
