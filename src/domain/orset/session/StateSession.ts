import { type Dot } from "../../crdt/Dot.ts";
import type VersionVector from "../../crdt/VersionVector.ts";
import StateSessionError from "../../errors/StateSessionError.ts";
import type ORSetElementState from "../ORSetElementState.ts";
import type CodecPort from "../../../ports/CodecPort.ts";
import type MaterializationWorkspacePort from "../../../ports/MaterializationWorkspacePort.ts";
import StorageRetentionWitness from "../../storage/StorageRetentionWitness.ts";
import type TrieStorePort from "../trie/TrieStorePort.ts";
import PageCache from "../trie/PageCache.ts";
import TrieCursor from "../trie/TrieCursor.ts";
import TrieFlusher from "../trie/TrieFlusher.ts";
import TrieGeometry from "../trie/TrieGeometry.ts";
import type FlushResult from "../trie/FlushResult.ts";
import ShadowTrieORSet from "../shadow/ShadowTrieORSet.ts";

import StateSessionCloseResult from "./StateSessionCloseResult.ts";

type StateSessionDependencies = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
  readonly store: TrieStorePort;
  readonly codec: CodecPort;
  readonly geometry: TrieGeometry;
  readonly pageCache: PageCache;
};

type BoundedStateSessionOpen = Readonly<{
  workspace: MaterializationWorkspacePort;
  maxDirtyPages?: number;
}>;

type DiagnosticStateSessionOpen = Readonly<{
  workspace?: undefined;
  maxDirtyPages?: undefined;
}>;

export type StateSessionOpen = StateSessionDependencies & (
  | BoundedStateSessionOpen
  | DiagnosticStateSessionOpen
);

export type StateSessionPreparedClose = Readonly<{
  roots: StateSessionCloseResult;
  accept(witness: StorageRetentionWitness | null): void;
}>;

type PreparedSessionFlush = Readonly<{
  node: FlushResult;
  edge: FlushResult;
  roots: StateSessionCloseResult;
}>;

const DEFAULT_MAX_DIRTY_PAGES = 1024;

export default class StateSession {
  readonly #nodeAlive: ShadowTrieORSet;
  readonly #edgeAlive: ShadowTrieORSet;
  readonly #workspace: MaterializationWorkspacePort | null;
  readonly #maxDirtyPages: number;
  #workspaceCheckpointPending = false;
  #closePrepared = false;
  #closed = false;

  constructor(fields: {
    readonly nodeAlive: ShadowTrieORSet;
    readonly edgeAlive: ShadowTrieORSet;
    readonly workspace?: MaterializationWorkspacePort;
    readonly maxDirtyPages: number;
  }) {
    this.#nodeAlive = fields.nodeAlive;
    this.#edgeAlive = fields.edgeAlive;
    this.#workspace = fields.workspace ?? null;
    this.#maxDirtyPages = fields.maxDirtyPages;
    Object.freeze(this);
  }

  static async open(init: StateSessionOpen): Promise<StateSession> {
    validateRootOid("nodeAliveRootOid", init.nodeAliveRootOid);
    validateRootOid("edgeAliveRootOid", init.edgeAliveRootOid);
    validateStore(init.store);
    validateCodec(init.codec);
    validateGeometry(init.geometry);
    validatePageCache(init.pageCache);
    validateWorkspace(init.workspace);
    const maxDirtyPages = normalizeMaxDirtyPages(init.maxDirtyPages, init.workspace);

    const nodeCursor = new TrieCursor({
      rootOid: init.nodeAliveRootOid,
      store: init.store,
      geometry: init.geometry,
      codec: init.codec,
      pageCache: init.pageCache,
    });
    const edgeCursor = new TrieCursor({
      rootOid: init.edgeAliveRootOid,
      store: init.store,
      geometry: init.geometry,
      codec: init.codec,
      pageCache: init.pageCache,
    });
    const nodeFlusher = new TrieFlusher({
      store: init.store,
      codec: init.codec,
    });
    const edgeFlusher = new TrieFlusher({
      store: init.store,
      codec: init.codec,
    });

    return new StateSession({
      nodeAlive: new ShadowTrieORSet({
        cursor: nodeCursor,
        flusher: nodeFlusher,
      }),
      edgeAlive: new ShadowTrieORSet({
        cursor: edgeCursor,
        flusher: edgeFlusher,
      }),
      ...(init.workspace === undefined ? {} : { workspace: init.workspace }),
      maxDirtyPages,
    });
  }

  async nodeContains(id: string): Promise<boolean> {
    this.#assertOpen();
    return await this.#nodeAlive.contains(id);
  }

  async nodeDots(id: string): Promise<ReadonlySet<string>> {
    this.#assertOpen();
    return await this.#nodeAlive.getDots(id);
  }

  async nodeElementState(id: string): Promise<ORSetElementState | null> {
    this.#assertOpen();
    return await this.#nodeAlive.getElementState(id);
  }

  async edgeContains(key: string): Promise<boolean> {
    this.#assertOpen();
    return await this.#edgeAlive.contains(key);
  }

  async edgeDots(key: string): Promise<ReadonlySet<string>> {
    this.#assertOpen();
    return await this.#edgeAlive.getDots(key);
  }

  async edgeElementState(key: string): Promise<ORSetElementState | null> {
    this.#assertOpen();
    return await this.#edgeAlive.getElementState(key);
  }

  async addNode(id: string, dot: Dot): Promise<void> {
    this.#assertOpen();
    await this.#nodeAlive.add(id, dot);
    await this.#checkpointIfNeeded();
  }

  async addEdge(key: string, dot: Dot): Promise<void> {
    this.#assertOpen();
    await this.#edgeAlive.add(key, dot);
    await this.#checkpointIfNeeded();
  }

  async removeNode(id: string, observedDots: ReadonlySet<string>): Promise<void> {
    this.#assertOpen();
    await this.#nodeAlive.removeElement(id, observedDots);
    await this.#checkpointIfNeeded();
  }

  async removeEdge(key: string, observedDots: ReadonlySet<string>): Promise<void> {
    this.#assertOpen();
    await this.#edgeAlive.removeElement(key, observedDots);
    await this.#checkpointIfNeeded();
  }

  scanNodes(): AsyncIterable<string> {
    this.#assertOpen();
    return this.#nodeAlive.scan();
  }

  scanNodeElementStates(): AsyncIterable<ORSetElementState> {
    this.#assertOpen();
    return this.#nodeAlive.scanElementStates();
  }

  scanEdges(): AsyncIterable<string> {
    this.#assertOpen();
    return this.#edgeAlive.scan();
  }

  scanEdgeElementStates(): AsyncIterable<ORSetElementState> {
    this.#assertOpen();
    return this.#edgeAlive.scanElementStates();
  }

  async compact(includedVV: VersionVector): Promise<void> {
    this.#assertOpen();
    if (this.#workspace !== null) {
      throw new StateSessionError(
        "Bounded StateSession compaction requires resumable subtree checkpoints",
        { code: "E_STATE_SESSION_INPUT" },
      );
    }
    await this.#nodeAlive.compact(includedVV);
    await this.#edgeAlive.compact(includedVV);
    await this.#checkpointIfNeeded();
  }

  /** Mutated pages awaiting flush; this is not a total resident-memory metric. */
  dirtyPageCount(): number {
    return this.#nodeAlive.dirtyPageCount() + this.#edgeAlive.dirtyPageCount();
  }

  async close(): Promise<StateSessionCloseResult> {
    this.#assertOpen();
    const roots = await this.#flushAndRetain();
    this.#closed = true;
    return roots;
  }

  async prepareClose(): Promise<StateSessionPreparedClose> {
    this.#assertOpen();
    this.#closePrepared = true;
    try {
      const prepared = await this.#prepareFlush();
      let accepted = false;
      return Object.freeze({
        roots: prepared.roots,
        accept: (witness: StorageRetentionWitness | null) => {
          if (accepted) {
            throw new StateSessionError(
              "StateSession prepared close was already accepted",
              { code: "E_STATE_SESSION_CLOSED" },
            );
          }
          requireFinalRetentionWitness(prepared.roots, witness);
          this.#acceptFlush(prepared);
          accepted = true;
          this.#closed = true;
        },
      });
    } catch (raw) {
      this.#closePrepared = false;
      throw raw;
    }
  }

  async #checkpointIfNeeded(): Promise<void> {
    if (
      !this.#workspaceCheckpointPending &&
      this.dirtyPageCount() < this.#maxDirtyPages
    ) {
      return;
    }
    await this.#flushAndRetain();
  }

  async #flushAndRetain(): Promise<StateSessionCloseResult> {
    const prepared = await this.#prepareFlush();
    if (this.#workspaceCheckpointPending && this.#workspace !== null) {
      const witness = await this.#workspace.checkpoint({
        nodeAliveRoot: prepared.roots.nodeAliveRootOid,
        edgeAliveRoot: prepared.roots.edgeAliveRootOid,
      });
      requireWorkspaceWitness(prepared.roots, witness);
    }
    this.#acceptFlush(prepared);
    return prepared.roots;
  }

  async #prepareFlush(): Promise<PreparedSessionFlush> {
    const nodeFlush = await this.#nodeAlive.prepareFlush();
    if (!nodeFlush.isClean()) {
      this.#workspaceCheckpointPending = true;
    }
    const edgeFlush = await this.#edgeAlive.prepareFlush();
    if (!edgeFlush.isClean()) {
      this.#workspaceCheckpointPending = true;
    }
    const roots = new StateSessionCloseResult({
      nodeAliveRootOid: nodeFlush.rootOid,
      edgeAliveRootOid: edgeFlush.rootOid,
    });
    return Object.freeze({ node: nodeFlush, edge: edgeFlush, roots });
  }

  #acceptFlush(prepared: PreparedSessionFlush): void {
    this.#nodeAlive.acceptFlush(prepared.node);
    this.#edgeAlive.acceptFlush(prepared.edge);
    this.#workspaceCheckpointPending = false;
  }

  #assertOpen(): void {
    if (this.#closed || this.#closePrepared) {
      throw new StateSessionError(
        "StateSession is closed",
        { code: "E_STATE_SESSION_CLOSED" },
      );
    }
  }
}

function validateRootOid(name: string, rootOid: string | null): void {
  if (rootOid === null) {
    return;
  }
  if (typeof rootOid !== "string" || rootOid.length === 0) {
    throw new StateSessionError(
      `StateSession ${name} must be null or a non-empty string; received ${String(rootOid)}`,
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: name, rootOid },
      },
    );
  }
}

function validateStore(store: TrieStorePort): void {
  if (
    typeof store.readLeaf !== "function" ||
    typeof store.readBranch !== "function" ||
    typeof store.writeLeaf !== "function" ||
    typeof store.writeBranch !== "function"
  ) {
    throw new StateSessionError(
      "StateSession requires a TrieStorePort with read/write methods",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "store" },
      },
    );
  }
}

function validateCodec(codec: CodecPort): void {
  if (
    typeof codec.encode !== "function" ||
    typeof codec.decode !== "function"
  ) {
    throw new StateSessionError(
      "StateSession requires a CodecPort with encode/decode methods",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "codec" },
      },
    );
  }
}

function validateGeometry(geometry: TrieGeometry): void {
  if (!(geometry instanceof TrieGeometry)) {
    throw new StateSessionError(
      "StateSession requires a TrieGeometry instance",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "geometry" },
      },
    );
  }
}

function validatePageCache(pageCache: PageCache): void {
  if (!(pageCache instanceof PageCache)) {
    throw new StateSessionError(
      "StateSession requires a PageCache",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "pageCache" },
      },
    );
  }
}

function validateWorkspace(workspace: MaterializationWorkspacePort | undefined): void {
  if (workspace === undefined) {
    return;
  }
  if (
    typeof workspace.checkpoint !== "function" ||
    typeof workspace.promote !== "function" ||
    typeof workspace.release !== "function"
  ) {
    throw new StateSessionError(
      "StateSession workspace must provide checkpoint/promote/release methods",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "workspace" },
      },
    );
  }
}

function normalizeMaxDirtyPages(
  value: number | undefined,
  workspace: MaterializationWorkspacePort | undefined,
): number {
  if (workspace === undefined && value !== undefined) {
    throw new StateSessionError(
      "StateSession maxDirtyPages requires a materialization workspace",
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "maxDirtyPages" },
      },
    );
  }
  const normalized = value ?? (workspace === undefined
    ? Number.MAX_SAFE_INTEGER
    : DEFAULT_MAX_DIRTY_PAGES);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new StateSessionError(
      `StateSession maxDirtyPages must be a positive safe integer; received ${String(normalized)}`,
      {
        code: "E_STATE_SESSION_INPUT",
        context: { field: "maxDirtyPages", value: normalized },
      },
    );
  }
  return normalized;
}

function requireWorkspaceWitness(
  roots: StateSessionCloseResult,
  witness: Awaited<ReturnType<MaterializationWorkspacePort["checkpoint"]>>,
): void {
  if (
    (roots.nodeAliveRootOid !== null || roots.edgeAliveRootOid !== null) &&
    !isPinnedWorkspaceWitness(witness)
  ) {
    throw new StateSessionError(
      "StateSession workspace did not witness retained non-empty roots",
      { code: "E_STATE_SESSION_STRUCTURE" },
    );
  }
}

function isPinnedWorkspaceWitness(
  witness: Awaited<ReturnType<MaterializationWorkspacePort["checkpoint"]>>,
): witness is StorageRetentionWitness {
  return witness instanceof StorageRetentionWitness &&
    witness.policy === "pinned" &&
    witness.reachability === "anchored" &&
    witness.root.kind === "cache-set";
}

function requireFinalRetentionWitness(
  roots: StateSessionCloseResult,
  witness: StorageRetentionWitness | null,
): void {
  if (roots.nodeAliveRootOid === null && roots.edgeAliveRootOid === null) {
    return;
  }
  if (
    !(witness instanceof StorageRetentionWitness) ||
    witness.reachability !== "anchored" ||
    witness.root.kind !== "cache-set"
  ) {
    throw new StateSessionError(
      "StateSession final materialization did not witness retained non-empty roots",
      { code: "E_STATE_SESSION_STRUCTURE" },
    );
  }
}
