export {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  decodeAnchorMessage,
  decodeCheckpointMessage,
  decodePatchMessage,
  detectMessageKind,
  encodeAnchorMessage,
  encodeCheckpointMessage,
  encodePatchMessage,
} from '../../../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts'; // nosemgrep: no-restricted-imports:core-infrastructure -- 0025D
export { encodeAuditMessage, decodeAuditMessage } from './AuditMessageCodec.ts';
export {
  detectSchemaVersion,
  assertOpsCompatible,
  CLASSIC_PATCH_SCHEMA_VERSION,
  EDGE_PROPERTY_PATCH_SCHEMA_VERSION,
  PATCH_SCHEMA_CLASSIC,
  PATCH_SCHEMA_EDGE_PROPERTIES,
} from './MessageSchemaDetector.ts';
