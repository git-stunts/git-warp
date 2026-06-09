import type { BlobStorageOptions } from '../../ports/BlobStoragePort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import PatchError from '../errors/PatchError.ts';
import ContentAttachmentMime from '../graph/ContentAttachmentMime.ts';
import ContentAttachmentOid from '../graph/ContentAttachmentOid.ts';
import ContentAttachmentPayload from '../graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../graph/ContentAttachmentSize.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import { isStreamingInput, normalizeToAsyncIterable } from '../utils/streamUtils.ts';
import { normalizeContentMetadata } from './PatchBuilderValidation.ts';

export type ContentInput = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string;
export type ContentMetadataInput = { mime?: string | null; size?: number | null };

export type StoreContentAttachmentPayloadOptions = {
  readonly blobStorage: BlobStoragePort;
  readonly content: ContentInput;
  readonly metadata: ContentMetadataInput | undefined;
  readonly slug: string;
};

type BufferedContentAttachmentPayloadOptions = Omit<StoreContentAttachmentPayloadOptions, 'content'> & {
  readonly content: Uint8Array | string;
};

type StreamingContentMetadata = {
  readonly mime: ContentAttachmentMime | null;
  readonly size: ContentAttachmentSize | null;
};

/** Validates public patch property values before intent construction. */
export function requirePatchPropertyValue<T>(value: T): PropValue {
  if (isPropValue(value)) {
    return value;
  }
  throw new PatchError('Property value must be property-compatible data', {
    code: 'E_PATCH_INVALID_PROPERTY_VALUE',
  });
}

export async function storeContentAttachmentPayload(
  options: StoreContentAttachmentPayloadOptions,
): Promise<ContentAttachmentPayload> {
  if (isBufferedContent(options.content)) {
    return await storeBufferedContentAttachmentPayload({
      blobStorage: options.blobStorage,
      content: options.content,
      metadata: options.metadata,
      slug: options.slug,
    });
  }
  return await storeStreamingContentAttachmentPayload(options);
}

async function storeBufferedContentAttachmentPayload(
  options: BufferedContentAttachmentPayloadOptions,
): Promise<ContentAttachmentPayload> {
  const normalizedMeta = normalizeContentMetadata(options.content, options.metadata);
  const storageOptions = contentStorageOptions(options.slug, normalizedMeta.mime, normalizedMeta.size);
  const oid = await options.blobStorage.store(options.content, storageOptions);
  return contentAttachmentPayload(oid, normalizedMeta.mime, normalizedMeta.size);
}

async function storeStreamingContentAttachmentPayload(
  options: StoreContentAttachmentPayloadOptions,
): Promise<ContentAttachmentPayload> {
  const metadata = streamingContentMetadata(options.metadata);
  const storageOptions = contentStorageOptions(
    options.slug,
    contentAttachmentMimeString(metadata.mime),
    contentAttachmentSizeNumber(metadata.size),
  );
  const oid = await options.blobStorage.storeStream(
    normalizeToAsyncIterable(options.content),
    storageOptions,
  );
  return new ContentAttachmentPayload({
    oid: new ContentAttachmentOid(oid),
    mime: metadata.mime,
    size: metadata.size,
  });
}

function streamingContentMetadata(
  metadata: ContentMetadataInput | undefined,
): StreamingContentMetadata {
  return {
    mime: contentAttachmentMime(metadata?.mime ?? null),
    size: contentAttachmentSize(metadata?.size ?? null),
  };
}

function contentAttachmentMimeString(mime: ContentAttachmentMime | null): string | null {
  return mime === null ? null : mime.toString();
}

function contentAttachmentSizeNumber(size: ContentAttachmentSize | null): number | null {
  return size === null ? null : size.toNumber();
}

function isBufferedContent(content: ContentInput): content is Uint8Array | string {
  return !isStreamingInput(content);
}

function contentAttachmentPayload(
  oid: string,
  mime: string | null,
  size: number | null,
): ContentAttachmentPayload {
  return new ContentAttachmentPayload({
    oid: new ContentAttachmentOid(oid),
    mime: contentAttachmentMime(mime),
    size: contentAttachmentSize(size),
  });
}

function contentAttachmentMime(mime: string | null): ContentAttachmentMime | null {
  return mime === null ? null : new ContentAttachmentMime(mime);
}

function contentAttachmentSize(size: number | null): ContentAttachmentSize | null {
  return size === null ? null : new ContentAttachmentSize(size);
}

function contentStorageOptions(
  slug: string,
  mime: string | null,
  size: number | null,
): BlobStorageOptions {
  return { slug, mime, size };
}
