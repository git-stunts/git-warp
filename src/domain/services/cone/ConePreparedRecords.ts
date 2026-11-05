import type ConeConcurrencyFold from './ConeConcurrencyFold.ts';
import ConeConcurrencyRecovery from './ConeConcurrencyRecovery.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecoveryObstruction from './ConeRecoveryObstruction.ts';
import type ConeWorkspace from './ConeWorkspace.ts';

/** Folded records whose bounded concurrent payloads are complete and ready to stage. */
export default class ConePreparedRecords {
  readonly nodes: readonly ConeNodeRecord[];
  readonly edges: readonly ConeEdgeRecord[];

  private constructor(nodes: readonly ConeNodeRecord[], edges: readonly ConeEdgeRecord[]) {
    this.nodes = Object.freeze([...nodes]);
    this.edges = Object.freeze([...edges]);
    Object.freeze(this);
  }

  static async of(workspace: ConeWorkspace, fold: ConeConcurrencyFold, session: ConeFoldSession): Promise<ConePreparedRecords | ConeRecoveryObstruction> {
    const nodes: ConeNodeRecord[] = [];
    const edges: ConeEdgeRecord[] = [];
    for (const record of workspace.nodeRecords()) {
      const folded = fold.node(record);
      const concurrency = await ConeConcurrencyRecovery.of(folded, session);
      if (concurrency instanceof ConeRecoveryObstruction) {
        return concurrency;
      }
      nodes.push(folded.withConcurrency(concurrency));
    }
    for (const record of workspace.edgeRecords()) {
      const folded = fold.edge(record);
      const concurrency = await ConeConcurrencyRecovery.of(folded, session);
      if (concurrency instanceof ConeRecoveryObstruction) {
        return concurrency;
      }
      edges.push(folded.withConcurrency(concurrency));
    }
    return new ConePreparedRecords(nodes, edges);
  }
}
