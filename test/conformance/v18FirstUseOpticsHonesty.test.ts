import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspectReceipt } from '../../diagnostics.ts';
import { openWarp, reading } from '../../index.ts';
import WarpStorage from '../../src/application/WarpStorage.ts';
import { bindWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { openWarpWorldline } from '../../src/domain/WarpWorldline.ts';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../test/helpers/MemoryRuntimeStorageAdapter.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';
import type { CommitNodeOptions, CommitNodeWithTreeOptions } from '../../src/ports/CommitPort.ts';

const NODE_ID = 'event:honesty';
const PROPERTY_KEY = 'status';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

class ForbiddenFirstUseOpticsOperationError extends Error {
  constructor(operation: string) {
    super(`first-use Optics path attempted forbidden full-residency operation: ${operation}`);
  }
}

class FirstUseOpticsTrapAdapter extends InMemoryGraphAdapter {
  private readonly _forbiddenPatchBlobOids = new Set<string>();
  private readonly _forbiddenStateBlobOids = new Set<string>();
  private readonly _forbiddenOperations: string[] = [];
  private _forbidWrites = false;
  private _forbidTreeOidMapReads = false;

  async forbidFullResidencyOperations(options: {
    readonly checkpointSha: string;
    readonly patchSha: string;
    readonly commitMessageCodec: CommitMessageCodecPort;
  }): Promise<void> {
    const patchMessage = options.commitMessageCodec.decodePatch(
      await this.showNode(options.patchSha)
    );
    this._forbiddenPatchBlobOids.add(patchMessage.patchOid);
    await this._forbidCheckpointStateBlobReads(options);
    this._forbidWrites = true;
  }

  forbidTreeOidMapReads(): void {
    this._forbidTreeOidMapReads = true;
  }

  allowTreeOidMapReads(): void {
    this._forbidTreeOidMapReads = false;
  }

  override async readBlob(oid: string): Promise<Uint8Array> {
    if (this._forbiddenStateBlobOids.has(oid)) {
      this._recordForbiddenOperation(`checkpoint-state-blob-read:${oid}`);
    }
    if (this._forbiddenPatchBlobOids.has(oid)) {
      this._recordForbiddenOperation(`patch-blob-read:${oid}`);
    }
    return await super.readBlob(oid);
  }

  override async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    if (this._forbidTreeOidMapReads) {
      this._recordForbiddenOperation(`readTreeOids:${treeOid}`);
    }
    return await super.readTreeOids(treeOid);
  }

  override async writeBlob(content: Uint8Array | string): Promise<string> {
    this._forbidWriteOperation('writeBlob');
    return await super.writeBlob(content);
  }

  override async writeTree(entries: string[]): Promise<string> {
    this._forbidWriteOperation('writeTree');
    return await super.writeTree(entries);
  }

  override async commitNode(options: CommitNodeOptions): Promise<string> {
    this._forbidWriteOperation('commitNode');
    return await super.commitNode(options);
  }

  override async commitNodeWithTree(options: CommitNodeWithTreeOptions): Promise<string> {
    this._forbidWriteOperation('commitNodeWithTree');
    return await super.commitNodeWithTree(options);
  }

  override async updateRef(ref: string, oid: string): Promise<void> {
    this._forbidWriteOperation(`updateRef:${ref}`);
    await super.updateRef(ref, oid);
  }

  forbiddenOperations(): readonly string[] {
    return this._forbiddenOperations;
  }

  private async _forbidCheckpointStateBlobReads(options: {
    readonly checkpointSha: string;
    readonly commitMessageCodec: CommitMessageCodecPort;
  }): Promise<void> {
    const checkpointMessage = options.commitMessageCodec.decodeCheckpoint(
      await this.showNode(options.checkpointSha)
    );
    const rootTreeOids = await this.readTreeOids(checkpointMessage.indexOid);
    const stateTreeOid = rootTreeOids['state'];
    if (stateTreeOid === undefined) {
      throw new Error('checkpoint fixture must include a state subtree');
    }
    const stateTreeOids = await this.readTreeOids(stateTreeOid);
    for (const oid of Object.values(stateTreeOids)) {
      this._forbiddenStateBlobOids.add(oid);
    }
  }

  private _forbidWriteOperation(operation: string): void {
    if (this._forbidWrites) {
      this._recordForbiddenOperation(operation);
    }
  }

  private _recordForbiddenOperation(operation: string): never {
    this._forbiddenOperations.push(operation);
    throw new ForbiddenFirstUseOpticsOperationError(operation);
  }
}

class FirstUseOpticsStorage extends WarpStorage {
  constructor(history: FirstUseOpticsTrapAdapter, runtimeStorage: MemoryRuntimeStorageAdapter) {
    super();
    bindWarpStorage(this, { history, runtimeStorage });
  }
}

function readRepoFile(path: string): string {
  return readFileSync(`${REPO_ROOT}${path}`, 'utf8');
}

function prepareOpticBasisImplementation(): string {
  const source = readRepoFile('src/domain/WarpWorldline.ts');
  const start = source.indexOf('prepareOpticBasis: async () => {');
  const end = source.indexOf('    getFrontier:', start);
  if (start < 0 || end < 0) {
    throw new Error('WarpWorldline prepareOpticBasis implementation not found');
  }
  return source.slice(start, end);
}

describe('v18 first-use Optics honesty gate', () => {
  it('verifies an existing checkpoint-tail basis without full-residency operations', async () => {
    const persistence = new FirstUseOpticsTrapAdapter();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history: persistence });
    const runtime = await openRuntimeHostProduct({
      persistence,
      runtimeStorage,
      graphName: 'v18-first-use-optics-honesty',
      writerId: 'app',
    });
    const patchSha = await runtime.patch((patch) => {
      patch.addNode(NODE_ID);
      patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
    });
    await runtime.materialize();
    const checkpointSha = await runtime.createCheckpoint();

    const events = await openWarpWorldline({
      persistence,
      runtimeStorage,
      worldlineName: 'v18-first-use-optics-honesty',
      writerId: 'app',
    });
    await persistence.forbidFullResidencyOperations({
      checkpointSha,
      patchSha,
      commitMessageCodec: runtime._commitMessageCodec,
    });

    const storage = new FirstUseOpticsStorage(persistence, runtimeStorage);
    const warp = await openWarp({ storage, writer: 'app' });
    const timeline = await warp.timeline('v18-first-use-optics-honesty');
    const property = await timeline.read(
      reading.property({
        subject: NODE_ID,
        key: PROPERTY_KEY,
      })
    );
    const inspection = inspectReceipt(property.receipt, { storage });

    persistence.forbidTreeOidMapReads();
    const basis = await events.prepareOpticBasis();
    persistence.allowTreeOidMapReads();
    const coordinate = await events.coordinate();
    const node = await coordinate.optic().node(NODE_ID).read();

    expect(basis.checkpointSha).toBe(checkpointSha);
    expect(coordinate.checkpointSha).toBe(checkpointSha);
    expect(node).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(property.value).toBe('open');
    expect(property.receipt).toMatchObject({
      outcome: 'accepted',
      evidence: {
        basis: { id: expect.any(String) },
        support: expect.any(Array),
      },
    });
    expect(property.receipt.evidence).not.toHaveProperty('checkpointSha');
    expect(inspection.substrate).toMatchObject({
      operation: 'read',
      identity: { checkpointSha },
    });
    expect(persistence.forbiddenOperations()).toEqual([]);
  });

  it('keeps prepareOpticBasis source off known full-residency helpers', () => {
    const implementation = prepareOpticBasisImplementation();
    const verifier = readRepoFile('src/domain/services/optic/CheckpointTailBasisVerifier.ts');
    const checkedSources = `${implementation}\n${verifier}`;

    expect(checkedSources).not.toMatch(/\bmaterialize\s*\(/u);
    expect(checkedSources).not.toContain('_materializeGraph');
    expect(checkedSources).not.toContain('_setMaterializedState');
    expect(checkedSources).not.toContain('createCheckpoint');
    expect(checkedSources).not.toContain('getStateSnapshot');
    expect(checkedSources).not.toContain('getNodes');
    expect(checkedSources).not.toContain('getEdges');
    expect(checkedSources).not.toContain('observer(');
    expect(checkedSources).not.toContain('cloneState');
    expect(checkedSources).not.toContain('readTreeOids');
  });
});
