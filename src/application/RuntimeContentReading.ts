import type AssetStoragePort from '../ports/AssetStoragePort.ts';
import type ContentAttachmentPayload from '../domain/graph/ContentAttachmentPayload.ts';
import ContentAttachment from '../domain/api/ContentAttachment.ts';
import type ContentOwner from '../domain/api/ContentOwner.ts';
import AssetHandle from '../domain/storage/AssetHandle.ts';
import type RuntimeActivity from './RuntimeActivity.ts';

/** Composes an immutable content value with a lazy, Runtime-owned stream lease. */
export function createContentReadingValue(fields: {
  payload: ContentAttachmentPayload;
  owner: ContentOwner;
  storage: AssetStoragePort;
  activity: RuntimeActivity;
}): ContentAttachment {
  const { payload, storage, activity } = fields;
  const handle = new AssetHandle(payload.handle.toString());
  return new ContentAttachment({
    id: handle.toString(), mime: payload.mime?.toString() ?? null, size: payload.size?.toNumber() ?? null,
    owner: fields.owner.descriptor,
    open: () => openContent(storage, handle, activity),
  });
}

async function* openContent(
  storage: AssetStoragePort, handle: AssetHandle, activity: RuntimeActivity,
): AsyncIterable<Uint8Array> {
  const lease = activity.acquire();
  try { yield* storage.open(handle); }
  finally { lease.release(); }
}
