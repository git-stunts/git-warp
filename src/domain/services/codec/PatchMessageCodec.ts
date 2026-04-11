/**
 * Patch message encoding and decoding for WARP commit messages.
 */

import { validateGraphName, validateWriterId } from '../../utils/RefLayout.ts';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validatePositiveInteger,
  validateSchema,
} from './MessageCodecInternal.ts';
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.ts';



/** Encodes a patch commit message. */
export function encodePatchMessage(params: {
  graph: string;
  writer: string;
  lamport: number;
  patchOid: string;
  schema?: number;
  encrypted?: boolean;
}): string {
  const { graph, writer, lamport, patchOid, schema = 2, encrypted = false } = params;
  validateGraphName(graph);
  validateWriterId(writer);
  validatePositiveInteger(lamport, 'lamport');
  validateOid(patchOid, 'patchOid');
  validateSchema(schema);

  const codec = getCodec();
  const trailers: Record<string, string> = {
    [TRAILER_KEYS['kind'] ?? 'eg-kind']: 'patch',
    [TRAILER_KEYS['graph'] ?? 'eg-graph']: graph,
    [TRAILER_KEYS['writer'] ?? 'eg-writer']: writer,
    [TRAILER_KEYS['lamport'] ?? 'eg-lamport']: String(lamport),
    [TRAILER_KEYS['patchOid'] ?? 'eg-patch-oid']: patchOid,
    [TRAILER_KEYS['schema'] ?? 'eg-schema']: String(schema),
  };
  if (encrypted) {
    trailers[TRAILER_KEYS['encrypted'] ?? 'eg-encrypted'] = 'true';
  }
  return codec.encode({ title: MESSAGE_TITLES['patch'] ?? 'patch', trailers });
}

/** Decoded patch message. */
export type PatchMessage = {
  kind: 'patch';
  graph: string;
  writer: string;
  lamport: number;
  patchOid: string;
  schema: number;
  encrypted: boolean;
};

/** Decodes a patch commit message. */
export function decodePatchMessage(message: string): PatchMessage {
  const codec = getCodec();
  const { trailers } = codec.decode(message);

  validateKindDiscriminator(trailers, 'patch');
  const graph = requireTrailer(trailers, 'graph', 'patch');
  validateGraphName(graph);
  const writer = requireTrailer(trailers, 'writer', 'patch');
  validateWriterId(writer);
  const lamport = parsePositiveIntTrailer(trailers, 'lamport', 'patch');
  const patchOid = requireTrailer(trailers, 'patchOid', 'patch');
  validateOid(patchOid, 'patchOid');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'patch');
  const encrypted = trailers[TRAILER_KEYS['encrypted'] ?? 'eg-encrypted'] === 'true';

  return { kind: 'patch', graph, writer, lamport, patchOid, schema, encrypted };
}
