import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import ContentAttachmentWriteIntent from '../graph/ContentAttachmentWriteIntent.ts';
import EdgePropertyWriteIntent from '../graph/EdgePropertyWriteIntent.ts';
import NodePropertyWriteIntent from '../graph/NodePropertyWriteIntent.ts';
import type AssetHandle from '../storage/AssetHandle.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import PatchError from '../errors/PatchError.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  encodeEdgeKey,
} from './KeyCodec.ts';
import {
  requirePatchPropertyValue,
  stageContentAttachment,
  type ContentInput,
  type ContentMetadataInput,
} from './PatchBuilderContent.ts';
import { assertNoReservedBytes } from './PatchBuilderValidation.ts';
import type { WarpState } from './JoinReducer.ts';

type PatchBuilderPropertyRuntimeOptions = {
  readonly assetStorage: AssetStoragePort | null;
  readonly assertMutable: () => void;
  readonly edgesAdded: ReadonlySet<string>;
  readonly getSnapshotState: () => WarpState | null;
  readonly graphName: string;
  readonly nodesAdded: ReadonlySet<string>;
  readonly observedOperands: Set<string>;
  readonly ops: PatchOp[];
  readonly writes: Set<string>;
};

type EdgePropertyInput<T> = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly key: string;
  readonly value: T;
};

type EdgeContentInput = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly content: ContentInput;
  readonly metadata: ContentMetadataInput | undefined;
};

/** Owns property and content-attachment lowering for one PatchBuilder. */
export default class PatchBuilderPropertyRuntime {
  readonly #options: PatchBuilderPropertyRuntimeOptions;
  readonly #contentAssets: AssetHandle[] = [];
  #hasEdgeProperties = false;

  constructor(options: PatchBuilderPropertyRuntimeOptions) {
    this.#options = Object.freeze({ ...options });
  }

  get hasEdgeProperties(): boolean {
    return this.#hasEdgeProperties;
  }

  get contentAssets(): AssetHandle[] {
    return [...this.#contentAssets];
  }

  setNodeProperty<T>(nodeId: string, key: string, value: T): void {
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(key, 'key');
    const intent = NodePropertyWriteIntent.fromLegacyProperty(
      nodeId,
      key,
      requirePatchPropertyValue(value)
    );
    this.#lowerNodePropertyIntent(intent);
  }

  setEdgeProperty<T>(input: EdgePropertyInput<T>): void {
    const { from, to, label, key, value } = input;
    assertNoReservedBytes(from, 'from node ID');
    assertNoReservedBytes(to, 'to node ID');
    assertNoReservedBytes(label, 'edge label');
    assertNoReservedBytes(key, 'key');
    const intent = EdgePropertyWriteIntent.fromLegacyProperty({
      from,
      to,
      label,
      key,
      value: requirePatchPropertyValue(value),
    });
    const edgeKey = this.#assertEdgeExists(from, to, label);
    this.#lowerEdgePropertyIntent(intent);
    this.#options.observedOperands.add(edgeKey);
    this.#options.writes.add(edgeKey);
  }

  async attachNodeContent(
    nodeId: string,
    content: ContentInput,
    metadata?: ContentMetadataInput
  ): Promise<void> {
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this.#assertNodeExistsForContent(nodeId);
    const payload = await stageContentAttachment({
      assetStorage: this.#options.assetStorage,
      slug: `${this.#options.graphName}/${nodeId}`,
      content,
      metadata,
    });
    this.#options.assertMutable();
    const intent = ContentAttachmentWriteIntent.forNode(nodeId, payload);
    this.#lowerNodeContentIntent(intent);
    this.#contentAssets.push(intent.handle());
  }

  clearNodeContent(nodeId: string): void {
    assertNoReservedBytes(nodeId, 'nodeId');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this.#assertNodeExistsForContent(nodeId);
    this.setNodeProperty(nodeId, CONTENT_PROPERTY_KEY, null);
    this.setNodeProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, null);
    this.setNodeProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, null);
  }

  async attachEdgeContent(input: EdgeContentInput): Promise<void> {
    const { from, to, label, content, metadata } = input;
    assertNoReservedBytes(from, 'from');
    assertNoReservedBytes(to, 'to');
    assertNoReservedBytes(label, 'label');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this.#assertEdgeExists(from, to, label);
    const payload = await stageContentAttachment({
      assetStorage: this.#options.assetStorage,
      slug: `${this.#options.graphName}/${from}/${to}/${label}`,
      content,
      metadata,
    });
    this.#options.assertMutable();
    const intent = ContentAttachmentWriteIntent.forEdge({ from, to, label }, payload);
    this.#lowerEdgeContentIntent(intent);
    this.#contentAssets.push(intent.handle());
  }

  clearEdgeContent(from: string, to: string, label: string): void {
    assertNoReservedBytes(from, 'from');
    assertNoReservedBytes(to, 'to');
    assertNoReservedBytes(label, 'label');
    assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this.#assertEdgeExists(from, to, label);
    this.setEdgeProperty({ from, to, label, key: CONTENT_PROPERTY_KEY, value: null });
    this.setEdgeProperty({ from, to, label, key: CONTENT_SIZE_PROPERTY_KEY, value: null });
    this.setEdgeProperty({ from, to, label, key: CONTENT_MIME_PROPERTY_KEY, value: null });
  }

  #lowerNodeContentIntent(intent: ContentAttachmentWriteIntent): void {
    const nodeId = intent.nodeId();
    this.setNodeProperty(nodeId, CONTENT_PROPERTY_KEY, intent.handle().toString());
    this.setNodeProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, intent.size());
    this.setNodeProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, intent.mime());
  }

  #lowerEdgeContentIntent(intent: ContentAttachmentWriteIntent): void {
    const target = intent.edgeTarget();
    this.setEdgeProperty({
      ...target,
      key: CONTENT_PROPERTY_KEY,
      value: intent.handle().toString(),
    });
    this.setEdgeProperty({ ...target, key: CONTENT_SIZE_PROPERTY_KEY, value: intent.size() });
    this.setEdgeProperty({ ...target, key: CONTENT_MIME_PROPERTY_KEY, value: intent.mime() });
  }

  #lowerNodePropertyIntent(intent: NodePropertyWriteIntent): void {
    const nodeId = intent.nodeId();
    this.#options.ops.push(new NodePropSet(nodeId, intent.propertyKey(), intent.propertyValue()));
    this.#options.observedOperands.add(nodeId);
    this.#options.writes.add(nodeId);
  }

  #lowerEdgePropertyIntent(intent: EdgePropertyWriteIntent): void {
    const target = intent.edgeTarget();
    this.#options.ops.push(
      new EdgePropSet({
        from: target.from,
        to: target.to,
        label: target.label,
        key: intent.propertyKey(),
        value: intent.propertyValue(),
      })
    );
    this.#hasEdgeProperties = true;
  }

  #assertNodeExistsForContent(nodeId: string): void {
    if (this.#options.nodesAdded.has(nodeId)) {
      return;
    }
    const state = this.#options.getSnapshotState();
    if (!state || !state.nodeAlive.contains(nodeId)) {
      throw new PatchError(
        `Cannot attach content to unknown node '${nodeId}': add the node first`, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
        { code: 'E_PATCH_CONTENT_UNKNOWN_NODE', context: { nodeId } }
      );
    }
  }

  #assertEdgeExists(from: string, to: string, label: string): string {
    const edgeKey = encodeEdgeKey(from, to, label);
    if (!this.#options.edgesAdded.has(edgeKey)) {
      const state = this.#options.getSnapshotState();
      if (!state || !state.edgeAlive.contains(edgeKey)) {
        throw new PatchError(
          `Cannot set property on unknown edge (${from} → ${to} [${label}]): add the edge first`, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
          { code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE', context: { from, to, label } }
        );
      }
    }
    return edgeKey;
  }
}
