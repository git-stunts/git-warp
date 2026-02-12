/**
 * WARP Message Codec — facade re-exporting all message encoding, decoding,
 * and schema utilities.
 *
 * This module provides backward-compatible access to the four types of
 * WARP (Write-Ahead Reference Protocol) commit messages:
 * - Patch: Contains graph mutations from a single writer
 * - Checkpoint: Contains a snapshot of materialized graph state
 * - Anchor: Marks a merge point in the WARP DAG
 * - Audit: Records tamper-evident audit receipts for data commits
 *
 * Implementation is split across focused sub-modules:
 * - {@link module:domain/services/PatchMessageCodec}
 * - {@link module:domain/services/CheckpointMessageCodec}
 * - {@link module:domain/services/AnchorMessageCodec}
 * - {@link module:domain/services/AuditMessageCodec}
 * - {@link module:domain/services/MessageSchemaDetector}
 *
 * @module domain/services/WarpMessageCodec
 */

export { encodePatchMessage, decodePatchMessage } from './PatchMessageCodec.js';
export { encodeCheckpointMessage, decodeCheckpointMessage } from './CheckpointMessageCodec.js';
export { encodeAnchorMessage, decodeAnchorMessage } from './AnchorMessageCodec.js';
export { encodeAuditMessage, decodeAuditMessage } from './AuditMessageCodec.js';
export {
  detectSchemaVersion,
  detectMessageKind,
  assertOpsCompatible,
  SCHEMA_V2,
  SCHEMA_V3,
} from './MessageSchemaDetector.js';
