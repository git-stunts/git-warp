import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { inspectReceipt } from '../../diagnostics.ts';
import { openWarp } from '../../src/application/openWarp.ts';
import { reading } from '../../src/domain/api/ReadingBuilders.ts';
import WarpStorage from '../../src/application/WarpStorage.ts';
import { bindWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { openWarpWorldline } from '../../src/domain/WarpWorldline.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../src/ports/RuntimeStorageProviderPort.ts';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../test/helpers/MemoryRuntimeStorageAdapter.ts';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../helpers/MemoryRuntimeHost.ts';

const NODE_ID = 'event:honesty';
const PROPERTY_KEY = 'status';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

class ForbiddenFirstUseOpticsOperationError extends Error {
  constructor(operation: string) {
    super(`first-use optics path attempted forbidden operation: ${operation}`);
  }
}

class FirstUseOpticsTrapStorage implements RuntimeStorageProviderPort {
  readonly #base: RuntimeStorageProviderPort;
  readonly #forbiddenOperations: string[] = [];
  #forbidFullResidency = false;

  constructor(base: RuntimeStorageProviderPort) {
    this.#base = base;
  }

  forbidFullResidencyOperations(): void {
    this.#forbidFullResidency = true;
  }

  forbiddenOperations(): readonly string[] {
    return Object.freeze([...this.#forbiddenOperations]);
  }

  async createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices> {
    const services = await this.#base.createRuntimeStorageServices(request);
    const trap = (operation: string): void => {
      if (!this.#forbidFullResidency) {
        return;
      }
      this.#forbiddenOperations.push(operation);
      throw new ForbiddenFirstUseOpticsOperationError(operation);
    };
    return Object.freeze({
      content: trapService(services.content, 'content', ['stage'], trap),
      auditLog: trapService(services.auditLog, 'auditLog', ['append'], trap),
      patchJournal: trapService(
        services.patchJournal,
        'patchJournal',
        ['appendPatch', 'scanPatchRange'],
        trap,
      ),
      strands: trapService(
        services.strands,
        'strands',
        ['publishDescriptor', 'deleteDescriptor'],
        trap,
      ),
      checkpoints: trapService(
        services.checkpoints,
        'checkpoints',
        ['publishCheckpoint', 'publishCoverage', 'loadCheckpoint'],
        trap,
      ),
      indexes: trapService(
        services.indexes,
        'indexes',
        ['writeShards', 'scanShards'],
        trap,
      ),
      intents: trapService(services.intents, 'intents', ['publish'], trap),
      materializations: services.materializations,
      ...(services.stateSnapshots === undefined
        ? {}
        : {
          stateSnapshots: trapService(
            services.stateSnapshots,
            'stateSnapshots',
            ['put', 'pin', 'publishCheckpointHead', 'pruneEvictable'],
            trap,
          ),
        }),
      ...(services.trie === undefined ? {} : { trie: services.trie }),
    });
  }
}

class FirstUseOpticsStorage extends WarpStorage {
  constructor(history: InMemoryGraphAdapter, runtimeStorage: RuntimeStorageProviderPort) {
    super();
    bindWarpStorage(this, { history, runtimeStorage });
  }
}

function trapService<TService extends object>(
  service: TService,
  serviceName: string,
  forbiddenMethods: readonly string[],
  trap: (operation: string) => void,
): TService {
  const forbidden = new Set(forbiddenMethods);
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        if (typeof property === 'string' && forbidden.has(property)) {
          trap(`${serviceName}.${property}`);
        }
        return Reflect.apply(value, target, args);
      };
    },
  });
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

describe('v18 first-use optics honesty gate', () => {
  it('reads an existing checkpoint-tail basis without full residency or writes', async () => {
    const history = new InMemoryGraphAdapter();
    const runtimeStorage = new FirstUseOpticsTrapStorage(
      new MemoryRuntimeStorageAdapter({ history }),
    );
    const runtime = await openRuntimeHostProduct({
      persistence: history,
      runtimeStorage,
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
      persistence: history,
      runtimeStorage,
      worldlineName: 'v18-first-use-optics-honesty',
      writerId: 'app',
    });
    runtimeStorage.forbidFullResidencyOperations();

    const storage = new FirstUseOpticsStorage(history, runtimeStorage);
    const warp = await openWarp({ storage, writer: 'app' });
    const timeline = await warp.timeline('v18-first-use-optics-honesty');
    const property = await timeline.read(
      reading.property({ subject: NODE_ID, key: PROPERTY_KEY }),
    );
    const inspection = inspectReceipt(property.receipt, { storage });
    const basis = await events.prepareOpticBasis();
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
    expect(runtimeStorage.forbiddenOperations()).toEqual([]);
  });

  it('keeps basis preparation source on semantic bounded-read ports', () => {
    const implementation = prepareOpticBasisImplementation();
    const verifier = readRepoFile('src/domain/services/optic/CheckpointTailBasisVerifier.ts');
    const checkedSources = `${implementation}\n${verifier}`;

    expect(implementation).toContain('new CheckpointTailBasisVerifier');
    expect(verifier).toContain('_checkpointStore.loadBasis');
    expect(checkedSources).not.toMatch(/\bmaterialize\s*\(/u);
    expect(checkedSources).not.toContain('_materializeGraph');
    expect(checkedSources).not.toContain('_setMaterializedState');
    expect(checkedSources).not.toContain('createCheckpoint');
    expect(checkedSources).not.toContain('getStateSnapshot');
    expect(checkedSources).not.toContain('getNodes');
    expect(checkedSources).not.toContain('getEdges');
    expect(checkedSources).not.toContain('observer(');
    expect(checkedSources).not.toContain('cloneState');
    expect(checkedSources).not.toContain('_persistence');
    expect(checkedSources).not.toContain('readTreeOids');
    expect(checkedSources).not.toContain('readBlob');
  });
});
