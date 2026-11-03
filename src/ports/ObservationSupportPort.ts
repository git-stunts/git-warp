import type ObservationCustodyIdentity from '../domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyRoots from '../domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationSupportCancelled from '../domain/services/custody/ObservationSupportCancelled.ts';
import type ObservationSupportFault from '../domain/services/custody/ObservationSupportFault.ts';
import type ObservationSupportRefused from '../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../domain/services/custody/ObservationSupportRequest.ts';
import type ObservationSupportRetained from '../domain/services/custody/ObservationSupportRetained.ts';
import type ObservationSupportSummary from '../domain/services/custody/ObservationSupportSummary.ts';

export type ObservationSupportOutcome = ObservationSupportRetained | ObservationSupportRefused | ObservationSupportCancelled;

/**
 * Builds and checks the Git edges an observation requires (#1067). A stored
 * object id is not a reachability edge: writer history needs commit parents,
 * and content needs tree or blob edges. All work is bounded per step.
 */
export default abstract class ObservationSupportPort {
  /** Builds the attempt's edges from its original sources, resuming any verified construction. */
  abstract retain(_request: ObservationSupportRequest): Promise<ObservationSupportOutcome>;

  /** Drops the attempt's disposable construction state; custody roots keep what it built. */
  abstract release(_identity: ObservationCustodyIdentity): Promise<void>;

  /** The first fault in retained preparation edges against the attempt's basis and summary, or null. */
  abstract verify(
    _identity: ObservationCustodyIdentity,
    _retained: {
      readonly basis: string;
      readonly roots: ObservationCustodyRoots;
      readonly summary: ObservationSupportSummary;
    },
  ): Promise<ObservationSupportFault | null>;

  /** A fault when an exact publication commit is gone, or null. */
  abstract verifyPublication(_commit: string): Promise<ObservationSupportFault | null>;
}
