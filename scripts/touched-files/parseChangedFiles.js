/**
 * @param {string} output
 * @returns {Array<{ status: string, path: string, oldPath?: string }>}
 */
export function parseChangedFiles(output) {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split('\t');
      const status = parts[0] ?? '';
      if (status.startsWith('R') || status.startsWith('C')) {
        const oldPath = parts[1];
        const path = parts[2];
        if (oldPath === undefined || path === undefined) {
          throw new Error(`Malformed rename/copy diff line: ${line}`);
        }
        return { status, path, oldPath };
      }

      const path = parts[1];
      if (path === undefined) {
        throw new Error(`Malformed diff line: ${line}`);
      }
      return { status, path };
    });
}
