import { describe, expect, it, vi } from 'vitest';

import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import type { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import type { QueryContentHost } from '../../../../../src/domain/services/controllers/ReadGraphHost.ts';
import {
  getContentMetaImpl,
  getContentHandleImpl,
  getEdgeContentMetaImpl,
  getEdgeContentHandleImpl,
} from '../../../../../src/domain/services/controllers/QueryContent.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';

const PATCH_SHA = 'd'.repeat(40);

type EdgeSpec = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

type NodePropSpec = {
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue;
  readonly eventId: EventId;
};

type EdgePropSpec = EdgeSpec & {
  readonly key: string;
  readonly value: PropValue;
  readonly eventId: EventId;
};

type StateSpec = {
  readonly nodes: readonly string[];
  readonly edges?: readonly EdgeSpec[];
  readonly props?: readonly NodePropSpec[];
  readonly edgeProps?: readonly EdgePropSpec[];
};

describe('QueryContent projection-backed reads', () => {
  it('returns null node content handle and metadata for malformed storage references', async () => {
    const eid = event(5);
    const host = hostWithState(buildState({
      nodes: ['alice'],
      props: [
        { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: '', eventId: eid },
        { nodeId: 'alice', key: CONTENT_MIME_PROPERTY_KEY, value: 'text/plain', eventId: eid },
      ],
    }));

    await expect(getContentHandleImpl(host, 'alice')).resolves.toBeNull();
    await expect(getContentMetaImpl(host, 'alice')).resolves.toBeNull();
  });

  it('returns null edge content handle and metadata for malformed storage references', async () => {
    const eid = event(5);
    const edge = { from: 'alice', to: 'bob', label: 'knows' };
    const host = hostWithState(buildState({
      nodes: ['alice', 'bob'],
      edges: [edge],
      edgeProps: [
        { ...edge, key: CONTENT_PROPERTY_KEY, value: '', eventId: eid },
        { ...edge, key: CONTENT_MIME_PROPERTY_KEY, value: 'image/png', eventId: eid },
      ],
    }));

    await expect(getEdgeContentHandleImpl(host, edge)).resolves.toBeNull();
    await expect(getEdgeContentMetaImpl(host, edge)).resolves.toBeNull();
  });

  it('drops malformed node MIME hints from projected metadata', async () => {
    const eid = event(5);
    const host = hostWithState(buildState({
      nodes: ['alice'],
      props: [
        { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef', eventId: eid },
        { nodeId: 'alice', key: CONTENT_MIME_PROPERTY_KEY, value: '', eventId: eid },
      ],
    }));

    await expect(getContentMetaImpl(host, 'alice')).resolves.toEqual({
      handle: 'deadbeef',
      mime: null,
      size: null,
    });
  });

  it('drops malformed edge MIME hints from projected metadata', async () => {
    const eid = event(5);
    const edge = { from: 'alice', to: 'bob', label: 'knows' };
    const host = hostWithState(buildState({
      nodes: ['alice', 'bob'],
      edges: [edge],
      edgeProps: [
        { ...edge, key: CONTENT_PROPERTY_KEY, value: 'cafebabe', eventId: eid },
        { ...edge, key: CONTENT_MIME_PROPERTY_KEY, value: '', eventId: eid },
      ],
    }));

    await expect(getEdgeContentMetaImpl(host, edge)).resolves.toEqual({
      handle: 'cafebabe',
      mime: null,
      size: null,
    });
  });
});

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', PATCH_SHA, 0);
}

function hostWithState(state: WarpState): QueryContentHost {
  return {
    _autoMaterialize: true,
    _cachedState: state,
    _ensureFreshState: vi.fn(async () => undefined),
    _assetStorage: null,
  };
}

function buildState(spec: StateSpec): WarpState {
  const nodeAlive = orsetWith(spec.nodes);
  const edgeAlive = orsetWith((spec.edges ?? []).map((edge) => encodeEdgeKey(edge.from, edge.to, edge.label)));
  const prop = new Map<string, LWWRegister<PropValue>>();

  for (const nodeProp of spec.props ?? []) {
    prop.set(encodePropKey(nodeProp.nodeId, nodeProp.key), register(nodeProp.value, nodeProp.eventId));
  }
  for (const edgeProp of spec.edgeProps ?? []) {
    prop.set(
      encodeEdgePropKey(edgeProp.from, edgeProp.to, edgeProp.label, edgeProp.key),
      register(edgeProp.value, edgeProp.eventId),
    );
  }

  return new WarpState({
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier: VersionVector.empty(),
  });
}

function register(value: PropValue, eventId: EventId): LWWRegister<PropValue> {
  return { value, eventId };
}

function orsetWith(values: readonly string[]): ORSet {
  const set = ORSet.empty();
  values.forEach((value, index) => {
    set.add(value, Dot.create('writer-a', index + 1));
  });
  return set;
}
