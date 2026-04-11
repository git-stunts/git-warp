/**
 * Checkpoint message encoding and decoding for WARP commit messages.
 */

import { validateGraphName } from '../../utils/RefLayout.ts';
import { isV5CheckpointSchema } from '../state/CheckpointService.js';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validateSha256,
  validateSchema,
} from './MessageCodecInternal.ts';
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.ts';



/** Encodes a checkpoint commit message. */
export function encodeCheckpointMessage(params: {
  graph: string;
  stateHash: string;
  frontierOid: string;
  indexOid: string;
  schema?: number;
}): string {
  const { graph, stateHash, frontierOid, indexOid, schema = 2 } = params;
  validateGraphName(graph);
  validateSha256(stateHash, 'stateHash');
  validateOid(frontierOid, 'frontierOid');
  validateOid(indexOid, 'indexOid');
  validateSchema(schema);

  const codec = getCodec();
  const trailers: Record<string, string> = {
    [TRAILER_KEYS['kind'] ?? 'eg-kind']: 'checkpoint',
    [TRAILER_KEYS['graph'] ?? 'eg-graph']: graph,
    [TRAILER_KEYS['stateHash'] ?? 'eg-state-hash']: stateHash,
    [TRAILER_KEYS['frontierOid'] ?? 'eg-frontier-oid']: frontierOid,
    [TRAILER_KEYS['indexOid'] ?? 'eg-index-oid']: indexOid,
    [TRAILER_KEYS['schema'] ?? 'eg-schema']: String(schema),
  };

  if (isV5CheckpointSchema(schema)) {
    trailers[TRAILER_KEYS['checkpointVersion'] ?? 'eg-checkpoint'] = 'v5';
  }

  return codec.encode({
    title: MESSAGE_TITLES['checkpoint'] ?? 'warp:checkpoint',
    trailers,
  });
}

/** Decoded checkpoint message. */
export type CheckpointMessage = {
  kind: 'checkpoint';
  graph: string;
  stateHash: string;
  frontierOid: string;
  indexOid: string;
  schema: number;
  checkpointVersion: string | null;
};

/** Decodes a checkpoint commit message. */
export function decodeCheckpointMessage(message: string): CheckpointMessage {
  const codec = getCodec();
  const { trailers } = codec.decode(message);

  validateKindDiscriminator(trailers, 'checkpoint');
  const graph = requireTrailer(trailers, 'graph', 'checkpoint');
  validateGraphName(graph);
  const stateHash = requireTrailer(trailers, 'stateHash', 'checkpoint');
  validateSha256(stateHash, 'stateHash');
  const frontierOid = requireTrailer(trailers, 'frontierOid', 'checkpoint');
  validateOid(frontierOid, 'frontierOid');
  const indexOid = requireTrailer(trailers, 'indexOid', 'checkpoint');
  validateOid(indexOid, 'indexOid');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'checkpoint');

  const cpVersion = trailers['eg-checkpoint'];
  const checkpointVersion = (cpVersion !== undefined && cpVersion !== '') ? cpVersion : null;

  return { kind: 'checkpoint', graph, stateHash, frontierOid, indexOid, schema, checkpointVersion };
}
