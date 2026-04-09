/**
 * @param {string} output
 * @returns {number}
 */
export function extractTypecheckErrorCount(output) {
  return (output.match(/error TS\d+:/g) ?? []).length;
}
