import { vi } from 'vitest';

import type { AdmissionOutcome } from '../../src/domain/api/AdmissionOutcome.ts';
import Lane, { type LaneDescriptor } from '../../src/domain/api/Lane.ts';
import type {
  SettlementPromotion,
  SettlementSourceRuntime,
  SettlementSourceSnapshot,
} from '../../src/domain/api/LaneSettlementRuntime.ts';
import { bindLaneRuntime } from '../../src/domain/api/LaneRuntime.ts';
import { bindSettlementPlan } from '../../src/domain/api/SettlementPlanRuntime.ts';
import SettlementPlan from '../../src/domain/settlement/SettlementPlan.ts';

export type SettlementHarnessOptions = Readonly<{
  readonly digest?: (parts: readonly string[]) => Promise<string>;
  readonly parentName?: string;
  readonly promotion?: SettlementPromotion;
  readonly snapshot?: Partial<SettlementSourceSnapshot>;
}>;

/** Builds the shared lane and settlement-runtime scaffold for coordination tests. */
export function settlementHarness(options: SettlementHarnessOptions = {}) {
  const owner = Object.freeze({});
  let snapshot = freezeSnapshot(options.snapshot);
  const promotion = options.promotion ?? {
    accepted: true,
    evidence: {
      basis: { id: 'admission:promotion' },
      support: [],
    },
    reason: undefined,
  };
  const promote = vi.fn(async () => promotion);
  const digest = vi.fn(
    options.digest ?? (async (parts: readonly string[]) => `admission:${parts.join(':')}`)
  );
  const sourceRuntime: SettlementSourceRuntime = Object.freeze({
    kind: 'source',
    capture: async () => snapshot,
    digest,
    runExclusive: async (operation) =>
      await operation(
        Object.freeze({
          capture: async () => snapshot,
          digest,
          promote,
        })
      ),
  });
  const target = bindTargetLane(owner);
  const source = bindSourceLane({
    owner,
    parentName: options.parentName ?? target.name,
    sourceRuntime,
  });
  return {
    options: Object.freeze({ source, target }),
    owner,
    promote,
    setSnapshot: (change: Partial<SettlementSourceSnapshot>) => {
      snapshot = freezeSnapshot({ ...snapshot, ...change });
    },
    snapshot: () => snapshot,
    source,
    sourceRuntime,
    target,
  };
}

/** Binds a preclassified settlement plan to the shared runtime scaffold. */
export function boundSettlementOutcomeHarness(outcome: AdmissionOutcome) {
  const plan = settlementPlan();
  const harness = settlementHarness({
    digest: async (parts) => (parts[0] === 'law' ? plan.lawDigest : plan.policyDigest),
    snapshot: {
      baseTargetFrontierRef: plan.targetFrontier.id,
      frontierRef: plan.sourceFrontier.id,
      proposalDigest: plan.proposalDigest,
      targetFrontierRef: plan.targetFrontier.id,
    },
  });
  const evidence = Object.freeze({
    basis: plan.targetFrontier,
    support: Object.freeze([plan.sourceFrontier, Object.freeze({ id: plan.proposalDigest })]),
  });
  bindSettlementPlan(plan, {
    evidence,
    outcome,
    owner: harness.owner,
    source: harness.source,
    sourceRuntime: harness.sourceRuntime,
    sourceSnapshot: harness.snapshot(),
    target: harness.target,
  });
  return {
    evidence,
    owner: harness.owner,
    plan,
    promote: harness.promote,
  };
}

function freezeSnapshot(change: Partial<SettlementSourceSnapshot> = {}): SettlementSourceSnapshot {
  return Object.freeze({
    baseTargetFrontierRef: 'admission:target',
    frontierRef: 'admission:source',
    proposalDigest: 'admission:proposal',
    status: 'ready',
    targetFrontierRef: 'admission:target',
    ...change,
  });
}

function bindTargetLane(owner: object): Lane {
  const lane = createLane({ kind: 'worldline', name: 'events' });
  bindLaneRuntime(lane, {
    captureCoordinate: unavailableCoordinate,
    fork: null,
    openStrand: null,
    owner,
    settlement: Object.freeze({ kind: 'target' }),
  });
  return lane;
}

function bindSourceLane(
  options: Readonly<{
    readonly owner: object;
    readonly parentName: string;
    readonly sourceRuntime: SettlementSourceRuntime;
  }>
): Lane {
  const parent = Object.freeze({
    kind: 'worldline' as const,
    name: options.parentName,
  });
  const lane = createLane({
    kind: 'strand',
    name: 'draft',
    parent,
    forkedAt: Object.freeze({ id: 'tick:fork', lane: parent }),
  });
  bindLaneRuntime(lane, {
    captureCoordinate: unavailableCoordinate,
    fork: null,
    openStrand: null,
    owner: options.owner,
    settlement: options.sourceRuntime,
  });
  return lane;
}

function createLane(descriptor: LaneDescriptor): Lane {
  return new Lane({
    descriptor,
    writer: 'agent-1',
    startObserver: async () => {
      throw new Error('not exercised');
    },
    writeIntent: async () => {
      throw new Error('not exercised');
    },
  });
}

function settlementPlan(): SettlementPlan {
  return new SettlementPlan({
    planDigest: 'plan:settlement',
    sourceLaneId: 'lane:strand:draft',
    targetLaneId: 'lane:worldline:events',
    sourceFrontier: Object.freeze({ id: 'frontier:source' }),
    targetFrontier: Object.freeze({ id: 'frontier:target' }),
    proposalDigest: 'proposal:draft',
    lawDigest: 'law:settlement',
    policyDigest: 'policy:settlement',
  });
}

function unavailableCoordinate(): Promise<never> {
  return Promise.reject(new Error('not exercised'));
}
