export type ObservationSupportRefusalReason =
  | 'writer-limit' | 'dependency-limit' | 'frontier-limit' | 'work-limit'
  | 'basis-unavailable' | 'basis-corrupt' | 'dependency-unavailable' | 'dependency-mismatch'
  | 'writer-head-unavailable' | 'construction-mismatch' | 'construction-contended';

/** Support could not be retained; nothing has been permitted. */
export default class ObservationSupportRefused {
  readonly reason: ObservationSupportRefusalReason;

  constructor(reason: ObservationSupportRefusalReason) {
    this.reason = reason;
    Object.freeze(this);
  }
}
