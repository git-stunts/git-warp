import ContentAttachmentHandle from '../graph/ContentAttachmentHandle.ts';
import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import ContentAttachmentPayload from '../graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../graph/ContentAttachmentSize.ts';
import PatchError from '../errors/PatchError.ts';
import WriterError from '../errors/WriterError.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type { AssetWriteOptions } from '../../ports/AssetStoragePort.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import { isStreamingInput, normalizeToAsyncIterable } from '../utils/streamUtils.ts';
import { normalizeContentMetadata } from './PatchBuilderValidation.ts';

export type ContentInput =
  | AsyncIterable<Uint8Array>
  | ReadableStream<Uint8Array>
  | Uint8Array
  | string;
export type ContentMetadataInput = { mime?: string | null; size?: number | null };

export type StoreContentAttachmentPayloadOptions = {
  readonly assetStorage: AssetStoragePort;
  readonly content: ContentInput;
  readonly metadata: ContentMetadataInput | undefined;
  readonly slug: string;
};

export type StageContentAttachmentOptions =
  Omit<StoreContentAttachmentPayloadOptions, 'assetStorage'>
  & { readonly assetStorage: AssetStoragePort | null };

/** Validates public patch property values before intent construction. */
export function requirePatchPropertyValue<T>(value: T): PropValue {
  if (isPropValue(value)) {
    return value;
  }
  throw new PatchError('Property value must be property-compatible data', {
    code: 'E_PATCH_INVALID_PROPERTY_VALUE',
  });
}

/**
 * Requires asset storage, then stages one content attachment.
 *
 * Shared by node and edge attachment so the storage precondition is stated
 * once rather than duplicated per target shape.
 */
export async function stageContentAttachment(
  options: StageContentAttachmentOptions,
): Promise<ContentAttachmentPayload> {
  const { assetStorage } = options;
  if (assetStorage === null) {
    throw new WriterError('Cannot attach content without asset storage', { code: 'NO_ASSET_STORAGE' });
  }
  return await storeContentAttachmentPayload({ ...options, assetStorage });
}

export async function storeContentAttachmentPayload(
  options: StoreContentAttachmentPayloadOptions,
): Promise<ContentAttachmentPayload> {
  const metadata = contentMetadata(options.content, options.metadata);
  const staged = await options.assetStorage.stage(
    normalizeToAsyncIterable(options.content),
    assetWriteOptions(options.slug, metadata.expectedSize),
  );
  return new ContentAttachmentPayload({
    handle: new ContentAttachmentHandle(staged.handle.toString()),
    mime: metadata.mime === null ? null : new ContentAttachmentMime(metadata.mime),
    size: new ContentAttachmentSize(staged.size),
  });
}

function contentMetadata(
  content: ContentInput,
  metadata: ContentMetadataInput | undefined,
): { readonly mime: string | null; readonly expectedSize: number | null } {
  if (!isStreamingInput(content)) {
    const normalized = normalizeContentMetadata(content, metadata);
    return { mime: normalized.mime, expectedSize: normalized.size };
  }
  return streamingContentMetadata(metadata);
}

function streamingContentMetadata(
  metadata: ContentMetadataInput | undefined,
): { readonly mime: string | null; readonly expectedSize: number | null } {
  return {
    mime: optionalMime(metadataMime(metadata)),
    expectedSize: optionalSize(metadataSize(metadata)),
  };
}

function metadataMime(metadata: ContentMetadataInput | undefined): string | null {
  return metadata?.mime ?? null;
}

function metadataSize(metadata: ContentMetadataInput | undefined): number | null {
  return metadata?.size ?? null;
}

function optionalMime(value: string | null): string | null {
  return value === null ? null : new ContentAttachmentMime(value).toString();
}

function optionalSize(value: number | null): number | null {
  return value === null ? null : new ContentAttachmentSize(value).toNumber();
}

function assetWriteOptions(
  slug: string,
  expectedSize: number | null,
): AssetWriteOptions {
  return { slug, filename: 'content', expectedSize };
}
