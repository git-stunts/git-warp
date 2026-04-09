/**
 * @param {string} touch
 * @param {{ loc: number, freeze: string, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number }} metrics
 * @param {number} limit
 * @returns {string}
 */
export function scoreStatus(touch, metrics, limit) {
  if (touch === 'js-body') {
    return 'red';
  }
  if (
    metrics.loc > limit ||
    metrics.unknownCount > 0 ||
    metrics.asCount > 0 ||
    metrics.anyCount > 0 ||
    metrics.typedefCount > 0 ||
    metrics.enumCount > 0 ||
    metrics.exportCount > 1
  ) {
    return 'red';
  }
  if (touch === 'js-import' || metrics.freeze === 'review') {
    return 'yellow';
  }
  return 'green';
}
