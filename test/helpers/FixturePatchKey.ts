import { AssetHandle as GitCasAssetHandle } from '@git-stunts/git-cas';

export function fixturePatchKey(handle: string): string {
  try {
    return GitCasAssetHandle.parse(handle).oid;
  } catch {
    return handle;
  }
}
