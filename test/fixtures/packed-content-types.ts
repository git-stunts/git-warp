import type { Lane, ContentInput, ContentAttachment, StagedContent } from '@git-stunts/git-warp';
import { intent, createNodeContentObserver, createEdgeContentObserver } from '@git-stunts/git-warp/advanced';

declare const lane: Lane;
declare const input: ContentInput;
const edge = { from: 'document', to: 'related', label: 'links' };
const staged: StagedContent = await lane.stageContent(input, { mime: 'text/plain', size: 8 });
await lane.write([
  intent.node.attachContent({ subject: 'document', content: staged }),
  intent.edge.attachContent({ ...edge, content: staged }),
  intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(edge),
]);
const node: ContentAttachment | null = (await lane.observe(createNodeContentObserver({ subject: 'document' })).one()).value;
const attachedEdge: ContentAttachment | null = (await lane.observe(createEdgeContentObserver(edge)).one()).value;
for (const value of [node, attachedEdge]) {
  if (value === null) { continue; }
  const bytes: AsyncIterable<Uint8Array> = value.open();
  const mime: string | null = value.mime;
  const size: number | null = value.size;
  void bytes; void mime; void size;
  // @ts-expect-error Attachment reads do not expose an eager byte getter.
  value.bytes();
}
// @ts-expect-error Raw bytes cannot authorize publication.
intent.node.attachContent({ subject: 'document', content: new Uint8Array([1]) });
// @ts-expect-error Opaque handle text cannot authorize publication.
intent.edge.attachContent({ ...edge, content: staged.id });
// @ts-expect-error Edge operations require the complete owner identity.
intent.edge.clearContent({ from: edge.from, to: edge.to });
// @ts-expect-error Staging metadata remains immutable.
staged.size = 3;
