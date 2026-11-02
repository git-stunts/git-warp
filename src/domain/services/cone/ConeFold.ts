import type PatchEntry from '../../artifacts/PatchEntry.ts';
import ConeAdjacencyRegistrar from './ConeAdjacencyRegistrar.ts';
import ConeAdmissionIndexer from './ConeAdmissionIndexer.ts';
import ConeConcurrencyFold from './ConeConcurrencyFold.ts';
import ConeDotLedger from './ConeDotLedger.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import ConeFolded from './ConeFolded.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import ConeFootprint from './ConeFootprint.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import type ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import ConeSharedDotObstruction from './ConeSharedDotObstruction.ts';
import ConeWorkspace from './ConeWorkspace.ts';

/**
 * Folds one patch into a cone session.
 *
 * The fold reads only the records the patch's footprint names, settles its
 * dot claims, applies the patch through the reducer over a workspace of
 * those records, folds its register writes and lifecycle effects into the
 * concurrency those records retain, registers newly recorded edges with
 * their endpoints, indexes its entity admissions, and stages exactly the
 * records that changed. Its cost is proportional to the
 * patch, never to the graph.
 */
export default class ConeFold {
  /** Folds `entry`, or returns the obstruction that stops it without staging anything. */
  static async fold(session: ConeFoldSession, entry: PatchEntry): Promise<ConeFolded | ConeSharedDotObstruction> {
    const footprint = ConeFootprint.of(entry.patch);
    const snapshot = await session.read(footprint.recordKeys());
    const dots = ConeDotLedger.settle(snapshot, footprint, entry.sha);
    if (dots instanceof ConeSharedDotObstruction) {
      return dots;
    }
    const workspace = ConeWorkspace.hydrate(snapshot, footprint);
    workspace.apply(entry);
    const concurrency = ConeConcurrencyFold.of(entry, session.implicitObservation(entry.patch.writer));
    const edges = workspace.edgeRecords().map((edge) => concurrency.edge(edge));
    const nodes = workspace.nodeRecords().map((node) => concurrency.node(node));
    const adjacency = await ConeAdjacencyRegistrar.register(session, nodes, createdEdges(snapshot, edges));
    const changed = [
      ...changedNodes(snapshot, adjacency.nodes),
      ...changedEdges(snapshot, edges),
      ...dots,
      ...adjacency.pages,
      ...await ConeAdmissionIndexer.index(session, entry),
    ];
    await session.stage(changed);
    return new ConeFolded(entry.sha, changed.length);
  }
}

/** Edge keys whose record this patch creates; only those join adjacency. */
function createdEdges(snapshot: ConeRecordSnapshot, edges: readonly ConeEdgeRecord[]): string[] {
  return edges
    .filter((edge) => snapshot.storedEdge(edge.edgeKey) === null && !edge.isEmpty())
    .map((edge) => edge.edgeKey);
}

function changedNodes(snapshot: ConeRecordSnapshot, nodes: readonly ConeNodeRecord[]): ConeNodeRecord[] {
  return nodes.filter((node) => !node.equals(snapshot.node(node.nodeId)));
}

function changedEdges(snapshot: ConeRecordSnapshot, edges: readonly ConeEdgeRecord[]): ConeEdgeRecord[] {
  return edges.filter((edge) => !edge.equals(snapshot.edge(edge.edgeKey)));
}
