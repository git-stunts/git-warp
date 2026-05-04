import WarpError from '../../domain/errors/WarpError.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type { BlobStorageOptions } from '../../ports/BlobStoragePort.ts';

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

export async function readPayloadBlob(
  blobPort: BlobReader,
  blobStorage: BlobStoragePort | null | undefined,
  oid: string,
): Promise<Uint8Array> {
  const bytes = await blobPort.readBlob(oid);
  const storageOid = decodeCasPayloadPointer(bytes);
  if (storageOid === null) {
    return bytes;
  }
  if (blobStorage === null || blobStorage === undefined) {
    throw new WarpError(
      `Blob ${oid} is a CAS payload pointer but no blobStorage is configured`,
      'E_INVALID_DEPENDENCY',
    );
  }
  return await blobStorage.retrieve(storageOid);
}
