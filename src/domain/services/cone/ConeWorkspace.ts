import type ORSet from '../../crdt/ORSet.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type PatchEntry from '../../artifacts/PatchEntry.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { applyFast } from '../JoinReducer.ts';
import { encodeEdgeKey } from '../KeyCodec.ts';
import type WarpState from '../state/WarpState.ts';
import ConeEdgeRecord from './ConeEdgeRecord.ts';
import { hydrateConeState } from './ConeStateHydration.ts';
import type ConeFootprint from './ConeFootprint.ts';
import ConeNodeRecord from './ConeNodeRecord.ts';
import type ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import { requireAdmittedEvent } from './ConeRecordValidation.ts';

/**
 * A `WarpState` holding only the records a patch's footprint names.
 *
 * The workspace does not reimplement any join rule: it hydrates the reducer's
 * own state shape from records, applies the patch through `applyFast` (the
 * same op classes and normalizer a full reduction uses), and reads the
 * changed records back out. Tombstones are global inside the workspace and
 * per element in records; a fold refuses any dot claim that would make those
 * disagree before it builds a workspace (see `ConeDotLedger`).
 */
export default class ConeWorkspace {
  readonly #footprint: ConeFootprint;
  readonly #nodes: ReadonlyMap<string, ConeNodeRecord>;
  readonly #edges: ReadonlyMap<string, ConeEdgeRecord>;
  readonly #state: WarpState;

  private constructor(footprint: ConeFootprint, snapshot: ConeRecordSnapshot) {
    this.#footprint = footprint;
    this.#nodes = new Map([...footprint.nodes].map((nodeId) => [nodeId, snapshot.node(nodeId)]));
    this.#edges = new Map([...footprint.edges].map((edgeKey) => [edgeKey, snapshot.edge(edgeKey)]));
    this.#state = hydrateConeState([...this.#nodes.values()], [...this.#edges.values()]);
  }

  /** A workspace over the footprint's records as `snapshot` holds them. */
  static hydrate(snapshot: ConeRecordSnapshot, footprint: ConeFootprint): ConeWorkspace {
    return new ConeWorkspace(footprint, snapshot);
  }

  /** Applies the patch through the reducer. */
  apply(entry: PatchEntry): void {
    applyFast(this.#state, entry.patch, entry.sha);
  }

  /** The footprint's node records as the reducer left them. */
  nodeRecords(): readonly ConeNodeRecord[] {
    const props = groupedProps(nodeOwnedProps(this.#state));
    return [...this.#nodes.values()].map((previous) => new ConeNodeRecord({
      ...previous.fields(),
      addDots: entryDots(this.#state.nodeAlive, previous.nodeId),
      tombstones: union(previous.tombstones, this.#footprint.nodeTombstones(previous.nodeId)),
      birth: requireAdmittedEvent(this.#state.nodeBirthEvent.get(previous.nodeId), 'node birth'),
      clear: requireAdmittedEvent(this.#state.nodeClearEvent.get(previous.nodeId), 'node clear'),
      props: props.get(previous.nodeId) ?? new Map(),
    }));
  }

  /** The footprint's edge records as the reducer left them. */
  edgeRecords(): readonly ConeEdgeRecord[] {
    const props = groupedProps(edgeOwnedProps(this.#state));
    return [...this.#edges.values()].map((previous) => new ConeEdgeRecord({
      edgeKey: previous.edgeKey,
      addDots: entryDots(this.#state.edgeAlive, previous.edgeKey),
      tombstones: union(previous.tombstones, this.#footprint.edgeTombstones(previous.edgeKey)),
      birth: requireAdmittedEvent(this.#state.edgeBirthEvent.get(previous.edgeKey), 'edge birth'),
      remove: requireAdmittedEvent(this.#state.edgeRemoveEvent.get(previous.edgeKey), 'edge remove'),
      props: props.get(previous.edgeKey) ?? new Map(),
      concurrency: previous.concurrency,
    }));
  }
}

type OwnedRegister = { readonly owner: string; readonly key: string; readonly register: LWWRegister<PropValue> };

function* nodeOwnedProps(state: WarpState): Generator<OwnedRegister> {
  for (const entry of state.nodeProperties()) {
    yield { owner: entry.nodeId, key: entry.key, register: entry.register };
  }
}

function* edgeOwnedProps(state: WarpState): Generator<OwnedRegister> {
  for (const entry of state.edgeProperties()) {
    yield { owner: encodeEdgeKey(entry.from, entry.to, entry.label), key: entry.key, register: entry.register };
  }
}

function groupedProps(entries: Iterable<OwnedRegister>): Map<string, Map<string, LWWRegister<PropValue>>> {
  const grouped = new Map<string, Map<string, LWWRegister<PropValue>>>();
  for (const entry of entries) {
    const props = grouped.get(entry.owner) ?? new Map<string, LWWRegister<PropValue>>();
    props.set(entry.key, entry.register);
    grouped.set(entry.owner, props);
  }
  return grouped;
}

function entryDots(set: ORSet, element: string): ReadonlySet<string> {
  return new Set(set.entries.get(element) ?? []);
}

function union(left: ReadonlySet<string>, right: ReadonlySet<string>): ReadonlySet<string> {
  return new Set([...left, ...right]);
}
