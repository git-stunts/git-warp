/** Signals that a checkpoint cannot be migrated without losing causal data. */
export default class CheckpointSchemaUpgradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointSchemaUpgradeError';
  }
}
