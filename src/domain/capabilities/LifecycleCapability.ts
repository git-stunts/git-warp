/**
 * Graph lifecycle: disposal, inspection, and version.
 */

export default abstract class LifecycleCapability {
  /** Release resources held by the graph instance. */
  abstract dispose(): Promise<void>;

  /** Return diagnostic information about the graph instance. */
  abstract inspect(): Record<string, unknown>;

  /** Return the graph protocol/schema version. */
  abstract version(): string;
}
