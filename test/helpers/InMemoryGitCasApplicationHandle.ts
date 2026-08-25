import {
  AssetHandle,
  BundleHandle,
  PageHandle,
  type ApplicationHandle,
  type ApplicationHandleInput,
} from '@git-stunts/git-cas';

/** Parses the application-handle input union without compile-time casts. */
export function parseInMemoryApplicationHandle(
  input: ApplicationHandleInput,
): ApplicationHandle {
  if (input instanceof AssetHandle || input instanceof BundleHandle || input instanceof PageHandle) {
    return input;
  }
  if (typeof input === 'string') {
    return parseApplicationHandleToken(input);
  }
  if (input.kind === 'asset' || input.format === 'manifest-tree') {
    return AssetHandle.from({
      codec: requireStructuredCodec(input.codec, 'asset'),
      oid: input.oid,
      ...(input.hashAlgorithm === undefined ? {} : { hashAlgorithm: input.hashAlgorithm }),
    });
  }
  if (input.kind === 'bundle' || input.format === 'fanout-tree') {
    return BundleHandle.from({
      codec: requireStructuredCodec(input.codec, 'bundle'),
      oid: input.oid,
      ...(input.hashAlgorithm === undefined ? {} : { hashAlgorithm: input.hashAlgorithm }),
    });
  }
  if (input.codec !== undefined && input.codec !== 'raw') {
    throw new Error('In-memory page handle requires the raw codec');
  }
  return PageHandle.from({
    oid: input.oid,
    ...(input.hashAlgorithm === undefined ? {} : { hashAlgorithm: input.hashAlgorithm }),
  });
}

function parseApplicationHandleToken(token: string): ApplicationHandle {
  try {
    return AssetHandle.parse(token);
  } catch {
    try {
      return BundleHandle.parse(token);
    } catch {
      return PageHandle.parse(token);
    }
  }
}

function requireStructuredCodec(
  codec: string | undefined,
  kind: 'asset' | 'bundle',
): string {
  if (codec === undefined || codec.length === 0) {
    throw new Error(`In-memory ${kind} handle requires a codec`);
  }
  return codec;
}
