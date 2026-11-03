import CustodyAcknowledged from '../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyInspection from '../../src/domain/services/custody/CustodyInspection.ts';
import type {
  CustodyEvidenceOutcome,
  CustodyObservation,
  CustodyTransition,
} from '../../src/domain/services/custody/CustodyOutcome.ts';
import type { CustodyPhase, CustodyStage } from '../../src/domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDependencyClaim from '../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../src/domain/services/custody/ObservationDigest.ts';
import type ObservationSupportFault from '../../src/domain/services/custody/ObservationSupportFault.ts';
import type { ObservationSupportRequest } from '../../src/domain/services/custody/ObservationSupportRequest.ts';
import ObservationSupportRetained from '../../src/domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../src/domain/services/custody/ObservationSupportSummary.ts';
import ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';
import ObservationSupportPort, { type ObservationSupportOutcome } from '../../src/ports/ObservationSupportPort.ts';

export const SCRIPTED_DIGEST = new ObservationDigest('ee'.repeat(32));

/** Custody whose every outcome is set by the test; pages given to it are recorded. */
export class ScriptedCustody extends ObservationCustodyPort {
  reserved: CustodyTransition = new CustodyAcknowledged('admitted', 'reserved');
  prepared: CustodyTransition = new CustodyAcknowledged('prepared', 'prepared');
  armed: CustodyTransition = new CustodyAcknowledged('armed', 'armed');
  settled: CustodyTransition = new CustodyAcknowledged('settled', 'settled');
  cancelled: CustodyTransition = new CustodyAcknowledged('cancelled', 'cancelled');
  reconciled: CustodyTransition = new CustodyAcknowledged('recovered', 'prepared');
  inspected: CustodyObservation = inspectionAt('reserved');
  evidence: Partial<Record<CustodyStage, CustodyEvidenceOutcome>> = {};
  readonly pages: ObservationCustodyPage[] = [];

  override async reserve(_identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await Promise.resolve(this.reserved);
  }

  override async prepare(_identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    this.pages.push(page);
    return await Promise.resolve(this.prepared);
  }

  override async arm(_identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await Promise.resolve(this.armed);
  }

  override async settle(_identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    this.pages.push(page);
    return await Promise.resolve(this.settled);
  }

  override async cancel(_identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await Promise.resolve(this.cancelled);
  }

  override async reconcile(_identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await Promise.resolve(this.reconciled);
  }

  override async inspect(_identity: ObservationCustodyIdentity): Promise<CustodyObservation> {
    return await Promise.resolve(this.inspected);
  }

  override async readEvidence(_identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    return await Promise.resolve(this.evidence[stage] ?? new CustodyIndeterminate(new Error(`No scripted ${stage}`)));
  }
}

/** Support whose build and verification outcomes are set by the test. */
export class ScriptedSupport extends ObservationSupportPort {
  retention: (request: ObservationSupportRequest) => Promise<ObservationSupportOutcome> = async () =>
    await Promise.resolve(new ObservationSupportRetained(new ObservationCustodyRoots([], []), emptySummary()));
  fault: ObservationSupportFault | null = null;
  publicationFault: ObservationSupportFault | null = null;
  releaseFailure: Error | null = null;
  releases = 0;

  override async retain(request: ObservationSupportRequest): Promise<ObservationSupportOutcome> {
    return await this.retention(request);
  }

  override async release(_identity: ObservationCustodyIdentity): Promise<void> {
    this.releases += 1;
    if (this.releaseFailure !== null) {
      throw this.releaseFailure;
    }
    await Promise.resolve();
  }

  override async verify(): Promise<ObservationSupportFault | null> {
    return await Promise.resolve(this.fault);
  }

  override async verifyPublication(_commit: string): Promise<ObservationSupportFault | null> {
    return await Promise.resolve(this.publicationFault);
  }
}

export function inspectionAt(phase: CustodyPhase): CustodyInspection {
  return new CustodyInspection({ phase, charged: 1, limit: 8 });
}

export function emptySummary(): ObservationSupportSummary {
  return new ObservationSupportSummary({
    writers: 0, history: SCRIPTED_DIGEST, dependencies: 0, dependency: ObservationDependencyClaim.NONE.digest, pages: [],
  });
}
