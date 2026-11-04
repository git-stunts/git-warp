const FORBIDDEN_WORDS = new Set([
  'materialize', 'materialization', 'checkpoint', 'checkpoints',
  'frontier', 'frontiers', 'basis', 'cut', 'cuts', 'lane', 'lanes', 'runtime',
]);
const MUTABLE_GRAPH_NAMES = new Set(['Graph', 'WarpGraph', 'WarpCore']);

/** Public graph-shaped plans are allowed; a mutable graph object is not. */
export default function forbiddenPublicNouns(name: string): readonly string[] {
  const words = name
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/gu, '$1 $2')
    .toLowerCase().split(/[^a-z0-9]+/u);
  const found = words.filter((word) => FORBIDDEN_WORDS.has(word));
  if (MUTABLE_GRAPH_NAMES.has(name)) found.push('mutable-graph');
  if (/capture.?coordinate/iu.test(name)) found.push('capture-coordinate');
  return Object.freeze([...new Set(found)].sort());
}
