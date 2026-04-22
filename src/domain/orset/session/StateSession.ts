import { type Dot } from "../../crdt/Dot.ts";
import type VersionVector from "../../crdt/VersionVector.ts";
import StateSessionError from "../../errors/StateSessionError.ts";
import ORSetElementState from "../ORSetElementState.ts";
import type CodecPort from "../../../ports/CodecPort.ts";
import type TrieStorePort from "../trie/TrieStorePort.ts";
import PageCache from "../trie/PageCache.ts";
import TrieCursor from "../trie/TrieCursor.ts";
import TrieFlusher from "../trie/TrieFlusher.ts";
import TrieGeometry from "../trie/TrieGeometry.ts";
import ShadowTrieORSet from "../shadow/ShadowTrieORSet.ts";

import StateSessionCloseResult from "./StateSessionCloseResult.ts";

export type StateSessionOpen = {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
  readonly store: TrieStorePort;
  readonly codec: CodecPort;
  readonly geometry: TrieGeometry;
  readonly pageCache: PageCache;
};

export default class StateSession {
  readonly #nodeAlive: ShadowTrieORSet;
  readonly #edgeAlive: ShadowTrieORSet;
  #closed = false;

  constructor(fields: {
    readonly nodeAlive: ShadowTrieORSet;
    readonly edgeAlive: ShadowTrieORSet;
  }) {
    this.#nodeAlive = fields.nodeAlive;
    this.#edgeAlive = fields.edgeAlive;
    Object.freeze(this);
  }

  static async open(init: StateSessionOpen): Promise<StateSession> {
    validateRootOid("nodeAliveRootOid", init.nodeAliveRootOid);
    validateRootOid("edgeAliveRootOid", init.edgeAliveRootOid);
    validateStore(init.store);
    validateCodec(init.codec);
    validateGeometry(init.geometry);
    validatePageCache(init.pageCache);

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
  }

  async addEdge(key: string, dot: Dot): Promise<void> {
    this.#assertOpen();
    await this.#edgeAlive.add(key, dot);
  }

  async removeNodes(observedDots: ReadonlySet<string>): Promise<void> {
    this.#assertOpen();
    await this.#nodeAlive.remove(observedDots);
  }

  async removeEdges(observedDots: ReadonlySet<string>): Promise<void> {
    this.#assertOpen();
    await this.#edgeAlive.remove(observedDots);
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
    await this.#nodeAlive.compact(includedVV);
    await this.#edgeAlive.compact(includedVV);
  }

  async close(): Promise<StateSessionCloseResult> {
    this.#assertOpen();
    const nodeFlush = await this.#nodeAlive.flush();
    const edgeFlush = await this.#edgeAlive.flush();
    this.#closed = true;
    return new StateSessionCloseResult({
      nodeAliveRootOid: nodeFlush.rootOid,
      edgeAliveRootOid: edgeFlush.rootOid,
    });
  }

  #assertOpen(): void {
    if (this.#closed) {
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
