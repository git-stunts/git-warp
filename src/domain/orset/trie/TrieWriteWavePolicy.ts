export const TRIE_LEAF_WRITE_WAVE_MAX_BYTES = 32 * 1024 * 1024;
export const TRIE_LEAF_WRITE_WAVE_MAX_ITEMS = 256;
export const TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS = 64;

export function shouldFlushLeafWriteWave(options: Readonly<{
  byteLength: number;
  itemCount: number;
  nextByteLength: number;
}>): boolean {
  return options.itemCount > 0 && (
    options.itemCount >= TRIE_LEAF_WRITE_WAVE_MAX_ITEMS ||
    options.byteLength + options.nextByteLength > TRIE_LEAF_WRITE_WAVE_MAX_BYTES
  );
}

export function shouldFlushBranchWriteWave(options: Readonly<{
  depth: number;
  itemCount: number;
  nextDepth: number;
}>): boolean {
  return options.depth !== -1 && (
    options.nextDepth !== options.depth ||
    options.itemCount >= TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS
  );
}
