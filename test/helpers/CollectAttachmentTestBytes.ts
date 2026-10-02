import type QueryCapability from '../../src/domain/capabilities/QueryCapability.ts';
import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';

const MAX_TEST_ATTACHMENT_BYTES = 64 * 1024 * 1024;

/** Test assertions may collect small fixtures; production attachment reads stream. */
export async function collectNodeContent(
  graph: Pick<QueryCapability, 'getContentStream'>,
  nodeId: string,
): Promise<Uint8Array | null> {
  const source = await graph.getContentStream(nodeId);
  return source === null ? null : await collectAsyncIterable(source, MAX_TEST_ATTACHMENT_BYTES);
}

export async function collectEdgeContent(
  graph: Pick<QueryCapability, 'getEdgeContentStream'>,
  edge: Readonly<{ from: string; to: string; label: string }>,
): Promise<Uint8Array | null> {
  const source = await graph.getEdgeContentStream(edge.from, edge.to, edge.label);
  return source === null ? null : await collectAsyncIterable(source, MAX_TEST_ATTACHMENT_BYTES);
}
