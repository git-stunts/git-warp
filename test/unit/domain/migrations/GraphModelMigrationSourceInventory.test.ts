import { describe, expect, it } from 'vitest';

import GraphModelMigrationBasis from '../../../../src/domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentSource
  from '../../../../src/domain/migrations/GraphModelMigrationContentSource.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPatchDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationSourceInventory
  from '../../../../src/domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationStateSnapshotReference
  from '../../../../src/domain/migrations/GraphModelMigrationStateSnapshotReference.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../../../src/domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';

describe('GraphModelMigrationSourceInventory', () => {
  it('records a missing source basis as a fatal collection error', () => {
    const inventory = createInventory({ sourceBasis: null });

    expect(inventory.sourceBasis).toBeNull();
    expect(inventory.hasFatalErrors()).toBe(true);
    expect(inventory.isUsableForPlanning()).toBe(false);
    expect(inventory.fatalErrors.map((notice) => notice.code)).toContain('E_MISSING_SOURCE_BASIS');
  });

  it('rejects duplicate patch identity', () => {
    expect(() => createInventory({
      patchDescriptors: [
        patchDescriptor('patch:one', 'writer:a', 0),
        patchDescriptor('patch:one', 'writer:a', 1),
      ],
      writerChains: [writerChain('writer:a', ['patch:one'])],
    })).toThrow(/duplicates patch identity/);
  });

  it('orders patch descriptors deterministically by writer and sequence', () => {
    const inventory = createInventory({
      patchDescriptors: [
        patchDescriptor('patch:a:1', 'writer:a', 1),
        patchDescriptor('patch:b:0', 'writer:b', 0),
        patchDescriptor('patch:a:0', 'writer:a', 0),
      ],
      writerChains: [
        writerChain('writer:b', ['patch:b:0']),
        writerChain('writer:a', ['patch:a:0', 'patch:a:1']),
      ],
    });

    expect(inventory.patchDescriptors.map((patch) => patch.patchId)).toEqual([
      'patch:a:0',
      'patch:a:1',
      'patch:b:0',
    ]);
  });

  it('rejects patch descriptors that do not match writer chain order', () => {
    expect(() => createInventory({
      patchDescriptors: [
        patchDescriptor('patch:a:0', 'writer:a', 1),
        patchDescriptor('patch:a:1', 'writer:a', 0),
      ],
      writerChains: [writerChain('writer:a', ['patch:a:0', 'patch:a:1'])],
    })).toThrow(/does not match writer chain position/);
  });

  it('keeps warnings usable for planning', () => {
    const warning = GraphModelMigrationNotice.warning(
      'W_CONTENT_SOURCE_EXTRA',
      'extra content source was collected',
    );
    const inventory = createInventory({ warnings: [warning] });

    expect(inventory.warnings).toEqual([warning]);
    expect(inventory.hasFatalErrors()).toBe(false);
    expect(inventory.isUsableForPlanning()).toBe(true);
  });

  it('keeps fatal collection errors from planner use', () => {
    const fatal = GraphModelMigrationNotice.fatal(
      'E_PATCH_JOURNAL_INCOMPLETE',
      'patch journal collection stopped early',
    );
    const inventory = createInventory({ fatalErrors: [fatal] });

    expect(inventory.fatalErrors).toEqual([fatal]);
    expect(inventory.hasFatalErrors()).toBe(true);
    expect(inventory.isUsableForPlanning()).toBe(false);
  });

  it('records state and content source facts immutably', () => {
    const contentSource = new GraphModelMigrationContentSource({
      legacyContentKey: 'node:a\0_content',
      contentHandle: 'asset:content:a',
    });
    const stateSnapshot = new GraphModelMigrationStateSnapshotReference({
      snapshotId: 'snapshot:one',
    });
    const inventory = createInventory({
      contentSources: [contentSource],
      stateSnapshot,
    });

    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory.contentSources)).toBe(true);
    expect(inventory.contentSources).toEqual([contentSource]);
    expect(inventory.stateSnapshot).toBe(stateSnapshot);
  });
});

type InventoryOverrides = {
  readonly sourceBasis?: GraphModelMigrationBasis | null;
  readonly writerChains?: readonly GraphModelMigrationWriterChainDescriptor[];
  readonly patchDescriptors?: readonly GraphModelMigrationPatchDescriptor[];
  readonly stateSnapshot?: GraphModelMigrationStateSnapshotReference | null;
  readonly contentSources?: readonly GraphModelMigrationContentSource[];
  readonly warnings?: readonly GraphModelMigrationNotice[];
  readonly fatalErrors?: readonly GraphModelMigrationNotice[];
};

function createInventory(overrides: InventoryOverrides = {}): GraphModelMigrationSourceInventory {
  return new GraphModelMigrationSourceInventory({
    graphId: 'graph:source',
    sourceBasis: 'sourceBasis' in overrides ? overrides.sourceBasis : sourceBasis(),
    writerChains: overrides.writerChains ?? [writerChain('writer:a', ['patch:a:0'])],
    patchDescriptors: overrides.patchDescriptors ?? [patchDescriptor('patch:a:0', 'writer:a', 0)],
    stateSnapshot: 'stateSnapshot' in overrides ? overrides.stateSnapshot : stateSnapshot(),
    contentSources: overrides.contentSources ?? [],
    warnings: overrides.warnings ?? [],
    fatalErrors: overrides.fatalErrors ?? [],
  });
}

function sourceBasis(): GraphModelMigrationBasis {
  return new GraphModelMigrationBasis({
    graphId: 'graph:source',
    basisId: 'basis:source',
  });
}

function stateSnapshot(): GraphModelMigrationStateSnapshotReference {
  return new GraphModelMigrationStateSnapshotReference({
    snapshotId: 'snapshot:default',
  });
}

function writerChain(
  writerId: string,
  patchIds: readonly string[],
): GraphModelMigrationWriterChainDescriptor {
  return new GraphModelMigrationWriterChainDescriptor({ writerId, patchIds });
}

function patchDescriptor(
  patchId: string,
  writerId: string,
  writerSequence: number,
): GraphModelMigrationPatchDescriptor {
  return new GraphModelMigrationPatchDescriptor({ patchId, writerId, writerSequence });
}
