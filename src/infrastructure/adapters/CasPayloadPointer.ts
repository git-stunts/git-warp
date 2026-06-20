import WarpError from '../../domain/errors/WarpError.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type { BlobStorageOptions } from '../../ports/BlobStoragePort.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';

const POINTER_PREFIX = 'git-warp:cas-pointer:v1:';
const POINTER_PREFIX_BYTES = textEncode(POINTER_PREFIX);

interface BlobReader {
  readBlob(oid: string): Promise<Uint8Array>;
}

interface BlobWriter {
  writeBlob(content: Uint8Array | string): Promise<string>;
}

type PayloadBlobWriteRequest = {
  readonly blobPort: BlobWriter;
  readonly blobStorage: BlobStoragePort | null | undefined;
  readonly bytes: Uint8Array;
  readonly options?: BlobStorageOptions;
};

type PayloadBlobReadRequest = {
  readonly blobPort: BlobReader;
  readonly blobStorage: BlobStoragePort | null | undefined;
  readonly oid: string;
  readonly compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
};

function hasPointerPrefix(bytes: Uint8Array): boolean {
  if (bytes.length < POINTER_PREFIX_BYTES.length) {
    return false;
  }
  for (let index = 0; index < POINTER_PREFIX_BYTES.length; index += 1) {
    if (bytes[index] !== POINTER_PREFIX_BYTES[index]) {
      return false;
    }
  }
  return true;
}

export function encodeCasPayloadPointer(storageOid: string): Uint8Array {
  if (storageOid.length === 0) {
    throw new WarpError('CAS payload pointer requires a storage OID', 'E_INVALID_INPUT');
  }
  return textEncode(`${POINTER_PREFIX}${storageOid}`);
}

export function decodeCasPayloadPointer(bytes: Uint8Array): string | null {
  if (!hasPointerPrefix(bytes)) {
    return null;
  }
  const decoded = textDecode(bytes);
  if (!decoded.startsWith(POINTER_PREFIX)) {
    return null;
  }
  const storageOid = decoded.slice(POINTER_PREFIX.length);
  if (storageOid.length === 0) {
    throw new WarpError('CAS payload pointer is missing its storage OID', 'E_INVALID_INPUT');
  }
  return storageOid;
}

export async function writePayloadBlob(request: PayloadBlobWriteRequest): Promise<string> {
  const { blobPort, blobStorage, bytes, options } = request;
  if (blobStorage === null || blobStorage === undefined) {
    return await blobPort.writeBlob(bytes);
  }
  const storageOid = await blobStorage.store(bytes, options);
  return await blobPort.writeBlob(encodeCasPayloadPointer(storageOid));
}

export async function readPayloadBlob(request: PayloadBlobReadRequest): Promise<Uint8Array> {
  const bytes = await request.blobPort.readBlob(request.oid);
  const storageOid = decodeCasPayloadPointer(bytes);
  if (storageOid === null) {
    return inlinePayloadBytes(request, bytes);
  }
  if (request.blobStorage === null || request.blobStorage === undefined) {
    throw new WarpError(
      `Blob ${request.oid} is a CAS payload pointer but no blobStorage is configured`,
      'E_INVALID_DEPENDENCY',
    );
  }
  return await request.blobStorage.retrieve(storageOid);
}

function inlinePayloadBytes(
  request: PayloadBlobReadRequest,
  bytes: Uint8Array,
): Uint8Array {
  if (request.blobStorage !== null && request.blobStorage !== undefined) {
    requireLegacyInlinePayloadPolicy(request.oid, request.compatibilityPolicy);
  }
  return bytes;
}

function requireLegacyInlinePayloadPolicy(
  oid: string,
  policy: SubstrateCompatibilityPolicyValue | undefined,
): void {
  const resolvedPolicy = policy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  if (resolvedPolicy.legacyInlinePayloadReads) {
    return;
  }
  throw new WarpError(
    `Inline payload blob ${oid} requires the substrate migration compatibility policy`,
    'E_LEGACY_SUBSTRATE_DISABLED',
  );
}
