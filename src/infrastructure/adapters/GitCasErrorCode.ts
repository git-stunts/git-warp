/** Reads a machine code from an untrusted git-cas failure. */
export function readGitCasErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' ? error.code : null;
}

/** Reads the observed byte count from an untrusted git-cas size refusal, or null. */
export function readGitCasObservedBytes(error: unknown): number | null {
  const meta = readGitCasMeta(error);
  if (meta === null || !('observedBytes' in meta)) {
    return null;
  }
  return typeof meta.observedBytes === 'number' ? meta.observedBytes : null;
}

function readGitCasMeta(error: unknown): object | null {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return null;
  }
  return typeof error.meta === 'object' ? error.meta : null;
}
