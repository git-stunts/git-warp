/** Current shipped checkpoint schema: envelope tree with state subtree. */
export const CURRENT_CHECKPOINT_SCHEMA = 5;

/** Supported shipped runtime checkpoint schemas. */
export const SUPPORTED_CHECKPOINT_SCHEMAS = [CURRENT_CHECKPOINT_SCHEMA] as const;

/** Returns true for the checkpoint schema supported by this runtime. */
export function isCurrentCheckpointSchema(schema: number | undefined | null): boolean {
  return schema === CURRENT_CHECKPOINT_SCHEMA;
}
