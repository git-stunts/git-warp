import type ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import type ObservationDependency from './ObservationDependency.ts';
import type ObservationDependencyClaim from './ObservationDependencyClaim.ts';

/**
 * What an attempt's producer supplies: the objects it claimed, as a stream, so
 * support is never collected eagerly. Writer heads are not supplied: they come
 * from the frontier stored in the basis itself.
 */
export type ObservationSupportSources = {
  readonly dependencies: AsyncIterable<ObservationDependency>;
};

export type ObservationSupportRequest = ObservationSupportSources & {
  readonly identity: ObservationCustodyIdentity;
  readonly basis: string;
  readonly claim: ObservationDependencyClaim;
  /** Checked between bounded steps, so a cancelled builder stops its owned work. */
  readonly isCancelled: () => boolean;
};
