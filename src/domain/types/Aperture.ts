/**
 * Port interface for observer visibility configuration.
 *
 * Defines which nodes and properties an observer can see
 * through glob-based matching and property whitelisting/blacklisting.
 */
export interface Aperture {
  /** Glob pattern or array of patterns for visible nodes (e.g. 'user:*' or ['user:*', 'team:*']) */
  match: string | string[];
  /** Property keys to include (whitelist). If omitted, all non-redacted properties are visible. */
  expose?: string[];
  /** Property keys to exclude (blacklist). Takes precedence over expose. */
  redact?: string[];
}

/** Legacy compatibility alias for Aperture. */
export type ObserverConfig = Aperture;
