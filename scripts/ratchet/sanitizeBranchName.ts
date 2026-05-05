/**
 * @param {string} branch
 * @returns {string}
 */
export function sanitizeBranchName(branch: string): string {
  return branch.replace(/^cycle\//, '').replace(/[^A-Za-z0-9._-]+/g, '-');
}
