import Lane from '../domain/api/Lane.ts';
import type SettlementPreview from '../domain/api/SettlementPreview.ts';
import type SettlementReceipt from '../domain/api/SettlementReceipt.ts';
import { LANE_IDENTITY_FAILURE } from '../domain/api/LaneIdentityFailure.ts';
import {
  requireLaneRuntime,
  type LaneRuntime,
} from '../domain/api/LaneRuntime.ts';
import type Warp from '../domain/api/Warp.ts';
import type SettlementPlan from '../domain/settlement/SettlementPlan.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../domain/api/OpenWarpIdentityFailure.ts';
import { assertTimelineNameIdentity, assertWriterIdentity } from '../domain/api/assertIdentity.ts';
import WarpError from '../domain/errors/WarpError.ts';
import { requireNonEmptyString } from '../domain/utils/scalarValidation.ts';
import GitStorage from './GitStorage.ts';
import RuntimeActivity from './RuntimeActivity.ts';
import { createWorldlineLane } from './RuntimeLaneAdapter.ts';
import RuntimeMutationGate from './RuntimeMutationGate.ts';
import { bindRuntimeStorage } from './RuntimeStorageAccess.ts';
import {
  previewRuntimeSettlement,
  settleRuntimePlan,
} from './RuntimeSettlement.ts';
import type { RuntimeSettlementOptions } from './RuntimeSettlementOptions.ts';
import { openWarp } from './openWarp.ts';

export type { RuntimeSettlementOptions } from './RuntimeSettlementOptions.ts';

export type RuntimeOpenOptions = {
  readonly at: string;
  readonly writer: string;
};

export type RuntimeForkOptions = {
  readonly name: string;
};

export type RuntimeStrandOptions = {
  readonly name: string;
};

const FORK_IDENTITY_FAILURE = Object.freeze({
  message: 'Runtime.fork requires a non-empty strand name',
  code: 'E_RUNTIME_FORK_IDENTITY',
});

const STRAND_IDENTITY_FAILURE = Object.freeze({
  message: 'Runtime.strand requires a non-empty strand name',
  code: 'E_RUNTIME_STRAND_IDENTITY',
});

/** Production composition root for one local git-warp runtime. */
export default class Runtime {
  readonly #activity: RuntimeActivity;
  readonly #laneOwner: object;
  readonly #mutations: RuntimeMutationGate;
  readonly #storage: GitStorage;
  readonly #warp: Warp;

  private constructor(warp: Warp, storage: GitStorage) {
    this.#warp = warp;
    this.#storage = storage;
    this.#activity = new RuntimeActivity();
    this.#laneOwner = Object.freeze({});
    this.#mutations = new RuntimeMutationGate();
    bindRuntimeStorage(this, storage);
    Object.freeze(this);
  }

  static async open(options: RuntimeOpenOptions): Promise<Runtime> {
    assertRuntimeOpenOptions(options);
    const storage = await GitStorage.open({ cwd: options.at });
    try {
      const warp = await openWarp({ storage, writer: options.writer });
      return new Runtime(warp, storage);
    } catch (error) {
      try {
        await storage.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          'Runtime failed to open and release local resources',
        );
      }
      throw error;
    }
  }

  get writer(): string {
    return this.#warp.writer;
  }

  async lane(name: string): Promise<Lane> {
    assertTimelineNameIdentity(name, 'lane', LANE_IDENTITY_FAILURE);
    return await this.#activity.run(async () => {
      const timeline = await this.#warp.timeline(name);
      return createWorldlineLane(
        timeline,
        this.#activity,
        { mutations: this.#mutations, owner: this.#laneOwner },
      );
    });
  }

  async fork(source: Lane, options: RuntimeForkOptions): Promise<Lane> {
    assertForkSource(source);
    assertForkOptions(options);
    assertTimelineNameIdentity(options.name, 'fork.name', FORK_IDENTITY_FAILURE);
    const binding = requireOwnedLaneRuntime(source, this.#laneOwner);
    const fork = requireWorldlineFork(source, binding);
    const lease = this.#activity.acquire();
    try {
      return await fork(options.name);
    } finally {
      lease.release();
    }
  }

  async strand(parent: Lane, options: RuntimeStrandOptions): Promise<Lane> {
    assertStrandParent(parent);
    assertStrandOptions(options);
    assertTimelineNameIdentity(
      options.name,
      'strand.name',
      STRAND_IDENTITY_FAILURE,
    );
    const binding = requireOwnedLaneRuntime(parent, this.#laneOwner);
    const openStrand = requireWorldlineStrand(parent, binding);
    const lease = this.#activity.acquire();
    try {
      return await openStrand(options.name);
    } finally {
      lease.release();
    }
  }

  async previewSettlement(
    options: RuntimeSettlementOptions,
  ): Promise<SettlementPreview> {
    return await previewRuntimeSettlement(options, this.#laneOwner);
  }

  async settle(plan: SettlementPlan): Promise<SettlementReceipt> {
    return await settleRuntimePlan(plan, this.#laneOwner);
  }

  /** Releases local resources only. */
  close(): Promise<void> {
    return this.#activity.close(async () => await this.#storage.close());
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

function assertForkSource(source: Lane): void {
  if (!(source instanceof Lane)) {
    throw new WarpError('Runtime.fork requires a Lane', 'E_RUNTIME_FORK_SOURCE');
  }
}

function assertForkOptions(options: RuntimeForkOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new WarpError('Runtime.fork options are required', 'E_RUNTIME_FORK_OPTIONS');
  }
}

function assertStrandParent(parent: Lane): void {
  if (!(parent instanceof Lane)) {
    throw new WarpError(
      'Runtime.strand requires a parent Lane',
      'E_RUNTIME_STRAND_PARENT',
    );
  }
}

function assertStrandOptions(options: RuntimeStrandOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new WarpError(
      'Runtime.strand options are required',
      'E_RUNTIME_STRAND_OPTIONS',
    );
  }
}

function requireOwnedLaneRuntime(source: Lane, owner: object): LaneRuntime {
  const binding = requireLaneRuntime(source);
  if (binding.owner !== owner) {
    throw new WarpError(
      'Runtime.fork requires a Lane owned by this Runtime',
      'E_RUNTIME_FORK_FOREIGN_LANE',
    );
  }
  return binding;
}

function requireWorldlineFork(
  source: Lane,
  binding: LaneRuntime,
): NonNullable<LaneRuntime['fork']> {
  if (source.kind !== 'worldline' || binding.fork === null) {
    throw new WarpError(
      'Runtime.fork supports worldline Lane sources only',
      'E_RUNTIME_FORK_SOURCE_KIND',
      { context: { kind: source.kind } },
    );
  }
  return binding.fork;
}

function requireWorldlineStrand(
  parent: Lane,
  binding: LaneRuntime,
): NonNullable<LaneRuntime['openStrand']> {
  if (parent.kind !== 'worldline' || binding.openStrand === null) {
    throw new WarpError(
      'Runtime.strand requires a worldline parent Lane',
      'E_RUNTIME_STRAND_PARENT_KIND',
      { context: { kind: parent.kind } },
    );
  }
  return binding.openStrand;
}

function assertRuntimeOpenOptions(
  options: RuntimeOpenOptions | null | undefined,
): asserts options is RuntimeOpenOptions {
  if (options === null || options === undefined) {
    throw new WarpError('Runtime.open options are required', 'E_RUNTIME_OPEN_OPTIONS');
  }
  requireNonEmptyString(options.at, 'runtime.at');
  assertWriterIdentity(options.writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
}
