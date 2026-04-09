/**
 * @param {{ fromLabel: string, toLabel: string, branch: string, deltas: Record<string, number> }} delta
 * @returns {string}
 */
export function formatDelta(delta) {
  const lines = [`Ratchet delta on ${delta.branch}: ${delta.fromLabel} -> ${delta.toLabel}`];
  for (const [key, value] of Object.entries(delta.deltas)) {
    const sign = value > 0 ? '+' : '';
    lines.push(`${key}: ${sign}${value}`);
  }
  return lines.join('\n');
}
