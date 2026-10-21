import { Dot } from '../../src/domain/crdt/Dot.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import type GitCasStrandStoreAdapter from '../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../src/ports/PatchJournalPort.ts';
import V21LegacyGraph, { type V21LegacyHistory } from './V21LegacyGraph.ts';
import type { V21MigrationRecord } from './V21MigrationRecord.ts';

export type V21LateLaneWrite = Readonly<{
  writerId: string;
  /** Commits beyond the migration frontier, oldest first. */
  commits: readonly string[];
  /** Add dots at or below the recorded floor: a writer that still mints from an unsafe seed. */
  reusedDots: readonly string[];
  /** The recorded head is no longer an ancestor of the writer ref. */
  rewritten: boolean;
}>;

export type V21LateStrandWrite = Readonly<{ ref: string; recorded: string | null; current: string | null }>;

export type V21LateWriteReport = Readonly<{
  graph: string;
  lanes: readonly V21LateLaneWrite[];
  strands: readonly V21LateStrandWrite[];
}>;

/**
 * Detects writes that arrived after a graph was migrated (#1015). v20 and
 * v21 lane commits share one encoding, so every lane commit beyond the
 * migration frontier is listed, and counters reused at or below the
 * recorded floor are flagged. Legacy strand refs are never read by v21, so
 * any that moved are reported rather than merged.
 */
export default class V21LateWrites {
  readonly #legacy: V21LegacyGraph;

  constructor(options: Readonly<{
    history: V21LegacyHistory;
    codec: CommitMessageCodecPort;
    journal: PatchJournalPort;
    strands: GitCasStrandStoreAdapter;
  }>) {
    this.#legacy = new V21LegacyGraph(options);
  }

  async report(record: V21MigrationRecord): Promise<V21LateWriteReport> {
    const inventory = await this.#legacy.inventory(record.graph);
    const lanes: V21LateLaneWrite[] = [];
    for (const [writerId, head] of inventory.laneHeads) {
      const recorded = record.frontier.lanes[writerId] ?? null;
      if (head !== recorded) { lanes.push(await this.#lane(writerId, head, recorded, record.floors[writerId] ?? 0)); }
    }
    return Object.freeze({
      graph: record.graph,
      lanes,
      strands: [
        ...moved(`refs/warp/${record.graph}/strands/`, record.frontier.legacyStrands, inventory.strandDescriptors),
        ...moved(`refs/warp/${record.graph}/strand-overlays/`, record.frontier.legacyOverlays, inventory.overlayHeads),
      ],
    });
  }

  async #lane(writerId: string, head: string, recorded: string | null, floor: number): Promise<V21LateLaneWrite> {
    const chain = await this.#legacy.chain(head);
    const from = recorded === null ? -1 : chain.findIndex((entry) => entry.sha === recorded);
    const late = chain.slice(from + 1);
    const reusedDots = late.flatMap((entry) => entry.patch.ops
      .filter((op): op is NodeAdd | EdgeAdd => op instanceof NodeAdd || op instanceof EdgeAdd)
      .filter((op) => op.dot.writerId === writerId && op.dot.counter <= floor)
      .map((op) => `${Dot.encode(op.dot)}@${entry.sha}`));
    return Object.freeze({
      writerId,
      commits: late.map((entry) => entry.sha),
      reusedDots,
      rewritten: recorded !== null && from < 0,
    });
  }
}

function moved(
  prefix: string,
  recorded: Readonly<Record<string, string>>,
  current: ReadonlyMap<string, string>,
): V21LateStrandWrite[] {
  const names = [...new Set([...Object.keys(recorded), ...current.keys()])].sort();
  return names
    .map((name) => Object.freeze({ ref: `${prefix}${name}`, recorded: recorded[name] ?? null, current: current.get(name) ?? null }))
    .filter((entry) => entry.recorded !== entry.current);
}
