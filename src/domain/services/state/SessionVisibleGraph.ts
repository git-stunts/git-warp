import StateSession from "../../orset/session/StateSession.ts";
import { decodeEdgeKey } from "../KeyCodec.ts";

export type VisibleEdgeRecord = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export async function collectAliveNodeIdsFromSession(
  session: StateSession,
): Promise<string[]> {
  const aliveNodes: string[] = [];
  for await (const nodeId of session.scanNodes()) {
    aliveNodes.push(nodeId);
  }
  aliveNodes.sort();
  return aliveNodes;
}

export async function collectAliveNodeSetFromSession(
  session: StateSession,
): Promise<Set<string>> {
  return new Set(await collectAliveNodeIdsFromSession(session));
}

export async function collectVisibleEdgesFromSession(
  session: StateSession,
  aliveNodes?: ReadonlySet<string>,
): Promise<VisibleEdgeRecord[]> {
  const visibleEdges: VisibleEdgeRecord[] = [];
  const aliveNodeSet = aliveNodes ?? await collectAliveNodeSetFromSession(session);

  for await (const edgeKey of session.scanEdges()) {
    const edge = decodeEdgeKey(edgeKey);
    if (!aliveNodeSet.has(edge.from) || !aliveNodeSet.has(edge.to)) {
      continue;
    }
    visibleEdges.push(edge);
  }

  visibleEdges.sort((a, b) => {
    if (a.from !== b.from) {
      return a.from < b.from ? -1 : 1;
    }
    if (a.to !== b.to) {
      return a.to < b.to ? -1 : 1;
    }
    if (a.label !== b.label) {
      return a.label < b.label ? -1 : 1;
    }
    return 0;
  });

  return visibleEdges;
}
