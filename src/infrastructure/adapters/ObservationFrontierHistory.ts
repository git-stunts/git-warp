import type { AssetCapability, AssetHandle, PublicationCapability } from '@git-stunts/git-cas';
import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyRoots from '../../domain/services/custody/ObservationCustodyRoots.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault from '../../domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportRefused from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import type ObservationSupportSummary from '../../domain/services/custody/ObservationSupportSummary.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { buildObservationConstructionRef } from '../../domain/utils/ObservationRefLayout.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import FrontierAnchorPlan from './FrontierAnchorPlan.ts';
import GitFastImportCommitWriter from './GitFastImportCommitWriter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { ObservationBasisHeads } from './ObservationBasisFrontier.ts';
import ObservationCarrier from './ObservationCarrier.ts';
import ObservationCarrierMessage from './ObservationCarrierMessage.ts';
import ObservationHistoryDigest from './ObservationHistoryDigest.ts';
import { isMissingObject, objectTypes } from './ObservationObjectTypes.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

export type ObservationFrontierHistoryHost = {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readRef(ref: string): Promise<string | null>;
};

/** An attempt's retained history: its carrier, or none for a basis with no writers, and its claim. */
export type RetainedHistory = { readonly tip: string | null; readonly claim: ObservationCarrierMessage };

/**
 * Retains and verifies the writer history of an attempt's basis through frontier anchors
 * (#1197). The anchors of a frontier are shared by every attempt and every clone that
 * retains it ({@link FrontierAnchorPlan}); an attempt adds only the anchors that do not
 * exist yet and one carrier of its own, published through git-cas under its construction
 * ref, whose parents are the branch anchors. The heads always come from the basis's own
 * frontier blob: anchors are checked against them, never trusted instead of them.
 */
export default class ObservationFrontierHistory {
  readonly #publications: Pick<PublicationCapability, 'commit'>;
  readonly #assets: Pick<AssetCapability, 'put'>;
  readonly #host: ObservationFrontierHistoryHost;
  readonly #crypto: CryptoPort;
  readonly #graphName: string;
  readonly #digest: ObservationHistoryDigest;
  readonly #carrier: ObservationCarrier;
  readonly #anchors: GitFastImportCommitWriter;

  constructor(options: {
    readonly publications: Pick<PublicationCapability, 'commit'>;
    readonly assets: Pick<AssetCapability, 'put'>;
    readonly host: ObservationFrontierHistoryHost;
    readonly crypto: CryptoPort;
    readonly graphName: string;
  }) {
    this.#publications = options.publications;
    this.#assets = options.assets;
    this.#host = options.host;
    this.#crypto = options.crypto;
    this.#graphName = options.graphName;
    this.#digest = new ObservationHistoryDigest(options.crypto);
    this.#carrier = new ObservationCarrier(options.host);
    this.#anchors = new GitFastImportCommitWriter({ plumbing: options.host.plumbing });
    Object.freeze(this);
  }

  async retain(
    request: ObservationSupportRequest,
    basis: ObservationBasisHeads,
    meter: ObservationWorkMeter,
  ): Promise<RetainedHistory | ObservationSupportRefused | ObservationSupportCancelled> {
    const claim = await this.#claim(request.identity, basis);
    if (basis.heads.length === 0) {
      return { tip: null, claim };
    }
    const plan = await this.#plan(basis);
    const landed = await this.#host.readRef(this.#constructionRef(request.identity));
    return landed === null
      ? await this.#built({ request, basis, plan, claim, meter })
      : await this.#resumed({ identity: request.identity, landed, plan, claim, meter });
  }

  /** The carrier must make the claim the basis implies and name exactly its branch anchors, and every anchor and head must exist. */
  async verify(check: {
    readonly identity: ObservationCustodyIdentity;
    readonly retained: { readonly roots: ObservationCustodyRoots; readonly summary: ObservationSupportSummary };
    readonly basis: ObservationBasisHeads;
    readonly meter: ObservationWorkMeter;
  }): Promise<ObservationSupportFault | null> {
    const { identity, retained, basis, meter } = check;
    const claim = await this.#claim(identity, basis);
    if (claim.writers !== retained.summary.writers || !claim.history.equals(retained.summary.history)) {
      return new ObservationSupportFault('history-mismatch');
    }
    const [tip] = retained.roots.parents;
    if (tip === undefined) {
      return basis.heads.length === 0 ? null : new ObservationSupportFault('history-missing');
    }
    return await this.#carried({ identity, tip, claim, basis, meter });
  }

  async #carried(check: {
    readonly identity: ObservationCustodyIdentity;
    readonly tip: string;
    readonly claim: ObservationCarrierMessage;
    readonly basis: ObservationBasisHeads;
    readonly meter: ObservationWorkMeter;
  }): Promise<ObservationSupportFault | null> {
    const carrier = await this.#carrier.read(check.identity, check.tip, check.meter);
    if (carrier instanceof ObservationSupportFault) {
      return carrier;
    }
    const plan = await this.#plan(check.basis);
    if (!carrier.message.equals(check.claim) || !sameIds(carrier.parents, plan.tops)) {
      return new ObservationSupportFault('history-mismatch');
    }
    return await this.#present([...plan.anchors.map((anchor) => anchor.oid), ...check.basis.heads.map((named) => named.head)], check.meter);
  }

  async #present(objects: readonly string[], meter: ObservationWorkMeter): Promise<ObservationSupportFault | null> {
    if (!meter.spend(objects.length)) {
      return new ObservationSupportFault('work-limit');
    }
    return (await objectTypes(this.#host.plumbing, objects)).some(isMissingObject) ? new ObservationSupportFault('history-missing') : null;
  }

  async #claim(identity: ObservationCustodyIdentity, basis: ObservationBasisHeads): Promise<ObservationCarrierMessage> {
    const history = await this.#digest.of(basis.heads.map((named) => named.head));
    return new ObservationCarrierMessage({ binding: identity.binding, writers: basis.heads.length, history });
  }

  async #plan(basis: ObservationBasisHeads): Promise<FrontierAnchorPlan> {
    return await FrontierAnchorPlan.of({ crypto: this.#crypto, lane: this.#graphName, format: basis.format, heads: basis.heads });
  }

  /** Writes the anchors that do not exist yet, then publishes this attempt's one carrier. */
  async #built(build: {
    readonly request: ObservationSupportRequest;
    readonly basis: ObservationBasisHeads;
    readonly plan: FrontierAnchorPlan;
    readonly claim: ObservationCarrierMessage;
    readonly meter: ObservationWorkMeter;
  }): Promise<RetainedHistory | ObservationSupportRefused | ObservationSupportCancelled> {
    const { request, basis, plan, claim, meter } = build;
    if (request.isCancelled()) {
      return new ObservationSupportCancelled();
    }
    const heads = basis.heads.map((named) => named.head);
    if (!meter.spend(heads.length + plan.anchors.length)) {
      return new ObservationSupportRefused('work-limit');
    }
    const missing = missingIds(await objectTypes(this.#host.plumbing, [...heads, ...plan.anchors.map((anchor) => anchor.oid)]));
    if (heads.some((head) => missing.has(head))) {
      return new ObservationSupportRefused('writer-head-unavailable');
    }
    await this.#anchors.write(plan.anchors.filter((anchor) => missing.has(anchor.oid)));
    if (request.isCancelled()) {
      return new ObservationSupportCancelled();
    }
    return await this.#published(request.identity, plan, claim);
  }

  /** A carrier already under this attempt's construction ref is reused only when it makes this exact claim over these anchors. */
  async #resumed(resume: {
    readonly identity: ObservationCustodyIdentity;
    readonly landed: string;
    readonly plan: FrontierAnchorPlan;
    readonly claim: ObservationCarrierMessage;
    readonly meter: ObservationWorkMeter;
  }): Promise<RetainedHistory | ObservationSupportRefused> {
    const carrier = await this.#carrier.read(resume.identity, resume.landed, resume.meter);
    if (carrier instanceof ObservationSupportFault) {
      return new ObservationSupportRefused(carrier.reason === 'work-limit' ? 'work-limit' : 'construction-mismatch');
    }
    const same = carrier.message.equals(resume.claim) && sameIds(carrier.parents, resume.plan.tops);
    return same ? { tip: resume.landed, claim: resume.claim } : new ObservationSupportRefused('construction-mismatch');
  }

  async #published(identity: ObservationCustodyIdentity, plan: FrontierAnchorPlan, claim: ObservationCarrierMessage): Promise<RetainedHistory | ObservationSupportRefused> {
    try {
      const published = await this.#publications.commit({
        root: await this.#carrierRoot(identity),
        commit: { message: claim.toString(), parents: [...plan.tops] },
        ref: { name: this.#constructionRef(identity), expected: null },
      });
      return { tip: published.commitId, claim };
    } catch (cause) {
      if (isPublicationConflict(cause)) {
        return new ObservationSupportRefused('construction-contended');
      }
      throw cause;
    }
  }

  #constructionRef(identity: ObservationCustodyIdentity): string {
    return buildObservationConstructionRef(this.#graphName, identity.attemptId.value);
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

/** The ids Git reports missing: `git cat-file --batch-check` answers each one with `<id> missing`. */
function missingIds(lines: readonly string[]): ReadonlySet<string> {
  return new Set(lines.filter(isMissingObject).map((line) => line.slice(0, line.indexOf(' '))));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((oid, index) => oid === right[index]);
}

function isPublicationConflict(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'PUBLICATION_CONFLICT';
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield await Promise.resolve(bytes);
}
