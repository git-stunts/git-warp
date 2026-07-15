import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { compareEventIds } from '../../utils/EventId.ts';
import {
  CheckpointContentAnchorFact,
  CheckpointEdgeFact,
  CheckpointNodeLivenessFact,
  CheckpointNodePropertyFact,
  type CheckpointBasisFact,
} from './CheckpointBasisFact.ts';

export type CheckpointEdgeEndpointResolution = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
};

export type CheckpointEdgeIdentity = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export type CheckpointNodePropertyIdentity = {
  readonly nodeId: string;
  readonly key: string;
};

export type CheckpointNodePropertyResolution = {
  readonly found: boolean;
  readonly value: PropValue | null;
};

export type CheckpointFactResolverFields = {
  readonly pool: WarpMemoryPool;
};

/** Targeted resolver over checkpoint patch facts without full fact residency. */
export default class CheckpointFactResolver {
  private readonly _pool: WarpMemoryPool;

  constructor(fields: CheckpointFactResolverFields) {
    const validFields = requireResolverFields(fields);
    this._pool = requireWarpMemoryPool(validFields.pool);
    Object.freeze(this);
  }

  async resolveNodeLiveness(
    facts: AsyncIterable<CheckpointBasisFact>,
    nodeId: string,
  ): Promise<boolean | null> {
    let latest: CheckpointNodeLivenessFact | null = null;
    for await (const fact of facts) {
      const lease = this._pool.acquire({ scope: 'checkpoint.fact.node-liveness', amount: 1 });
      try {
        latest = newerMatch(matchingNodeLiveness(fact, nodeId), latest);
      } finally {
        lease.release();
      }
    }
    return latest?.alive ?? null;
  }

  async resolveEdgeEndpoints(
    facts: AsyncIterable<CheckpointBasisFact>,
    edge: CheckpointEdgeIdentity,
  ): Promise<CheckpointEdgeEndpointResolution | null> {
    let latest: CheckpointEdgeFact | null = null;
    for await (const fact of facts) {
      const lease = this._pool.acquire({ scope: 'checkpoint.fact.edge-endpoints', amount: 1 });
      try {
        latest = newerMatch(matchingEdge(fact, edge), latest);
      } finally {
        lease.release();
      }
    }
    return latest === null ? null : edgeResolution(latest);
  }

  async resolveNodeProperty(
    facts: AsyncIterable<CheckpointBasisFact>,
    property: CheckpointNodePropertyIdentity,
  ): Promise<CheckpointNodePropertyResolution> {
    let latest: CheckpointNodePropertyFact | null = null;
    for await (const fact of facts) {
      const lease = this._pool.acquire({ scope: 'checkpoint.fact.node-property', amount: 1 });
      try {
        latest = newerMatch(matchingNodeProperty(fact, property), latest);
      } finally {
        lease.release();
      }
    }
    return latest === null ? Object.freeze({ found: false, value: null }) : Object.freeze({ found: true, value: latest.value });
  }

  async resolveContentOid(
    facts: AsyncIterable<CheckpointBasisFact>,
    owner: string,
  ): Promise<string | null> {
    let latest: CheckpointContentAnchorFact | null = null;
    for await (const fact of facts) {
      const lease = this._pool.acquire({ scope: 'checkpoint.fact.content-anchor', amount: 1 });
      try {
        latest = newerMatch(matchingContentAnchor(fact, owner), latest);
      } finally {
        lease.release();
      }
    }
    return latest?.contentHandle ?? null;
  }
}

function requireResolverFields(
  fields: CheckpointFactResolverFields | null | undefined,
): CheckpointFactResolverFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('CheckpointFactResolver requires object fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'fields' },
  });
}

function requireWarpMemoryPool(value: WarpMemoryPool): WarpMemoryPool {
  if (value instanceof WarpMemoryPool) {
    return value;
  }
  throw new MemoryBudgetError('CheckpointFactResolver requires a WarpMemoryPool', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'pool' },
  });
}

type ResolvableFact =
  | CheckpointNodeLivenessFact
  | CheckpointEdgeFact
  | CheckpointNodePropertyFact
  | CheckpointContentAnchorFact;

function newerMatch<T extends ResolvableFact>(candidate: T | null, current: T | null): T | null {
  if (candidate === null) {
    return current;
  }
  if (current === null || compareEventIds(candidate.eventId, current.eventId) > 0) {
    return candidate;
  }
  return current;
}

function matchingNodeLiveness(fact: CheckpointBasisFact, nodeId: string): CheckpointNodeLivenessFact | null {
  if (fact instanceof CheckpointNodeLivenessFact && fact.nodeId === nodeId) {
    return fact;
  }
  return null;
}

function matchingEdge(fact: CheckpointBasisFact, edge: CheckpointEdgeIdentity): CheckpointEdgeFact | null {
  if (fact instanceof CheckpointEdgeFact && fact.from === edge.from && fact.to === edge.to && fact.label === edge.label) {
    return fact;
  }
  return null;
}

function matchingNodeProperty(
  fact: CheckpointBasisFact,
  property: CheckpointNodePropertyIdentity,
): CheckpointNodePropertyFact | null {
  if (fact instanceof CheckpointNodePropertyFact && fact.nodeId === property.nodeId && fact.key === property.key) {
    return fact;
  }
  return null;
}

function matchingContentAnchor(fact: CheckpointBasisFact, owner: string): CheckpointContentAnchorFact | null {
  if (fact instanceof CheckpointContentAnchorFact && fact.owner === owner) {
    return fact;
  }
  return null;
}

function edgeResolution(fact: CheckpointEdgeFact): CheckpointEdgeEndpointResolution {
  return Object.freeze({
    from: fact.from,
    to: fact.to,
    label: fact.label,
    alive: fact.alive,
  });
}
