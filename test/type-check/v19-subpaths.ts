/**
 * v19 explicit subpath consumer fixture -- compile-only.
 *
 * Storage, advanced, and diagnostics imports stay reachable only from their
 * named expert surfaces.
 */

import { GitStorageAdapter, MemoryStorageAdapter, NodeCryptoAdapter } from '../../storage.ts';
import { GitWarpTickHologram, Observer, Optic, ProjectionHandle } from '../../advanced.ts';
import { QueryBuilder, TtdMergeInspector, normalizeVisibleStateScope } from '../../diagnostics.ts';

const storageAdapter: typeof MemoryStorageAdapter = MemoryStorageAdapter;
const gitStorageAdapter: typeof GitStorageAdapter = GitStorageAdapter;
const nodeCryptoAdapter: typeof NodeCryptoAdapter = NodeCryptoAdapter;
const observer: typeof Observer = Observer;
const optic: typeof Optic = Optic;
const projectionHandle: typeof ProjectionHandle = ProjectionHandle;
const tickHologram: typeof GitWarpTickHologram = GitWarpTickHologram;
const queryBuilder: typeof QueryBuilder = QueryBuilder;
const ttdMergeInspector: typeof TtdMergeInspector = TtdMergeInspector;

void storageAdapter;
void gitStorageAdapter;
void nodeCryptoAdapter;
void observer;
void optic;
void projectionHandle;
void tickHologram;
void queryBuilder;
void ttdMergeInspector;
void normalizeVisibleStateScope;
