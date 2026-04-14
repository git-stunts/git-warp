/**
 * @param {string} output
 * @returns {number}
 */
export function extractTypecheckErrorCount(output: string): number {
  return (output.match(/error TS\d+:/g) ?? []).length;
}
