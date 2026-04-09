/**
 * @param {string} path
 * @returns {{ kind: string, limit: number }}
 */
export function classifyPath(path) {
  if (path.startsWith('test/')) {
    return { kind: 'test', limit: 800 };
  }
  if (path.startsWith('bin/') || path.startsWith('scripts/')) {
    return { kind: 'bin', limit: 300 };
  }
  return { kind: 'source', limit: 500 };
}
