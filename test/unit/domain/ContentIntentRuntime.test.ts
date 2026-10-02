import { describe, expect, it } from 'vitest';
import Intent from '../../../src/domain/api/Intent.ts';
import IntentSequence from '../../../src/domain/api/IntentSequence.ts';
import StagedContent from '../../../src/domain/api/StagedContent.ts';
import {
  applyContentIntentToPatch, contentIntentFromOperations, contentIntentMatchesOperations,
} from '../../../src/domain/api/ContentIntentRuntime.ts';
import { applyIntentSequenceToPatch, intentSequenceFromPatch } from '../../../src/domain/api/IntentSequenceRuntime.ts';
import { inspectPublishedIntentSequence } from '../../../src/domain/api/PublishedIntentSequence.ts';
import ContentStagingAuthority from '../../../src/domain/services/ContentStagingAuthority.ts';
import EdgePropSet from '../../../src/domain/types/ops/EdgePropSet.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import PropSet from '../../../src/domain/types/ops/PropSet.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { createPatchBuilder, RecordingAssetStorage } from './services/PatchBuilderTestHarness.ts';

const EDGE = Object.freeze({ from: 'a', to: 'b', label: 'links' });

async function staged() {
  const authority = new ContentStagingAuthority();
  const content = await authority.stage({
    assetStorage: new RecordingAssetStorage(['asset:owned']), slug: 'test',
    content: 'hello', metadata: { mime: 'text/plain' },
  });
  return { authority, content };
}

function builderWithOwners() {
  return createPatchBuilder().addNode('a').addNode('b').addEdge(EDGE.from, EDGE.to, EDGE.label);
}

describe('attachment intent runtime', () => {
  it('preserves issued staged-value identity while snapshotting owner fields', async () => {
    const { content } = await staged();
    const fields = { subject: 'a', content };
    const intent = Intent.attachNodeContent(fields);
    fields.subject = 'b';
    expect(intent.descriptor).toEqual({ kind: 'node.content.attach', subject: 'a', content });
    expect('content' in intent.descriptor && intent.descriptor.content).toBe(content);
    // Structural metadata has no runtime staging provenance.
    expect(() => Intent.attachNodeContent({ subject: 'a', content: { ...content } })).toThrow();
    // @ts-expect-error Missing fields at the runtime boundary.
    expect(() => Intent.clearNodeContent(null)).toThrow();
    expect(() => Intent.clearEdgeContent({ ...EDGE, label: '' })).toThrow();
  });

  it('requires this authority and refuses independently constructed metadata', async () => {
    const { authority, content } = await staged();
    const builder = builderWithOwners();
    const before = builder.build().ops;
    const intent = Intent.attachNodeContent({ subject: 'a', content });
    expect(() => applyContentIntentToPatch(intent, builder)).toThrow(
      expect.objectContaining({ code: 'E_CONTENT_FOREIGN' }),
    );
    expect(() => applyContentIntentToPatch(intent, builder, new ContentStagingAuthority())).toThrow();
    const fabricated = Intent.attachNodeContent({ subject: 'a', content: new StagedContent(content) });
    expect(() => applyContentIntentToPatch(fabricated, builder, authority)).toThrow();
    expect(() => applyContentIntentToPatch(Intent.addNode({ subject: 'a' }), builder, authority)).toThrow();
    expect(builder.build().ops).toEqual(before);
    expect(builder.contentAssets).toEqual([]);
  });

  it('recovers node and encoded-edge attachments as retained intents with publication roots', async () => {
    const { authority, content } = await staged();
    const sequence = IntentSequence.from([
      Intent.addNode({ subject: 'a' }), Intent.addNode({ subject: 'b' }), Intent.addEdge(EDGE),
      Intent.attachNodeContent({ subject: 'a', content }), Intent.attachEdgeContent({ ...EDGE, content }),
    ]);
    const first = createPatchBuilder();
    applyIntentSequenceToPatch(sequence, first, authority);
    expect(inspectPublishedIntentSequence(sequence, first.build())).toEqual([]);
    const recovered = intentSequenceFromPatch(first.build());
    expect(recovered.kinds).toEqual(sequence.kinds);
    const replayed = createPatchBuilder();
    applyIntentSequenceToPatch(recovered, replayed);
    expect(replayed.build().ops).toEqual(first.build().ops);
    expect(replayed.contentAssets.map(String)).toEqual(['asset:owned', 'asset:owned']);
    expect(inspectPublishedIntentSequence(recovered, replayed.build())).toEqual([]);
  });

  it('recovers clear intents and canonical node/edge operations without staging', async () => {
    const { authority, content } = await staged();
    const builder = builderWithOwners();
    applyContentIntentToPatch(Intent.attachNodeContent({ subject: 'a', content }), builder, authority);
    applyContentIntentToPatch(Intent.attachEdgeContent({ ...EDGE, content }), builder, authority);
    expect(contentIntentFromOperations(builder.ops, 3)?.kind).toBe('node.content.attach');
    expect(contentIntentFromOperations(builder.ops, 6)?.kind).toBe('edge.content.attach');
    applyContentIntentToPatch(Intent.clearNodeContent({ subject: 'a' }), builder);
    applyContentIntentToPatch(Intent.clearEdgeContent(EDGE), builder);
    expect(contentIntentFromOperations(builder.ops, 9)?.kind).toBe('node.content.clear');
    expect(contentIntentFromOperations(builder.ops, 12)?.kind).toBe('edge.content.clear');
    expect(contentIntentFromOperations(builder.build().ops, 12)?.kind).toBe('edge.content.clear');
  });

  it('rejects reordered, truncated, wrong-owner and changed-value publications', async () => {
    const { content } = await staged();
    const descriptor = Intent.attachNodeContent({ subject: 'a', content }).descriptor;
    if (descriptor.kind !== 'node.content.attach') { throw new Error('invalid fixture'); }
    const operations = [
      new PropSet('a', '_content', content.id), new PropSet('a', '_content.size', content.size),
      new PropSet('a', '_content.mime', content.mime),
    ];
    expect(contentIntentMatchesOperations(descriptor, operations)).toBe(true);
    expect(contentIntentMatchesOperations(descriptor, operations.slice(1))).toBe(false);
    expect(contentIntentMatchesOperations(descriptor, [...operations].reverse())).toBe(false);
    expect(contentIntentMatchesOperations(descriptor, [
      new PropSet('b', '_content', content.id), ...operations.slice(1),
    ])).toBe(false);
    expect(contentIntentMatchesOperations(descriptor, [
      new EdgePropSet({ ...EDGE, key: '_content', value: content.id }), ...operations.slice(1),
    ])).toBe(false);
    expect(contentIntentFromOperations([operations[0]!, operations[2]!, operations[1]!], 0)).toBeNull();
    expect(contentIntentFromOperations([], 0)).toBeNull();
    expect(contentIntentFromOperations([new PropSet('a', '_content', true), ...operations.slice(1)], 0)).toBeNull();
    expect(contentIntentFromOperations([
      new PropSet('a', '_content', null), new PropSet('b', '_content.size', null),
      new PropSet('a', '_content.mime', null),
    ], 0)).toBeNull();
  });

  it('rejects valid scalar operations that do not constitute the requested attachment', async () => {
    const { authority, content } = await staged();
    const builder = builderWithOwners();
    const request = Intent.attachEdgeContent({ ...EDGE, content });
    applyContentIntentToPatch(request, builder, authority);
    const descriptor = request.descriptor;
    if (descriptor.kind !== 'edge.content.attach') { throw new Error('invalid fixture'); }
    const operations = builder.ops.slice(3);
    expect(contentIntentMatchesOperations(descriptor, operations)).toBe(true);
    expect(contentIntentMatchesOperations(descriptor, [
      new NodePropSet('a', '_content', content.id), ...operations.slice(1),
    ])).toBe(false);
    expect(contentIntentMatchesOperations(descriptor, [
      new EdgePropSet({ ...EDGE, to: 'c', key: '_content', value: content.id }), ...operations.slice(1),
    ])).toBe(false);
  });

  it('recovers singular retained attachments without MIME metadata and keeps their asset root', () => {
    const patch = new Patch({ schema: 2, writer: 'old', lamport: 1, context: {}, ops: [
      new PropSet('a', '_content', 'asset:retained'), new PropSet('a', '_content.size', 0),
      new PropSet('a', '_content.mime', null),
    ] });
    const sequence = intentSequenceFromPatch(patch);
    expect(sequence.atomic).toBe(false);
    expect(sequence.kinds).toEqual(['node.content.attach']);
    const target = builderWithOwners();
    applyIntentSequenceToPatch(sequence, target);
    expect(target.contentAssets.map(String)).toEqual(['asset:retained']);
    expect(target.build().ops.slice(3)).toEqual(patch.ops);
  });

  it('rejects tampered attachment metadata during exact publication inspection', async () => {
    const { authority, content } = await staged();
    const sequence = IntentSequence.from([
      Intent.addNode({ subject: 'a' }), Intent.attachNodeContent({ subject: 'a', content }),
    ]);
    const builder = createPatchBuilder();
    applyIntentSequenceToPatch(sequence, builder, authority);
    builder.ops[3] = new NodePropSet('a', '_content.mime', 'image/png');
    expect(() => inspectPublishedIntentSequence(sequence, builder.build())).toThrow(
      expect.objectContaining({ code: 'E_WRITE_INTENT_PUBLICATION' }),
    );
  });
});
