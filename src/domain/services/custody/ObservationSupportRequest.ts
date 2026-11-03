import type ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import type ObservationDependency from './ObservationDependency.ts';
import type ObservationSupportLimits from './ObservationSupportLimits.ts';

/** What the original basis requires, as streams: support is never collected eagerly. */
export type ObservationSupportSources = {
  readonly writerHeads: AsyncIterable<string>;
  readonly dependencies: AsyncIterable<ObservationDependency>;
};

export type ObservationSupportRequest = ObservationSupportSources & {
  readonly identity: ObservationCustodyIdentity;
  readonly basis: string;
  readonly limits: ObservationSupportLimits;
  /** Checked between bounded steps, so a cancelled builder stops its owned work. */
  readonly isCancelled: () => boolean;
};
