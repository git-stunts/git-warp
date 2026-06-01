import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openWarpWorldline } from '../../index.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import InMemoryGraphAdapter from '../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';

const NODE_ID = 'event:honesty';
const PROPERTY_KEY = 'status';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

class ForbiddenFullResidencyBlobReadError extends Error {
  constructor(oid: string) {
    super(`first-use Optics path attempted full-residency checkpoint state read: ${oid}`);
  }
}

class FirstUseOpticsTrapAdapter extends InMemoryGraphAdapter {
  private readonly _forbiddenStateBlobOids = new Set<string>();
  private readonly _forbiddenReads: string[] = [];

  async forbidCheckpointStateReads(
    checkpointSha: string,
    commitMessageCodec: CommitMessageCodecPort,
  ): Promise<void> {
    const checkpointMessage = commitMessageCodec.decodeCheckpoint(await this.showNode(checkpointSha));
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

  override async readBlob(oid: string): Promise<Uint8Array> {
    if (this._forbiddenStateBlobOids.has(oid)) {
      this._forbiddenReads.push(oid);
      throw new ForbiddenFullResidencyBlobReadError(oid);
    }
    return await super.readBlob(oid);
  }

  forbiddenReads(): readonly string[] {
    return this._forbiddenReads;
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
  it('verifies an existing checkpoint-tail basis without reading checkpoint state blobs', async () => {
    const persistence = new FirstUseOpticsTrapAdapter();
    const runtime = await openRuntimeHostProduct({
      persistence,
      graphName: 'v18-first-use-optics-honesty',
      writerId: 'app',
    });
    await runtime.patch((patch) => {
      patch.addNode(NODE_ID);
      patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
    });
    await runtime.materialize();
    const checkpointSha = await runtime.createCheckpoint();

    const events = await openWarpWorldline({
      persistence,
      worldlineName: 'v18-first-use-optics-honesty',
      writerId: 'app',
    });
    await persistence.forbidCheckpointStateReads(checkpointSha, runtime._commitMessageCodec);

    const basis = await events.prepareOpticBasis();
    const coordinate = await events.coordinate();
    const node = await coordinate.optic().node(NODE_ID).read();

    expect(basis.checkpointSha).toBe(checkpointSha);
    expect(coordinate.checkpointSha).toBe(checkpointSha);
    expect(node).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(persistence.forbiddenReads()).toEqual([]);
  });

  it('keeps prepareOpticBasis source off known full-residency helpers', () => {
    const implementation = prepareOpticBasisImplementation();

    expect(implementation).not.toMatch(/\bmaterialize\s*\(/u);
    expect(implementation).not.toContain('_materializeGraph');
    expect(implementation).not.toContain('_setMaterializedState');
    expect(implementation).not.toContain('createCheckpoint');
    expect(implementation).not.toContain('getStateSnapshot');
    expect(implementation).not.toContain('getNodes');
    expect(implementation).not.toContain('getEdges');
    expect(implementation).not.toContain('observer(');
    expect(implementation).not.toContain('cloneState');
  });
});
