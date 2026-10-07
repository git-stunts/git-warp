import GraphPersistencePort from '../../src/ports/GraphPersistencePort.ts';
import type { CommitNodeOptions, LogNodesOptions } from '../../src/ports/CommitPort.ts';
import type { ListRefsOptions } from '../../src/ports/RefPort.ts';
import type InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';

/** The same history authority exposed through its commit/ref capabilities only. */
export default class HistoryOnlyKernel extends GraphPersistencePort {
  readonly #history: InMemoryGraphAdapter;
  constructor(history: InMemoryGraphAdapter) { super(); this.#history = history; }
  override commitNode(options: CommitNodeOptions) { return this.#history.commitNode(options); }
  override showNode(sha: string) { return this.#history.showNode(sha); }
  override getNodeInfo(sha: string) { return this.#history.getNodeInfo(sha); }
  override logNodes(options: LogNodesOptions) { return this.#history.logNodes(options); }
  override logNodesStream(options: LogNodesOptions) { return this.#history.logNodesStream(options); }
  override countNodes(ref: string) { return this.#history.countNodes(ref); }
  override nodeExists(sha: string) { return this.#history.nodeExists(sha); }
  override ping() { return this.#history.ping(); }
  override updateRef(ref: string, oid: string) { return this.#history.updateRef(ref, oid); }
  override readRef(ref: string) { return this.#history.readRef(ref); }
  override deleteRef(ref: string) { return this.#history.deleteRef(ref); }
  override listRefs(prefix: string, options?: ListRefsOptions) { return this.#history.listRefs(prefix, options); }
  override compareAndSwapRef(ref: string, oid: string, expected: string | null) {
    return this.#history.compareAndSwapRef(ref, oid, expected);
  }
}
