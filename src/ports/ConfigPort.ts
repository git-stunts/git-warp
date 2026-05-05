/**
 * Port for Git config operations.
 *
 * Defines the contract for reading and writing Git configuration values.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

/** Port for Git config operations. */
export default abstract class ConfigPort {
  /** Reads a git config value. */
  abstract configGet(_key: string): Promise<string | null>;

  /** Sets a git config value. */
  abstract configSet(_key: string, _value: string): Promise<void>;
}
