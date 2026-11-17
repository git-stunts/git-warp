import type { AssetCapability, PublicationCapability } from '@git-stunts/git-cas';
import ObservationCustodyRoots, { type ObservationSupportEntry } from '../../domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationDependencyClaim from '../../domain/services/custody/ObservationDependencyClaim.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault, { type ObservationSupportFaultReason } from '../../domain/services/custody/ObservationSupportFault.ts';
import type ObservationSupportLimits from '../../domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused, { type ObservationSupportRefusalReason } from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import ObservationSupportRetained from '../../domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../domain/services/custody/ObservationSupportSummary.ts';
import { buildObservationConstructionRef } from '../../domain/utils/ObservationRefLayout.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import ObservationSupportPort, { type ObservationSupportOutcome } from '../../ports/ObservationSupportPort.ts';
import type RandomPort from '../../ports/RandomPort.ts';
import GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import ObservationBasisFrontier, { type ObservationBasisHistory, type ObservationBasisProblem } from './ObservationBasisFrontier.ts';
import ObservationDependencyPages, { type ObservationPageSet } from './ObservationDependencyPages.ts';
import ObservationFrontierHistory, { type RetainedHistory } from './ObservationFrontierHistory.ts';
import { isMissingObject, objectTypes } from './ObservationObjectTypes.ts';
import ObservationWorkMeter from './ObservationWorkMeter.ts';

export type ObservationSupportHistory = ObservationBasisHistory & {
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
};

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
 * through frontier anchors that every attempt over the same frontier shares, and one
 * carrier of the attempt's own that names them; the carrier becomes a custody parent
 * (#1197, {@link ObservationFrontierHistory}). The carrier states its attempt and the
 * count and digest of the heads, so recovery can prove a construction ref retains the
 * claimed frontier rather than trusting that its head is readable.
 */
export default class GitCasObservationSupportAdapter extends ObservationSupportPort {
  readonly #history: ObservationSupportHistory;
  readonly #graphName: string;
  readonly #limits: ObservationSupportLimits;
  readonly #frontier: ObservationFrontierHistory;
  readonly #pages: ObservationDependencyPages;
  readonly #basis: ObservationBasisFrontier;

  constructor(options: {
    readonly publications: Pick<PublicationCapability, 'commit'>;
    readonly assets: Pick<AssetCapability, 'put'>;
    readonly history: ObservationSupportHistory;
    readonly crypto: CryptoPort;
    readonly random: RandomPort;
    readonly codec: CodecPort;
    readonly graphName: string;
    readonly limits: ObservationSupportLimits;
  }) {
    super();
    this.#history = options.history;
    this.#graphName = options.graphName;
    this.#limits = options.limits;
    this.#frontier = new ObservationFrontierHistory({
      publications: options.publications, assets: options.assets, host: options.history, crypto: options.crypto, graphName: options.graphName,
    });
    this.#pages = new ObservationDependencyPages({
      history: options.history,
      trees: new GitFastImportTreeWriter({ plumbing: options.history.plumbing, random: options.random }),
      crypto: options.crypto,
      limits: options.limits,
    });
    this.#basis = new ObservationBasisFrontier({ history: options.history, codec: options.codec, limits: options.limits });
  }

  override async retain(request: ObservationSupportRequest): Promise<ObservationSupportOutcome> {
    const meter = new ObservationWorkMeter(this.#limits.work);
    const basis = await this.#basis.heads(request.basis, meter);
    if (typeof basis === 'string') {
      return new ObservationSupportRefused(basisRefusal(basis));
    }
    const pages = await this.#pages.write(request, meter);
    if (isStopped(pages)) {
      return pages;
    }
    const history = await this.#frontier.retain(request, basis, meter);
    return isStopped(history) ? history : retainedSupport(request.basis, pages, history);
  }

  override async release(identity: ObservationCustodyIdentity): Promise<void> {
    const ref = buildObservationConstructionRef(this.#graphName, identity.attemptId.value);
    if (await this.#history.readRef(ref) !== null) {
      await this.#history.deleteRef(ref);
    }
  }

  override async verify(identity: ObservationCustodyIdentity, retained: RetainedEdges): Promise<ObservationSupportFault | null> {
    const meter = new ObservationWorkMeter(this.#limits.work);
    const basis = await this.#basis.heads(retained.basis, meter);
    if (typeof basis === 'string') {
      return new ObservationSupportFault(basisFault(basis));
    }
    if (!isRetainedBy(retained.roots, [retained.basis, ...retained.summary.pages])) {
      return new ObservationSupportFault('dependency-mismatch');
    }
    const { summary } = retained;
    const fault = await this.#pages.check(summary.pages, new ObservationDependencyClaim(summary.dependencies, summary.dependency), meter);
    return fault === null ? await this.#frontier.verify({ identity, retained, basis, meter }) : new ObservationSupportFault(fault);
  }

  override async verifyPublication(commit: string): Promise<ObservationSupportFault | null> {
    const [type = ''] = await objectTypes(this.#history.plumbing, [commit]);
    return isMissingObject(type) ? new ObservationSupportFault('publication-missing') : null;
  }
}

function isStopped<T>(outcome: T | ObservationSupportRefused | ObservationSupportCancelled): outcome is ObservationSupportRefused | ObservationSupportCancelled {
  return outcome instanceof ObservationSupportRefused || outcome instanceof ObservationSupportCancelled;
}

function basisRefusal(problem: ObservationBasisProblem): ObservationSupportRefusalReason {
  const reasons: Record<ObservationBasisProblem, ObservationSupportRefusalReason> = {
    missing: 'basis-unavailable',
    corrupt: 'basis-corrupt',
    'frontier-limit': 'frontier-limit',
    'work-limit': 'work-limit',
  };
  return reasons[problem];
}

function basisFault(problem: ObservationBasisProblem): ObservationSupportFaultReason {
  if (problem === 'missing') {
    return 'basis-missing';
  }
  if (problem === 'corrupt') {
    return 'basis-corrupt';
  }
  return problem === 'work-limit' ? 'work-limit' : 'support-limit';
}

/**
 * Custody supports must be unique, while identical dependency pages share one
 * tree: the summary keeps every page in order, and the roots keep each once.
 */
function retainedSupport(basis: string, dependencies: ObservationPageSet, history: RetainedHistory): ObservationSupportRetained {
  const trees = [...new Set([basis, ...dependencies.pages])];
  const supports = trees.map((oid): ObservationSupportEntry => ({ type: 'tree', oid }));
  return new ObservationSupportRetained(
    new ObservationCustodyRoots(supports, history.tip === null ? [] : [history.tip]),
    new ObservationSupportSummary({
      writers: history.claim.writers,
      history: history.claim.history,
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
