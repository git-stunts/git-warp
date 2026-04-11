/**
 * Anchor message encoding and decoding for WARP commit messages.
 *
 * Handles the 'anchor' message type which marks a merge point in the WARP DAG.
 */

import { validateGraphName } from '../../utils/RefLayout.ts';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateSchema,
} from './MessageCodecInternal.ts';
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.ts';



/** Encodes an anchor commit message. */
export function encodeAnchorMessage(params: { graph: string; schema?: number }): string {
  const { graph, schema = 2 } = params;
  validateGraphName(graph);
  validateSchema(schema);

  const codec = getCodec();
  return codec.encode({
    title: MESSAGE_TITLES['anchor'] ?? 'anchor',
    trailers: {
      [TRAILER_KEYS['kind'] ?? 'eg-kind']: 'anchor',
      [TRAILER_KEYS['graph'] ?? 'eg-graph']: graph,
      [TRAILER_KEYS['schema'] ?? 'eg-schema']: String(schema),
    },
  });
}

/** Decoded anchor message. */
export type AnchorMessage = {
  kind: 'anchor';
  graph: string;
  schema: number;
};

/** Decodes an anchor commit message. */
export function decodeAnchorMessage(message: string): AnchorMessage {
  const codec = getCodec();
  const { trailers } = codec.decode(message);

  validateKindDiscriminator(trailers, 'anchor');
  const graph = requireTrailer(trailers, 'graph', 'anchor');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'anchor');

  return { kind: 'anchor', graph, schema };
}
