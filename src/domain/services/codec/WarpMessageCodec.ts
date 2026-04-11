/**
 * WARP Message Codec — facade re-exporting all message encoding, decoding,
 * and schema utilities.
 *
 * Split across focused sub-modules:
 * - PatchMessageCodec
 * - CheckpointMessageCodec
 * - AnchorMessageCodec
 * - AuditMessageCodec
 * - MessageSchemaDetector
 */

export { encodePatchMessage, decodePatchMessage } from './PatchMessageCodec.ts';
export { encodeCheckpointMessage, decodeCheckpointMessage } from './CheckpointMessageCodec.ts';
export { encodeAnchorMessage, decodeAnchorMessage } from './AnchorMessageCodec.ts';
export { encodeAuditMessage, decodeAuditMessage } from './AuditMessageCodec.ts';
export {
  detectSchemaVersion,
  detectMessageKind,
  assertOpsCompatible,
  SCHEMA_V2,
  SCHEMA_V3,
  PATCH_SCHEMA_V2,
  PATCH_SCHEMA_V3,
} from './MessageSchemaDetector.ts';
