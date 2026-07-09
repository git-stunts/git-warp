/**
 * v19 explicit subpath consumer fixture -- compile-only.
 *
 * Storage, advanced, diagnostics, and legacy imports stay reachable only from
 * their named compatibility surfaces.
 */

import {
  GitStorageAdapter,
  MemoryStorageAdapter,
  NodeCryptoAdapter,
} from '../../storage.ts';
import {
  GitWarpTickHologram,
  Observer,
  Optic,
  ProjectionHandle,
} from '../../advanced.ts';
import {
  QueryBuilder,
  TtdMergeInspector,
  normalizeVisibleStateScope,
} from '../../diagnostics.ts';
import {
  InMemoryGraphAdapter,
  PatchBuilder,
  WarpWorldline,
  openWarpGraph,
  openWarpWorldline,
} from '../../legacy.ts';

const storageAdapter: typeof MemoryStorageAdapter = MemoryStorageAdapter;
const gitStorageAdapter: typeof GitStorageAdapter = GitStorageAdapter;
const nodeCryptoAdapter: typeof NodeCryptoAdapter = NodeCryptoAdapter;
const observer: typeof Observer = Observer;
const optic: typeof Optic = Optic;
const projectionHandle: typeof ProjectionHandle = ProjectionHandle;
const tickHologram: typeof GitWarpTickHologram = GitWarpTickHologram;
const queryBuilder: typeof QueryBuilder = QueryBuilder;
const ttdMergeInspector: typeof TtdMergeInspector = TtdMergeInspector;
const legacyAdapter: typeof InMemoryGraphAdapter = InMemoryGraphAdapter;
const patchBuilder: typeof PatchBuilder = PatchBuilder;
const worldline: typeof WarpWorldline = WarpWorldline;

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
void legacyAdapter;
void patchBuilder;
void worldline;
void openWarpGraph;
void openWarpWorldline;
