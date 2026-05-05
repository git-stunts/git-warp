/**
 * Entries of a branch node in the shadow trie.
 *
 * A branch node maps each populated nibble index to the OID of its
 * child node. Children may themselves be branch nodes (for interior
 * levels) or leaf nodes (for populated terminal buckets). The port
 * does not distinguish the two at this level — it just reads and
 * writes the mapping.
 *
 * ## Geometry-parameterized
 *
 * The map is keyed by **nibble index**, a non-negative integer in
 * `[0, 2^nibbleBits)` where `nibbleBits` is the trie geometry
 * setting. v1 uses 4-bit nibbles (16-way fanout, indices 0..15),
 * but the type supports any fanout the geometry cycle settles on —
 * 1, 2, 4, or 8 bits per nibble per `RouteKey`, i.e. up to 256-way.
 *
 * The type deliberately does NOT hardcode 16. Downstream callers
 * that assume fanout is 16 will break if the geometry benchmark
 * picks a different width — those callers are wrong to assume.
 *
 * ## Sparsity
 *
 * Only populated indices appear in the map. A 16-way branch with
 * only two populated children has only two entries. Adapters
 * encode sparsity into whatever the Git tree entry convention is.
 *
 * ## Ordering
 *
 * `ReadonlyMap` preserves insertion order in practice, but consumers
 * must not rely on iteration order for determinism. Adapters that
 * need canonical ordering (for content-addressed Git tree OID
 * stability) sort by nibble index at serialization time. The port
 * contract is a set of (index, oid) associations, not a sequence.
 *
 * ## Values
 *
 * Child OIDs are Git object identifiers as hex strings. The type
 * does not wrap them in a domain class — cycle 0026 is a port, not
 * an object-model refactor. An `Oid` class may appear later, at
 * which point this alias widens without churn at the port surface.
 */
export type TrieBranchEntries = ReadonlyMap<number, string>;

export default TrieBranchEntries;
