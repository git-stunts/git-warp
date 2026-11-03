import type CryptoPort from '../../../ports/CryptoPort.ts';
import type ObservationCustodyCodecPort from '../../../ports/ObservationCustodyCodecPort.ts';
import type ObservationCustodyPort from '../../../ports/ObservationCustodyPort.ts';
import type ObservationSupportPort from '../../../ports/ObservationSupportPort.ts';
import CustodyEvidence from './CustodyEvidence.ts';
import CustodyRefused from './CustodyRefused.ts';
import { digestOf } from './observationDigestOf.ts';
import type ObservationCoordinate from './ObservationCoordinate.ts';
import ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import ObservationDecodeFailure from './ObservationDecodeFailure.ts';
import ObservationDependencyClaim from './ObservationDependencyClaim.ts';
import ObservationPreparation from './ObservationPreparation.ts';
import type ObservationPreparedPage from './ObservationPreparedPage.ts';
import type ObservationRecord from './ObservationRecord.ts';
import type ObservationSupportFault from './ObservationSupportFault.ts';
import ObservationUnavailable, { type ObservationUnavailableReason } from './ObservationUnavailable.ts';
import ResolvedObservation from './ResolvedObservation.ts';

/** The verified settlement of a Coordinate: its decoded record and exact core bytes. */
type VerifiedSettlement = { readonly record: ObservationRecord; readonly core: Uint8Array };
/** The verified preparation of a Coordinate and its custody evidence. */
type VerifiedPreparation = {
  readonly preparation: ObservationPreparation;
  readonly page: ObservationPreparedPage;
  readonly evidence: CustodyEvidence;
};

/**
 * Resolves a Coordinate to its exact original evidence. Every link is checked
 * against the digest that bound it, and nothing is regenerated from today's
 * graph: a broken link is a typed unavailable outcome. Resolving is internal
 * and grants no disclosure authority.
 */
export default class ObservationCustodyResolver {
  readonly #custody: ObservationCustodyPort;
  readonly #support: ObservationSupportPort;
  readonly #codec: ObservationCustodyCodecPort;
  readonly #crypto: CryptoPort;

  constructor(options: {
    readonly custody: ObservationCustodyPort;
    readonly support: ObservationSupportPort;
    readonly codec: ObservationCustodyCodecPort;
    readonly crypto: CryptoPort;
  }) {
    this.#custody = options.custody;
    this.#support = options.support;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    Object.freeze(this);
  }

  async resolve(coordinate: ObservationCoordinate): Promise<ResolvedObservation | ObservationUnavailable> {
    try {
      return await this.#resolved(coordinate);
    } catch {
      return new ObservationUnavailable('evidence-unreadable');
    }
  }

  async #resolved(coordinate: ObservationCoordinate): Promise<ResolvedObservation | ObservationUnavailable> {
    const identity = new ObservationCustodyIdentity(coordinate.attemptId, coordinate.binding);
    const settlement = await this.#verifiedSettlement(coordinate, identity);
    if (settlement instanceof ObservationUnavailable) {
      return settlement;
    }
    const preparation = await this.#verifiedPreparation(identity, settlement.record);
    if (preparation instanceof ObservationUnavailable) {
      return preparation;
    }
    const fault = await this.#supportFault(identity, preparation, settlement.record);
    if (fault !== null) {
      return new ObservationUnavailable(fault.reason);
    }
    return new ResolvedObservation({
      preparation: preparation.preparation,
      record: settlement.record,
      core: settlement.core,
    });
  }

  async #verifiedSettlement(
    coordinate: ObservationCoordinate,
    identity: ObservationCustodyIdentity,
  ): Promise<VerifiedSettlement | ObservationUnavailable> {
    const evidence = await this.#custody.readEvidence(identity, 'settlement');
    if (!(evidence instanceof CustodyEvidence)) {
      return unavailableEvidence(evidence);
    }
    const page = this.#codec.decodeSettlementPage(evidence.page.record());
    if (page instanceof ObservationDecodeFailure) {
      return new ObservationUnavailable('record-corrupt');
    }
    const addressed = (await digestOf(this.#crypto, page.record())).equals(coordinate.record);
    const verified = addressed ? await this.#verifiedRecord(page.record(), page.core()) : new ObservationUnavailable('record-corrupt');
    return verified instanceof ObservationUnavailable ? verified : publicationRetained(verified, evidence);
  }

  async #verifiedRecord(recordBytes: Uint8Array, core: Uint8Array): Promise<VerifiedSettlement | ObservationUnavailable> {
    const record = this.#codec.decodeRecord(recordBytes);
    if (record instanceof ObservationDecodeFailure) {
      return new ObservationUnavailable('record-corrupt');
    }
    const coreIntact = (await digestOf(this.#crypto, core)).equals(record.core)
      && !(this.#codec.decodeCore(core) instanceof ObservationDecodeFailure);
    return coreIntact ? { record, core } : new ObservationUnavailable('core-corrupt');
  }

  async #verifiedPreparation(
    identity: ObservationCustodyIdentity,
    record: ObservationRecord,
  ): Promise<VerifiedPreparation | ObservationUnavailable> {
    const evidence = await this.#custody.readEvidence(identity, 'preparation');
    if (!(evidence instanceof CustodyEvidence)) {
      return unavailableEvidence(evidence);
    }
    const page = this.#codec.decodePreparedPage(evidence.page.record());
    return page instanceof ObservationDecodeFailure
      ? new ObservationUnavailable('preparation-corrupt')
      : await this.#boundPreparation({ identity, record, page, evidence });
  }

  async #boundPreparation(found: {
    readonly identity: ObservationCustodyIdentity;
    readonly record: ObservationRecord;
    readonly page: ObservationPreparedPage;
    readonly evidence: CustodyEvidence;
  }): Promise<VerifiedPreparation | ObservationUnavailable> {
    const { identity, page, evidence } = found;
    const preparation = this.#codec.decodePreparation(page.preparation());
    const intact = await this.#isBound(found) && isAttemptOf(preparation, identity) && claimHolds(preparation, page);
    return intact ? { preparation, page, evidence } : new ObservationUnavailable('preparation-corrupt');
  }

  /** True when the page's preparation and whole bytes are exactly what the Coordinate and record bound. */
  async #isBound(found: {
    readonly identity: ObservationCustodyIdentity;
    readonly record: ObservationRecord;
    readonly page: ObservationPreparedPage;
    readonly evidence: CustodyEvidence;
  }): Promise<boolean> {
    const digest = await digestOf(this.#crypto, found.page.preparation());
    const support = await digestOf(this.#crypto, found.evidence.page.record());
    return digest.equals(found.identity.binding) && digest.equals(found.record.preparation) && support.equals(found.record.support);
  }

  async #supportFault(
    identity: ObservationCustodyIdentity,
    verified: VerifiedPreparation,
    record: ObservationRecord,
  ): Promise<ObservationSupportFault | null> {
    const fault = await this.#support.verify(identity, {
      basis: verified.preparation.bindings.basis,
      roots: verified.evidence.page.roots,
      summary: verified.page.summary,
    });
    if (fault !== null || record.publication === null) {
      return fault;
    }
    return await this.#support.verifyPublication(record.publication.commit);
  }
}

/** A record's exact publication must be a parent of its settlement, not merely named by it. */
function publicationRetained(settlement: VerifiedSettlement, evidence: CustodyEvidence): VerifiedSettlement | ObservationUnavailable {
  const { publication } = settlement.record;
  const retained = publication === null || evidence.page.roots.parents.includes(publication.commit);
  return retained ? settlement : new ObservationUnavailable('publication-missing');
}

function isAttemptOf(
  preparation: ObservationPreparation | ObservationDecodeFailure,
  identity: ObservationCustodyIdentity,
): preparation is ObservationPreparation {
  return preparation instanceof ObservationPreparation && preparation.attemptId.value === identity.attemptId.value;
}

/** The support summary must be exactly what the preparation claimed. */
function claimHolds(preparation: ObservationPreparation, page: ObservationPreparedPage): boolean {
  const { summary } = page;
  const claimed = new ObservationDependencyClaim(summary.dependencies, summary.dependency);
  return claimed.equals(preparation.bindings.dependencies);
}

function unavailableEvidence(outcome: object): ObservationUnavailable {
  const reason: ObservationUnavailableReason = outcome instanceof CustodyRefused ? 'not-retained' : 'evidence-unreadable';
  return new ObservationUnavailable(reason);
}
