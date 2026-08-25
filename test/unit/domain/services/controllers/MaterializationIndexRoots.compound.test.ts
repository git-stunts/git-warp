import { describe, expect, it, vi } from 'vitest';

import type { IndexShard } from '../../../../../src/domain/artifacts/IndexShard.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import {
  MaterializationIndexRootPlan,
  prepareMaterializationIndexRoots,
} from '../../../../../src/domain/services/controllers/MaterializationIndexRoots.ts';
import LogicalBitmapIndexBuilder
  from '../../../../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import PropertyIndexBuilder
  from '../../../../../src/domain/services/index/PropertyIndexBuilder.ts';
import { encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type BundleHandle from '../../../../../src/domain/storage/BundleHandle.ts';
import type WarpStream from '../../../../../src/domain/stream/WarpStream.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import type {
  DependentArtifactAdmissionOptions,
  DependentArtifactOperation,
} from '../../../../../src/ports/ArtifactStagingPort.ts';
import MaterializationWorkspacePort from '../../../../../src/ports/MaterializationWorkspacePort.ts';
import type { IndexShardWriteOptions } from '../../../../../src/ports/IndexStorePort.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';

describe('prepareMaterializationIndexRoots compound admission', () => {
  it('stages property and logical indexes through one bounded admission', async () => {
    const workspace = new CompoundRecordingWorkspace();
    const store = new RecordingIndexStorage();

    const roots = await prepareMaterializationIndexRoots({
      state: stateWithOneProperty(),
      store,
      workspace,
    });

    expect(roots.properties.status).toBe('retained');
    expect(roots.roaringIndexes.status).toBe('retained');
    expect(store.writeOptions).toHaveLength(2);
    const operationBound = store.writeOptions.reduce(
      (sum, options) => sum + (options.expectedShardCount ?? 0) + 1,
      0,
    );
    expect(workspace.operationBounds).toEqual([operationBound]);
    expect(workspace.retentions).toEqual([[
      roots.properties.handle?.toString(),
      roots.roaringIndexes.handle?.toString(),
    ]]);
    expect(store.writeOptions.map((options) => options.staging))
      .toEqual([workspace.scoped, workspace.scoped]);
  });

  it('keeps separate staging when the conservative bound exceeds the ceiling', async () => {
    const workspace = new CompoundRecordingWorkspace();
    const store = new RecordingIndexStorage();

    await prepareMaterializationIndexRoots({
      state: stateWithProperties(1_024),
      store,
      workspace,
    });

    expect(workspace.operationBounds).toEqual([]);
    expect(store.writeOptions).toHaveLength(2);
    expect(store.writeOptions.map((options) => options.staging))
      .toEqual([workspace, workspace]);
  });

  it('defers shard construction until the prepared plan is written', async () => {
    const originalLogicalYield = LogicalBitmapIndexBuilder.prototype.yieldShards;
    const originalPropertyYield = PropertyIndexBuilder.prototype.yieldShards;
    let logicalShards = 0;
    let propertyShards = 0;
    const logicalYieldSpy = vi.spyOn(LogicalBitmapIndexBuilder.prototype, 'yieldShards')
      .mockImplementation(function* (this: LogicalBitmapIndexBuilder) {
        for (const shard of originalLogicalYield.call(this)) {
          logicalShards += 1;
          yield shard;
        }
      });
    const propertyYieldSpy = vi.spyOn(PropertyIndexBuilder.prototype, 'yieldShards')
      .mockImplementation(function* (this: PropertyIndexBuilder) {
        for (const shard of originalPropertyYield.call(this)) {
          propertyShards += 1;
          yield shard;
        }
      });

    try {
      const plan = MaterializationIndexRootPlan.create({
        state: stateWithOneProperty(),
        store: new RecordingIndexStorage(),
      });

      expect(logicalShards).toBe(0);
      expect(propertyShards).toBe(0);
      await plan.write(new ScopedArtifactWorkspace());
      expect(logicalShards).toBeGreaterThan(0);
      expect(propertyShards).toBe(1);
    } finally {
      logicalYieldSpy.mockRestore();
      propertyYieldSpy.mockRestore();
    }
  });
});

class RecordingIndexStorage extends MockIndexStorage {
  readonly writeOptions: IndexShardWriteOptions[] = [];

  override async writeShards(
    shardStream: WarpStream<IndexShard>,
    options: IndexShardWriteOptions = {},
  ): Promise<BundleHandle> {
    this.writeOptions.push(options);
    return await super.writeShards(shardStream);
  }
}

class CompoundRecordingWorkspace extends MaterializationWorkspacePort {
  readonly operationBounds: number[] = [];
  readonly retentions: (readonly string[])[] = [];
  readonly scoped = new ScopedArtifactWorkspace();

  override async admitDependentArtifacts<T>(
    operation: DependentArtifactOperation<T>,
    options: DependentArtifactAdmissionOptions<T>,
  ): Promise<T> {
    this.operationBounds.push(options.maxOperations);
    const value = await operation(this.scoped);
    if (options.retain !== undefined) {
      this.retentions.push(options.retain(value));
    }
    return value;
  }

  override checkpoint(): Promise<never> {
    return Promise.reject(new Error('Index-root test does not checkpoint'));
  }

  override promote(): Promise<never> {
    return Promise.reject(new Error('Index-root test does not promote'));
  }

  override release(): Promise<void> {
    return Promise.resolve();
  }

  override stagePage(): Promise<string> {
    return Promise.resolve('outer:page');
  }

  override stageOrderedBundle(): Promise<never> {
    return Promise.reject(new Error('Index-root test does not stage outer bundles'));
  }
}

class ScopedArtifactWorkspace extends MaterializationWorkspacePort {
  override checkpoint(): Promise<never> {
    return Promise.reject(new Error('Scoped index-root test does not checkpoint'));
  }

  override promote(): Promise<never> {
    return Promise.reject(new Error('Scoped index-root test does not promote'));
  }

  override release(): Promise<void> {
    return Promise.resolve();
  }

  override stagePage(): Promise<string> {
    return Promise.resolve('scoped:page');
  }

  override stageOrderedBundle(): Promise<never> {
    return Promise.reject(new Error('Scoped index-root test does not stage bundles'));
  }
}

function stateWithOneProperty(): WarpState {
  return stateWithProperties(1);
}

function stateWithProperties(count: number): WarpState {
  const state = WarpState.empty();
  for (let index = 0; index < count; index += 1) {
    const nodeId = `node:${String(index)}`;
    const counter = index + 1;
    state.nodeAlive.add(nodeId, Dot.create('writer', counter));
    state.mutatePropRegisterLWW(
      encodePropKey(nodeId, 'status'),
      new LWWRegister(new EventId(counter, 'writer', 'a1b2', 0), 'ready'),
    );
  }
  return state;
}
