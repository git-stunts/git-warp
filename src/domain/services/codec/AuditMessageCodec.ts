/**
 * Audit message encoding and decoding for WARP audit commit messages.
 */

import { validateGraphName, validateWriterId } from '../../utils/RefLayout.ts';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validateSha256,
} from './MessageCodecInternal.ts';
import {
  parsePositiveIntTrailer,
  requireTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';



/** Encodes an audit commit message. */
export function encodeAuditMessage(params: { graph: string; writer: string; dataCommit: string; opsDigest: string }): string {
  const { graph, writer, dataCommit, opsDigest } = params;
  validateGraphName(graph);
  validateWriterId(writer);
  validateOid(dataCommit, 'dataCommit');
  validateSha256(opsDigest, 'opsDigest');

  const codec = getCodec();
  return codec.encode({
    title: MESSAGE_TITLES['audit'] ?? 'audit',
    trailers: {
      [TRAILER_KEYS['dataCommit'] ?? 'eg-data-commit']: dataCommit,
      [TRAILER_KEYS['graph'] ?? 'eg-graph']: graph,
      [TRAILER_KEYS['kind'] ?? 'eg-kind']: 'audit',
      [TRAILER_KEYS['opsDigest'] ?? 'eg-ops-digest']: opsDigest,
      [TRAILER_KEYS['schema'] ?? 'eg-schema']: '1',
      [TRAILER_KEYS['writer'] ?? 'eg-writer']: writer,
    },
  });
}

/** Decoded audit message. */
export type AuditMessage = {
  kind: 'audit';
  graph: string;
  writer: string;
  dataCommit: string;
  opsDigest: string;
  schema: number;
};

function checkDuplicateTrailers(trailers: Record<string, string>): void {
  const keys = Object.keys(trailers);
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new MessageCodecError(`Duplicate trailer rejected: ${key}`, {
        code: 'E_AUDIT_DUPLICATE_TRAILER', context: { key },
      });
    }
    seen.add(key);
  }
}

/** Decodes an audit commit message. */
export function decodeAuditMessage(message: string): AuditMessage {
  const codec = getCodec();
  const { trailers } = codec.decode(message);

  checkDuplicateTrailers(trailers);
  validateKindDiscriminator(trailers, 'audit');

  const graph = requireTrailer(trailers, 'graph', 'audit');
  validateGraphName(graph);
  const writer = requireTrailer(trailers, 'writer', 'audit');
  validateWriterId(writer);
  const dataCommit = requireTrailer(trailers, 'dataCommit', 'audit');
  validateOid(dataCommit, 'dataCommit');
  const opsDigest = requireTrailer(trailers, 'opsDigest', 'audit');
  validateSha256(opsDigest, 'opsDigest');

  const schema = parsePositiveIntTrailer(trailers, 'schema', 'audit');
  if (schema > 1) {
    throw new SchemaUnsupportedError(`Unsupported audit schema version: ${schema}`, { context: { schema } });
  }

  return { kind: 'audit', graph, writer, dataCommit, opsDigest, schema };
}
