/**
 * Graph lifecycle: disposal, inspection, and version.
 */

export default abstract class LifecycleCapability {
  /** Release resources held by the graph instance. */
  abstract dispose(): Promise<void>;

  /** Return diagnostic information about the graph instance. */
  abstract inspect(): Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

  /** Return the graph protocol/schema version. */
  abstract version(): string;
}
