import {
  BundleHandle as GitCasBundleHandle,
  type BundleCapability,
  type BundleMemberInput,
  type CacheSet,
  type RetentionWitness,
} from '@git-stunts/git-cas';
import type MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../ports/MaterializationWorkspacePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';

const WORKSPACE_TTL_MS = 2 * 60 * 60 * 1000;
const WORKSPACE_RENEWAL_MS = WORKSPACE_TTL_MS / 2;

type WorkspaceCache = Pick<CacheSet, 'put' | 'remove'>;
type WorkspaceTarget = Parameters<WorkspaceCache['put']>[1];
type ActiveLeaseTarget = Readonly<{
  input: WorkspaceTarget;
  token: string;
}>;

export type MaterializationWorkspaceLease = Readonly<{
  cancel(): void;
}>;

export type MaterializationWorkspaceLeaseScheduler = Readonly<{
  schedule(
    task: () => Promise<void>,
    delayMs: number,
  ): MaterializationWorkspaceLease;
}>;

export type GitCasMaterializationWorkspaceOptions = Readonly<{
  bundles: Pick<BundleCapability, 'putOrdered'>;
  cache: WorkspaceCache;
  key: string;
  clock?: { readonly now: () => Date };
  leaseTtlMs?: number;
  leaseRenewalMs?: number;
  leaseScheduler?: MaterializationWorkspaceLeaseScheduler;
  promote: (request: PromoteMaterializationRequest) => Promise<MaterializationHandle>;
}>;

const SYSTEM_LEASE_SCHEDULER: MaterializationWorkspaceLeaseScheduler = Object.freeze({
  schedule(task: () => Promise<void>, delayMs: number): MaterializationWorkspaceLease {
    const timer = setTimeout(() => {
      void task().catch(() => undefined);
    }, delayMs);
    timer.unref();
    return Object.freeze({ cancel: () => clearTimeout(timer) });
  },
});

/** CacheSet-backed reachability for one in-progress materialization. */
export default class GitCasMaterializationWorkspace extends MaterializationWorkspacePort {
  readonly #bundles: Pick<BundleCapability, 'putOrdered'>;
  readonly #cache: WorkspaceCache;
  readonly #clock: { readonly now: () => Date };
  readonly #key: string;
  readonly #leaseRenewalMs: number;
  readonly #leaseScheduler: MaterializationWorkspaceLeaseScheduler;
  readonly #leaseTtlMs: number;
  readonly #promoteMaterialization: (
    request: PromoteMaterializationRequest,
  ) => Promise<MaterializationHandle>;
  #installationAttempted = false;
  #leaseTarget: ActiveLeaseTarget | null = null;
  #leaseFailure: WarpError | null = null;
  #leaseTimer: MaterializationWorkspaceLease | null = null;
  #promoting = false;
  #promotionDone: Promise<void> | null = null;
  #releasePending = false;
  #releaseRequested = false;
  #released = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: GitCasMaterializationWorkspaceOptions) {
    super();
    requireWorkspaceOptions(options);
    this.#bundles = options.bundles;
    this.#cache = options.cache;
    this.#key = requireNonEmpty(options.key, 'key');
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#leaseTtlMs = options.leaseTtlMs ?? WORKSPACE_TTL_MS;
    this.#leaseRenewalMs = options.leaseRenewalMs ?? WORKSPACE_RENEWAL_MS;
    this.#leaseScheduler = options.leaseScheduler ?? SYSTEM_LEASE_SCHEDULER;
    this.#promoteMaterialization = options.promote;
  }

  override checkpoint(
    roots: MaterializationWorkspaceRoots,
  ): Promise<StorageRetentionWitness | null> {
    if (this.#releasePending || this.#releaseRequested || this.#promoting) {
      return Promise.reject(workspaceError('cannot checkpoint a releasing workspace'));
    }
    return this.#serialize(async () => await this.#checkpoint(roots));
  }

  override async release(): Promise<void> {
    this.#releasePending = true;
    await this.#promotionDone;
    this.#releaseRequested = true;
    this.#cancelLeaseTimer();
    await this.#serialize(async () => await this.#release());
  }

  override promote(
    request: PromoteMaterializationRequest,
  ): Promise<MaterializationHandle> {
    if (this.#releasePending || this.#releaseRequested || this.#promoting) {
      return Promise.reject(workspaceError('cannot promote a releasing workspace'));
    }
    this.#promoting = true;
    const operation = this.#serialize(() => this.#assertLeaseHealthy())
      .then(async () => await this.#promoteMaterialization(request))
      .then(async (materialization) => await this.#finishPromotion(materialization));
    const done = operation.then(
      () => undefined,
      () => undefined,
    );
    this.#promotionDone = done;
    return operation.finally(() => {
      this.#promoting = false;
      if (this.#promotionDone === done) {
        this.#promotionDone = null;
      }
    });
  }

  async #checkpoint(
    roots: MaterializationWorkspaceRoots,
  ): Promise<StorageRetentionWitness | null> {
    this.#assertLeaseHealthy();
    const members = workspaceMembers(roots);
    if (members.length === 0) {
      return null;
    }
    const bundle = await this.#bundles.putOrdered({ members });
    const targetToken = bundle.handle.toString();
    const witness = await this.#retain(bundle.handle, targetToken);
    const target = Object.freeze({ input: bundle.handle, token: targetToken });
    this.#leaseTarget = target;
    this.#scheduleLeaseRenewal(target);
    return adaptGitCasRetentionWitness(witness.toJSON());
  }

  async #retain(
    target: WorkspaceTarget,
    expectedHandle: string,
  ): Promise<RetentionWitness> {
    this.#installationAttempted = true;
    const retained = await this.#cache.put(this.#key, target, {
      retention: 'pinned',
      expiresAt: this.#expiresAt(),
    });
    return requireAcceptedCheckpoint(retained, expectedHandle);
  }

  async #finishPromotion(
    materialization: MaterializationHandle,
  ): Promise<MaterializationHandle> {
    return await this.#serialize(() => {
      this.#leaseFailure = null;
      this.#cancelLeaseTimer();
      return materialization;
    });
  }

  async #release(): Promise<void> {
    if (this.#released) {
      return;
    }
    if (this.#installationAttempted) {
      await this.#cache.remove(this.#key);
    }
    this.#released = true;
  }

  #expiresAt(): string {
    const now = this.#clock.now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw workspaceError('clock returned an invalid Date');
    }
    return new Date(now.getTime() + this.#leaseTtlMs).toISOString();
  }

  #scheduleLeaseRenewal(target: ActiveLeaseTarget): void {
    this.#cancelLeaseTimer();
    if (!this.#leaseIsActive()) {
      return;
    }
    this.#leaseTimer = this.#leaseScheduler.schedule(
      async () => await this.#renewLease(target),
      this.#leaseRenewalMs,
    );
  }

  async #renewLease(target: ActiveLeaseTarget): Promise<void> {
    this.#leaseTimer = null;
    await this.#serialize(async () => {
      if (!this.#leaseIsActive()) {
        return;
      }
      if (this.#leaseTarget !== target) {
        return;
      }
      try {
        await this.#retain(target.input, target.token);
        this.#scheduleLeaseRenewal(target);
      } catch (raw) {
        this.#leaseFailure = workspaceError(`lease renewal failed: ${errorMessage(raw)}`);
        this.#cancelLeaseTimer();
      }
    });
  }

  #cancelLeaseTimer(): void {
    this.#leaseTimer?.cancel();
    this.#leaseTimer = null;
  }

  #leaseIsActive(): boolean {
    return !this.#releaseRequested && !this.#released;
  }

  #assertLeaseHealthy(): void {
    if (this.#leaseFailure !== null) {
      throw this.#leaseFailure;
    }
  }

  #serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function workspaceMembers(
  roots: MaterializationWorkspaceRoots,
): Array<[string, BundleMemberInput]> {
  requireRoots(roots);
  const members: Array<[string, BundleMemberInput]> = [];
  if (roots.edgeAliveRoot !== null) {
    members.push(['roots/edge-alive', parseRoot(roots.edgeAliveRoot)]);
  }
  if (roots.nodeAliveRoot !== null) {
    members.push(['roots/node-alive', parseRoot(roots.nodeAliveRoot)]);
  }
  if (roots.propertiesRoot !== undefined && roots.propertiesRoot !== null) {
    members.push(['roots/properties', parseRoot(roots.propertiesRoot)]);
  }
  return members;
}

function parseRoot(token: string): string {
  try {
    return GitCasBundleHandle.parse(token).toString();
  } catch (raw) {
    throw workspaceError(`root is not a bundle handle: ${errorMessage(raw)}`);
  }
}

function requireRoots(value: MaterializationWorkspaceRoots): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError('checkpoint roots must be an object');
  }
}

function requireWorkspaceOptions(options: GitCasMaterializationWorkspaceOptions): void {
  requireOptionsObject(options);
  requireBundles(options.bundles);
  requireCache(options.cache);
  requireClock(options.clock);
  requireLeaseTiming(options.leaseTtlMs, options.leaseRenewalMs);
  requireLeaseScheduler(options.leaseScheduler);
  requirePromote(options.promote);
}

function requireAcceptedCheckpoint(
  retained: Awaited<ReturnType<WorkspaceCache['put']>>,
  expectedHandle: string,
): RetentionWitness {
  if (!retained.accepted || retained.hit === null || retained.witness === null) {
    throw workspaceError('git-cas did not retain the workspace checkpoint');
  }
  if (retained.hit.handle.toString() !== expectedHandle) {
    throw workspaceError('git-cas retained an unexpected workspace handle');
  }
  return retained.witness;
}

function requireOptionsObject(options: GitCasMaterializationWorkspaceOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw workspaceError('options must be an object');
  }
}

function requireBundles(bundles: Pick<BundleCapability, 'putOrdered'>): void {
  if (typeof bundles?.putOrdered !== 'function') {
    throw workspaceError('bundles dependency is required');
  }
}

function requireCache(cache: WorkspaceCache): void {
  if (typeof cache?.put !== 'function' || typeof cache?.remove !== 'function') {
    throw workspaceError('cache dependency is required');
  }
}

function requireClock(clock: { readonly now: () => Date } | undefined): void {
  if (clock !== undefined && typeof clock.now !== 'function') {
    throw workspaceError('clock must provide now()');
  }
}

function requireLeaseTiming(ttlMs: number | undefined, renewalMs: number | undefined): void {
  const ttl = ttlMs ?? WORKSPACE_TTL_MS;
  const renewal = renewalMs ?? WORKSPACE_RENEWAL_MS;
  requirePositiveLeaseTtl(ttl);
  requireLeaseRenewalBelowTtl(renewal, ttl);
}

function requirePositiveLeaseTtl(ttl: number): void {
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw workspaceError('leaseTtlMs must be a positive safe integer');
  }
}

function requireLeaseRenewalBelowTtl(renewal: number, ttl: number): void {
  if (!Number.isSafeInteger(renewal) || renewal <= 0 || renewal >= ttl) {
    throw workspaceError('leaseRenewalMs must be a positive safe integer below leaseTtlMs');
  }
}

function requireLeaseScheduler(
  scheduler: MaterializationWorkspaceLeaseScheduler | undefined,
): void {
  if (scheduler !== undefined && typeof scheduler.schedule !== 'function') {
    throw workspaceError('leaseScheduler must provide schedule()');
  }
}

function requirePromote(
  promote: ((request: PromoteMaterializationRequest) => Promise<MaterializationHandle>) | undefined,
): void {
  if (typeof promote !== 'function') {
    throw workspaceError('promote dependency is required');
  }
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw workspaceError(`${field} must be a non-empty string`);
  }
  return value;
}

function errorMessage(raw: unknown): string {
  return raw instanceof Error ? raw.message : String(raw);
}

function workspaceError(message: string): WarpError {
  return new WarpError(`Materialization workspace ${message}`, 'E_MATERIALIZATION_STORAGE');
}
