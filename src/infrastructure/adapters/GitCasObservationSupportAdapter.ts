import type { AssetCapability, AssetHandle, PublicationCapability } from '@git-stunts/git-cas';
import ObservationCustodyRoots, { type ObservationSupportEntry } from '../../domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationDependencyClaim from '../../domain/services/custody/ObservationDependencyClaim.ts';
import type ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault, { type ObservationSupportFaultReason } from '../../domain/services/custody/ObservationSupportFault.ts';
import type ObservationSupportLimits from '../../domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused, { type ObservationSupportRefusalReason } from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import ObservationSupportRetained from '../../domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../domain/services/custody/ObservationSupportSummary.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { buildObservationConstructionRef } from '../../domain/utils/ObservationRefLayout.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import ObservationSupportPort, { type ObservationSupportOutcome } from '../../ports/ObservationSupportPort.ts';
import GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import ObservationBasisFrontier, { type ObservationBasisHistory, type ObservationBasisProblem } from './ObservationBasisFrontier.ts';
import ObservationCarrierChain, { type ObservationChainPosition } from './ObservationCarrierChain.ts';
import ObservationCarrierMessage from './ObservationCarrierMessage.ts';
import ObservationDependencyPages, { type ObservationPageSet } from './ObservationDependencyPages.ts';
import ObservationWorkMeter from './ObservationWorkMeter.ts';

/** New writer heads per carrier: one of a commit's 64 parents names the previous carrier. */
export const OBSERVATION_CARRIER_BATCH = 63;

export type ObservationSupportHistory = ObservationBasisHistory & {
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
};

/** Progress over a basis's writer heads against any chain this attempt already published. */
type HeadProgress = {
  readonly position: ObservationChainPosition;
  readonly consumed: number;
  readonly digest: ObservationDigest;
};
type CarrierTarget = { readonly request: ObservationSupportRequest; readonly root: AssetHandle; readonly meter: ObservationWorkMeter };
type RetainedEdges = {
  readonly basis: string;
  readonly roots: ObservationCustodyRoots;
  readonly summary: ObservationSupportSummary;
};

/**
 * Builds the Git edges of an observation (#1067).
 *
 * Writer heads come from the frontier stored in the original basis, never from
 * the producer, so an incomplete list cannot pass as complete. They are retained
 * by a chain of git-cas publications, each adding at most 63 heads as parents
 * plus the previous carrier; the tip becomes a custody parent. Each carrier states
 * its attempt, position and rolling digest, so recovery can prove a construction
 * ref retains the claimed prefix rather than trusting that its head is readable.
 */
export default class GitCasObservationSupportAdapter extends ObservationSupportPort {
  readonly #publications: Pick<PublicationCapability, 'commit'>;
  readonly #assets: Pick<AssetCapability, 'put'>;
  readonly #history: ObservationSupportHistory;
  readonly #graphName: string;
  readonly #limits: ObservationSupportLimits;
  readonly #chain: ObservationCarrierChain;
  readonly #pages: ObservationDependencyPages;
  readonly #basis: ObservationBasisFrontier;

  constructor(options: {
    readonly publications: Pick<PublicationCapability, 'commit'>;
    readonly assets: Pick<AssetCapability, 'put'>;
    readonly history: ObservationSupportHistory;
    readonly crypto: CryptoPort;
    readonly codec: CodecPort;
    readonly graphName: string;
    readonly limits: ObservationSupportLimits;
  }) {
    super();
    this.#publications = options.publications;
    this.#assets = options.assets;
    this.#history = options.history;
    this.#graphName = options.graphName;
    this.#limits = options.limits;
    this.#chain = new ObservationCarrierChain(options.history, options.crypto);
    this.#pages = new ObservationDependencyPages({
      history: options.history,
      trees: new GitFastImportTreeWriter({ plumbing: options.history.plumbing }),
      crypto: options.crypto,
      limits: options.limits,
    });
    this.#basis = new ObservationBasisFrontier({ history: options.history, codec: options.codec, limits: options.limits });
  }

  override async retain(request: ObservationSupportRequest): Promise<ObservationSupportOutcome> {
    const meter = new ObservationWorkMeter(this.#limits.work);
    const heads = await this.#basis.heads(request.basis, meter);
    if (typeof heads === 'string') {
      return new ObservationSupportRefused(basisRefusal(heads));
    }
    const pages = await this.#pages.write(request, meter);
    return isStopped(pages) ? pages : await this.#retainedWith({ request, heads, pages, meter });
  }

  override async release(identity: ObservationCustodyIdentity): Promise<void> {
    const ref = this.#constructionRef(identity);
    if (await this.#history.readRef(ref) !== null) {
      await this.#history.deleteRef(ref);
    }
  }

  override async verify(identity: ObservationCustodyIdentity, retained: RetainedEdges): Promise<ObservationSupportFault | null> {
    const meter = new ObservationWorkMeter(this.#limits.work);
    const heads = await this.#basis.heads(retained.basis, meter);
    if (typeof heads === 'string') {
      return new ObservationSupportFault(basisFault(heads));
    }
    if (!isRetainedBy(retained.roots, [retained.basis, ...retained.summary.pages])) {
      return new ObservationSupportFault('dependency-mismatch');
    }
    const { summary } = retained;
    const fault = await this.#pages.check(summary.pages, new ObservationDependencyClaim(summary.dependencies, summary.dependency), meter);
    return fault === null ? await this.#verifyHistory({ identity, retained, heads, meter }) : new ObservationSupportFault(fault);
  }

  override async verifyPublication(commit: string): Promise<ObservationSupportFault | null> {
    return await this.#history.nodeExists(commit) ? null : new ObservationSupportFault('publication-missing');
  }

  #constructionRef(identity: ObservationCustodyIdentity): string {
    return buildObservationConstructionRef(this.#graphName, identity.attemptId.value);
  }

  async #retainedWith(build: {
    readonly request: ObservationSupportRequest;
    readonly heads: readonly string[];
    readonly pages: ObservationPageSet;
    readonly meter: ObservationWorkMeter;
  }): Promise<ObservationSupportOutcome> {
    const chain = await this.#retainHistory(build);
    return isStopped(chain) ? chain : retainedSupport(build.request.basis, build.pages, chain);
  }

  async #retainHistory(build: {
    readonly request: ObservationSupportRequest;
    readonly heads: readonly string[];
    readonly meter: ObservationWorkMeter;
  }): Promise<ObservationChainPosition | ObservationSupportRefused | ObservationSupportCancelled> {
    const { request, heads, meter } = build;
    const resumed = await this.#resumedChain(request.identity, meter);
    if (resumed instanceof ObservationSupportRefused) {
      return resumed;
    }
    const target = { request, meter, root: await this.#carrierRoot(request.identity) };
    return await this.#consumeHeads(target, heads, { position: resumed, consumed: 0, digest: await this.#chain.seed() });
  }

  async #consumeHeads(
    target: CarrierTarget,
    heads: readonly string[],
    start: HeadProgress,
  ): Promise<ObservationChainPosition | ObservationSupportRefused | ObservationSupportCancelled> {
    let progress = start;
    for (let index = 0; index < heads.length; index += OBSERVATION_CARRIER_BATCH) {
      if (target.request.isCancelled()) {
        return new ObservationSupportCancelled();
      }
      const advanced = await this.#advance(target, progress, heads.slice(index, index + OBSERVATION_CARRIER_BATCH));
      if (advanced instanceof ObservationSupportRefused) {
        return advanced;
      }
      progress = advanced;
    }
    return isComplete(progress) ? progress.position : new ObservationSupportRefused('construction-mismatch');
  }

  /** Publishes one batch unless a verified carrier already covers it; covered batches re-derive the digest. */
  async #advance(
    target: CarrierTarget,
    progress: HeadProgress,
    batch: readonly string[],
  ): Promise<HeadProgress | ObservationSupportRefused> {
    const consumed = progress.consumed + batch.length;
    const digest = await this.#chain.extend(progress.digest, batch);
    const next = { position: progress.position, consumed, digest };
    if (consumed <= progress.position.writers) {
      return next;
    }
    if (progress.consumed !== progress.position.writers || !progress.digest.equals(progress.position.history)) {
      return new ObservationSupportRefused('construction-mismatch');
    }
    const position = await this.#publishCarrier(target, next, batch);
    return position instanceof ObservationSupportRefused ? position : { position, consumed, digest };
  }

  async #publishCarrier(
    target: CarrierTarget,
    progress: HeadProgress,
    batch: readonly string[],
  ): Promise<ObservationChainPosition | ObservationSupportRefused> {
    if (!target.meter.spend(batch.length)) {
      return new ObservationSupportRefused('work-limit');
    }
    return await this.#headsExist(batch)
      ? await this.#commitCarrier(target, progress, batch)
      : new ObservationSupportRefused('writer-head-unavailable');
  }

  async #headsExist(batch: readonly string[]): Promise<boolean> {
    for (const head of batch) {
      if (!await this.#history.nodeExists(head)) {
        return false;
      }
    }
    return true;
  }

  async #commitCarrier(
    target: CarrierTarget,
    progress: HeadProgress,
    batch: readonly string[],
  ): Promise<ObservationChainPosition | ObservationSupportRefused> {
    const { tip, sequence } = progress.position;
    const { identity } = target.request;
    const message = new ObservationCarrierMessage({
      binding: identity.binding, sequence: sequence + 1, writers: progress.consumed, history: progress.digest,
    });
    try {
      const published = await this.#publications.commit({
        root: target.root,
        commit: { message: message.toString(), parents: tip === null ? [...batch] : [tip, ...batch] },
        ref: { name: this.#constructionRef(identity), expected: tip },
      });
      return { tip: published.commitId, sequence: sequence + 1, writers: progress.consumed, history: progress.digest };
    } catch (cause) {
      if (isPublicationConflict(cause)) {
        return new ObservationSupportRefused('construction-contended');
      }
      throw cause;
    }
  }

  /** The construction chain this attempt already published, verified link by link. */
  async #resumedChain(identity: ObservationCustodyIdentity, meter: ObservationWorkMeter): Promise<ObservationChainPosition | ObservationSupportRefused> {
    const tip = await this.#history.readRef(this.#constructionRef(identity));
    if (tip === null) {
      return await this.#chain.empty();
    }
    const walked = await this.#chain.walk(identity, tip, meter);
    return walked instanceof ObservationSupportFault ? new ObservationSupportRefused(resumeRefusal(walked)) : walked;
  }

  /** The chain must retain exactly the heads the basis's own frontier names, in order. */
  async #verifyHistory(check: {
    readonly identity: ObservationCustodyIdentity;
    readonly retained: RetainedEdges;
    readonly heads: readonly string[];
    readonly meter: ObservationWorkMeter;
  }): Promise<ObservationSupportFault | null> {
    const { retained, heads } = check;
    const expected = await this.#digestOf(heads);
    if (heads.length !== retained.summary.writers || !expected.equals(retained.summary.history)) {
      return new ObservationSupportFault('history-mismatch');
    }
    const [tip] = retained.roots.parents;
    if (tip === undefined) {
      return heads.length === 0 ? null : new ObservationSupportFault('history-missing');
    }
    return chainFault(await this.#chain.walk(check.identity, tip, check.meter), heads.length, expected);
  }

  async #digestOf(heads: readonly string[]): Promise<ObservationDigest> {
    let digest = await this.#chain.seed();
    for (let index = 0; index < heads.length; index += OBSERVATION_CARRIER_BATCH) {
      digest = await this.#chain.extend(digest, heads.slice(index, index + OBSERVATION_CARRIER_BATCH));
    }
    return digest;
  }

  /** A small asset naming the attempt: a publication needs a root, and edges live in its parents. */
  async #carrierRoot(identity: ObservationCustodyIdentity): Promise<AssetHandle> {
    const staged = await this.#assets.put({
      source: singleChunk(textEncode(identity.binding.hex)),
      slug: 'observation-carrier',
      filename: 'binding.txt',
    });
    return staged.handle;
  }
}

function isComplete(progress: HeadProgress): boolean {
  return progress.position.writers === progress.consumed && progress.digest.equals(progress.position.history);
}

function chainFault(
  walked: ObservationChainPosition | ObservationSupportFault,
  writers: number,
  history: ObservationDigest,
): ObservationSupportFault | null {
  if (walked instanceof ObservationSupportFault) {
    return walked;
  }
  return walked.writers === writers && walked.history.equals(history) ? null : new ObservationSupportFault('history-mismatch');
}

function isStopped<T>(outcome: T | ObservationSupportRefused | ObservationSupportCancelled): outcome is ObservationSupportRefused | ObservationSupportCancelled {
  return outcome instanceof ObservationSupportRefused || outcome instanceof ObservationSupportCancelled;
}

function basisRefusal(problem: ObservationBasisProblem): ObservationSupportRefusalReason {
  const reasons: Record<ObservationBasisProblem, ObservationSupportRefusalReason> = {
    missing: 'basis-unavailable',
    corrupt: 'basis-corrupt',
    'frontier-limit': 'frontier-limit',
    'writer-limit': 'writer-limit',
    'work-limit': 'work-limit',
  };
  return reasons[problem];
}

function basisFault(problem: ObservationBasisProblem): ObservationSupportFaultReason {
  if (problem === 'missing') {
    return 'basis-missing';
  }
  return problem === 'work-limit' ? 'work-limit' : 'basis-corrupt';
}

function resumeRefusal(fault: ObservationSupportFault): ObservationSupportRefusalReason {
  return fault.reason === 'work-limit' ? 'work-limit' : 'construction-mismatch';
}

/**
 * Custody supports must be unique, while identical dependency pages share one
 * tree: the summary keeps every page in order, and the roots keep each once.
 */
function retainedSupport(basis: string, dependencies: ObservationPageSet, chain: ObservationChainPosition): ObservationSupportRetained {
  const trees = [...new Set([basis, ...dependencies.pages])];
  const supports = trees.map((oid): ObservationSupportEntry => ({ type: 'tree', oid }));
  return new ObservationSupportRetained(
    new ObservationCustodyRoots(supports, chain.tip === null ? [] : [chain.tip]),
    new ObservationSupportSummary({
      writers: chain.writers,
      history: chain.history,
      dependencies: dependencies.claim.count,
      dependency: dependencies.claim.digest,
      pages: dependencies.pages,
    }),
  );
}

/** True when custody supports hold every required tree: support order is not preserved. */
function isRetainedBy(roots: ObservationCustodyRoots, required: readonly string[]): boolean {
  const supports = new Set(roots.supports.map((entry) => entry.oid));
  return required.every((oid) => supports.has(oid));
}

function isPublicationConflict(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'PUBLICATION_CONFLICT';
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield await Promise.resolve(bytes);
}
