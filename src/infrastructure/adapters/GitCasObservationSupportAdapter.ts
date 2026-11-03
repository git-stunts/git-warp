import type { AssetCapability, AssetHandle, PublicationCapability } from '@git-stunts/git-cas';
import ObservationCustodyRoots, { type ObservationSupportEntry } from '../../domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault from '../../domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportRefused from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import ObservationSupportRetained from '../../domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../domain/services/custody/ObservationSupportSummary.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { buildObservationConstructionRef } from '../../domain/utils/ObservationRefLayout.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import ObservationSupportPort, { type ObservationSupportOutcome } from '../../ports/ObservationSupportPort.ts';
import GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import ObservationCarrierChain, {
  type ObservationCarrierHistory,
  type ObservationChainPosition,
} from './ObservationCarrierChain.ts';
import ObservationCarrierMessage from './ObservationCarrierMessage.ts';
import ObservationDependencyPages, {
  type ObservationDependencyHistory,
  type ObservationPageSet,
} from './ObservationDependencyPages.ts';

/** New writer heads per carrier: one of a commit's 64 parents names the previous carrier. */
export const OBSERVATION_CARRIER_BATCH = 63;

export type ObservationSupportHistory = ObservationCarrierHistory & ObservationDependencyHistory & {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
};

/** Progress over an attempt's writer heads against any chain it already published. */
type HeadProgress = {
  readonly position: ObservationChainPosition;
  readonly consumed: number;
  readonly digest: ObservationDigest;
};
type CarrierTarget = { readonly request: ObservationSupportRequest; readonly root: AssetHandle };

/**
 * Builds the Git edges of an observation (#1067).
 *
 * Writer history is retained by a chain of git-cas publications, each adding at
 * most 63 heads as parents plus the previous carrier. The chain tip becomes a
 * custody parent. Each carrier states its attempt, position and rolling digest,
 * so recovery can prove a construction ref retains the claimed prefix of this
 * attempt's own input rather than trusting that its head is readable.
 * Working memory holds one batch of heads, whatever the writer count.
 */
export default class GitCasObservationSupportAdapter extends ObservationSupportPort {
  readonly #publications: Pick<PublicationCapability, 'commit'>;
  readonly #assets: Pick<AssetCapability, 'put'>;
  readonly #history: ObservationSupportHistory;
  readonly #graphName: string;
  readonly #chain: ObservationCarrierChain;
  readonly #pages: ObservationDependencyPages;

  constructor(options: {
    readonly publications: Pick<PublicationCapability, 'commit'>;
    readonly assets: Pick<AssetCapability, 'put'>;
    readonly history: ObservationSupportHistory;
    readonly crypto: CryptoPort;
    readonly graphName: string;
  }) {
    super();
    this.#publications = options.publications;
    this.#assets = options.assets;
    this.#history = options.history;
    this.#graphName = options.graphName;
    this.#chain = new ObservationCarrierChain(options.history, options.crypto);
    this.#pages = new ObservationDependencyPages({
      history: options.history,
      trees: new GitFastImportTreeWriter({ plumbing: options.history.plumbing }),
      crypto: options.crypto,
    });
  }

  override async retain(request: ObservationSupportRequest): Promise<ObservationSupportOutcome> {
    if (!await this.#history.nodeExists(request.basis)) {
      return new ObservationSupportRefused('basis-unavailable');
    }
    const pages = await this.#pages.write(request);
    return isStopped(pages) ? pages : await this.#retainedWith(request, pages);
  }

  override async release(identity: ObservationCustodyIdentity): Promise<void> {
    const ref = this.#constructionRef(identity);
    if (await this.#history.readRef(ref) !== null) {
      await this.#history.deleteRef(ref);
    }
  }

  override async verify(
    identity: ObservationCustodyIdentity,
    retained: {
      readonly basis: string;
      readonly roots: ObservationCustodyRoots;
      readonly summary: ObservationSupportSummary;
    },
  ): Promise<ObservationSupportFault | null> {
    const { basis, roots, summary } = retained;
    if (!await this.#history.nodeExists(basis)) {
      return new ObservationSupportFault('basis-missing');
    }
    if (!isRetainedBy(roots, [basis, ...summary.pages])) {
      return new ObservationSupportFault('dependency-mismatch');
    }
    const claim = { count: summary.dependencies, digest: summary.dependency };
    const dependencyFault = await this.#pages.check(summary.pages, claim);
    return dependencyFault === null
      ? await this.#verifyHistory(identity, roots.parents[0] ?? null, summary)
      : new ObservationSupportFault(dependencyFault);
  }

  override async verifyPublication(commit: string): Promise<ObservationSupportFault | null> {
    return await this.#history.nodeExists(commit) ? null : new ObservationSupportFault('publication-missing');
  }

  #constructionRef(identity: ObservationCustodyIdentity): string {
    return buildObservationConstructionRef(this.#graphName, identity.attemptId.value);
  }

  async #retainedWith(request: ObservationSupportRequest, pages: ObservationPageSet): Promise<ObservationSupportOutcome> {
    const chain = await this.#retainHistory(request);
    return isStopped(chain) ? chain : retainedSupport(request.basis, pages, chain);
  }

  async #retainHistory(
    request: ObservationSupportRequest,
  ): Promise<ObservationChainPosition | ObservationSupportRefused | ObservationSupportCancelled> {
    const resumed = await this.#resumedChain(request.identity);
    if (resumed instanceof ObservationSupportRefused) {
      return resumed;
    }
    const target = { request, root: await this.#carrierRoot(request.identity) };
    return await this.#consumeHeads(target, { position: resumed, consumed: 0, digest: await this.#chain.seed() });
  }

  async #consumeHeads(
    target: CarrierTarget,
    start: HeadProgress,
  ): Promise<ObservationChainPosition | ObservationSupportRefused | ObservationSupportCancelled> {
    let progress = start;
    let batch: string[] = [];
    for await (const head of target.request.writerHeads) {
      const stopped = stopOf(target.request, progress.consumed + batch.length + 1);
      if (stopped !== null) {
        return stopped;
      }
      batch.push(head);
      if (batch.length === OBSERVATION_CARRIER_BATCH) {
        const advanced = await this.#advance(target, progress, batch);
        if (advanced instanceof ObservationSupportRefused) {
          return advanced;
        }
        progress = advanced;
        batch = [];
      }
    }
    return await this.#finishHistory(target, progress, batch);
  }

  async #finishHistory(
    target: CarrierTarget,
    progress: HeadProgress,
    batch: readonly string[],
  ): Promise<ObservationChainPosition | ObservationSupportRefused> {
    const finished = batch.length === 0 ? progress : await this.#advance(target, progress, batch);
    if (finished instanceof ObservationSupportRefused) {
      return finished;
    }
    const complete = finished.position.writers === finished.consumed && finished.digest.equals(finished.position.history);
    return complete ? finished.position : new ObservationSupportRefused('construction-mismatch');
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
  async #resumedChain(identity: ObservationCustodyIdentity): Promise<ObservationChainPosition | ObservationSupportRefused> {
    const tip = await this.#history.readRef(this.#constructionRef(identity));
    if (tip === null) {
      return await this.#chain.empty();
    }
    const walked = await this.#chain.walk(identity, tip);
    return walked instanceof ObservationSupportFault ? new ObservationSupportRefused('construction-mismatch') : walked;
  }

  async #verifyHistory(
    identity: ObservationCustodyIdentity,
    tip: string | null,
    summary: ObservationSupportSummary,
  ): Promise<ObservationSupportFault | null> {
    if (tip === null) {
      return summary.writers === 0 ? null : new ObservationSupportFault('history-missing');
    }
    const walked = await this.#chain.walk(identity, tip);
    return walked instanceof ObservationSupportFault ? walked : chainFault(walked, summary);
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

function isStopped<T>(outcome: T | ObservationSupportRefused | ObservationSupportCancelled): outcome is ObservationSupportRefused | ObservationSupportCancelled {
  return outcome instanceof ObservationSupportRefused || outcome instanceof ObservationSupportCancelled;
}

function chainFault(walked: ObservationChainPosition, summary: ObservationSupportSummary): ObservationSupportFault | null {
  const matches = walked.writers === summary.writers && walked.history.equals(summary.history);
  return matches ? null : new ObservationSupportFault('history-mismatch');
}

function stopOf(request: ObservationSupportRequest, count: number): ObservationSupportRefused | ObservationSupportCancelled | null {
  if (request.isCancelled()) {
    return new ObservationSupportCancelled();
  }
  return count > request.limits.writers ? new ObservationSupportRefused('writer-limit') : null;
}

function retainedSupport(basis: string, dependencies: ObservationPageSet, chain: ObservationChainPosition): ObservationSupportRetained {
  const supports: ObservationSupportEntry[] = [
    { type: 'tree', oid: basis },
    ...dependencies.pages.map((oid): ObservationSupportEntry => ({ type: 'tree', oid })),
  ];
  return new ObservationSupportRetained(
    new ObservationCustodyRoots(supports, chain.tip === null ? [] : [chain.tip]),
    new ObservationSupportSummary({
      writers: chain.writers,
      history: chain.history,
      dependencies: dependencies.count,
      dependency: dependencies.digest,
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
