/**
 * Small, finite boundary corpus for #1120 / PR #1116.
 * Oracle: a remove must be refused if any add in its patch assigns an
 * observed dot to another owner. Dot reuse alone has no new refusal law.
 */

type WireDot = Readonly<{ writerId: string; counter: number }>;
type WireNodeAdd = Readonly<{ type: 'NodeAdd'; node: string; dot: WireDot }>;
type WireEdgeAdd = Readonly<{ type: 'EdgeAdd'; from: string; to: string; label: string; dot: WireDot }>;
type WireNodeRemove = Readonly<{ type: 'NodeRemove'; node: string; observedDots: readonly string[] }>;
type WireEdgeRemove = Readonly<{
  type: 'EdgeRemove'; from: string; to: string; label: string; observedDots: readonly string[];
}>;
type WireAdd = WireNodeAdd | WireEdgeAdd;
type WireRemove = WireNodeRemove | WireEdgeRemove;
type WireMembershipOp = WireAdd | WireRemove;

type OwnerPair = Readonly<{
  name: string;
  foreign: WireAdd;
  owned: WireAdd;
  remove: WireRemove;
  liveNodes: readonly string[];
  liveEdges: readonly string[];
}>;

type RefusedCase = Readonly<{ name: string; ops: readonly WireMembershipOp[] }>;
type AcceptedCase = RefusedCase & Readonly<{ liveNodes: readonly string[]; liveEdges: readonly string[] }>;

const DOT: WireDot = Object.freeze({ writerId: 'peer', counter: 2 });
const OBSERVED = Object.freeze(['peer:2']);
const NODE_A: WireNodeAdd = Object.freeze({ type: 'NodeAdd', node: 'a', dot: DOT });
const NODE_B: WireNodeAdd = Object.freeze({ type: 'NodeAdd', node: 'b', dot: DOT });
const EDGE_X: WireEdgeAdd = Object.freeze({ type: 'EdgeAdd', from: 'a', to: 'b', label: 'x', dot: DOT });
const EDGE_Y: WireEdgeAdd = Object.freeze({ type: 'EdgeAdd', from: 'a', to: 'b', label: 'y', dot: DOT });
const REMOVE_B: WireNodeRemove = Object.freeze({ type: 'NodeRemove', node: 'b', observedDots: OBSERVED });
const REMOVE_Y: WireEdgeRemove = Object.freeze({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'y', observedDots: OBSERVED });

const OWNER_PAIRS: readonly OwnerPair[] = [
  { name: 'two node owners', foreign: NODE_A, owned: NODE_B, remove: REMOVE_B,
    liveNodes: ['a', 'b'], liveEdges: [] },
  { name: 'two edge owners', foreign: EDGE_X, owned: EDGE_Y, remove: REMOVE_Y,
    liveNodes: [], liveEdges: ['a\0b\0x', 'a\0b\0y'] },
  { name: 'node add and edge remove', foreign: NODE_A, owned: EDGE_Y, remove: REMOVE_Y,
    liveNodes: ['a'], liveEdges: ['a\0b\0y'] },
  { name: 'edge add and node remove', foreign: EDGE_X, owned: NODE_B, remove: REMOVE_B,
    liveNodes: ['b'], liveEdges: ['a\0b\0x'] },
];

function conflictingOrders(pair: OwnerPair): RefusedCase[] {
  return [
    { name: `${pair.name}; foreign first; remove last`, ops: [pair.foreign, pair.owned, pair.remove] },
    { name: `${pair.name}; foreign first; remove between`, ops: [pair.foreign, pair.remove, pair.owned] },
    { name: `${pair.name}; foreign first; remove first`, ops: [pair.remove, pair.foreign, pair.owned] },
    { name: `${pair.name}; owner first; remove last`, ops: [pair.owned, pair.foreign, pair.remove] },
    { name: `${pair.name}; owner first; remove between`, ops: [pair.owned, pair.remove, pair.foreign] },
    { name: `${pair.name}; owner first; remove first`, ops: [pair.remove, pair.owned, pair.foreign] },
  ];
}

export const CONFLICTING_REMOVE_OWNERS: readonly RefusedCase[] = OWNER_PAIRS.flatMap(conflictingOrders);

function duplicateAddsWithoutRemove(pair: OwnerPair): AcceptedCase[] {
  return [
    { name: `${pair.name}; foreign first; no remove`, ops: [pair.foreign, pair.owned],
      liveNodes: pair.liveNodes, liveEdges: pair.liveEdges },
    { name: `${pair.name}; owner first; no remove`, ops: [pair.owned, pair.foreign],
      liveNodes: pair.liveNodes, liveEdges: pair.liveEdges },
  ];
}

export const ACCEPTED_DUPLICATE_DOTS: readonly AcceptedCase[] = [
  ...OWNER_PAIRS.flatMap(duplicateAddsWithoutRemove),
  { name: 'same node owner; remove after duplicate adds', ops: [NODE_B, NODE_B, REMOVE_B], liveNodes: [], liveEdges: [] },
  { name: 'same node owner; remove before duplicate adds', ops: [REMOVE_B, NODE_B, NODE_B], liveNodes: [], liveEdges: [] },
  { name: 'same edge owner; remove after duplicate adds', ops: [EDGE_Y, EDGE_Y, REMOVE_Y], liveNodes: [], liveEdges: [] },
  { name: 'same edge owner; remove before duplicate adds', ops: [REMOVE_Y, EDGE_Y, EDGE_Y], liveNodes: [], liveEdges: [] },
  { name: 'same node owner; duplicate adds and duplicate removes interleaved',
    ops: [REMOVE_B, NODE_B, REMOVE_B, NODE_B], liveNodes: [], liveEdges: [] },
  { name: 'same edge owner; duplicate adds and duplicate removes interleaved',
    ops: [REMOVE_Y, EDGE_Y, REMOVE_Y, EDGE_Y], liveNodes: [], liveEdges: [] },
];
