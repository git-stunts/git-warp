/** Module-level cache for compiled glob regexes. */
const globRegexCache: Map<string, RegExp> = new Map();

/**
 * Escapes special regex characters in a string so it can be used as a literal match.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a cached RegExp for the given glob pattern, compiling it if needed.
 */
function getGlobRegex(pattern: string): RegExp {
  let regex = globRegexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);
    globRegexCache.set(pattern, regex);
    // Prevent unbounded cache growth. 1000 entries is generous for typical
    // usage; a full clear is simpler and cheaper than LRU for a regex cache.
    if (globRegexCache.size >= 1000) {
      globRegexCache.clear();
      globRegexCache.set(pattern, regex);
    }
  }
  return regex;
}

/**
 * Tests whether a string matches a glob-style pattern or an array of patterns.
 *
 * Supports:
 * - `*` as the default pattern, matching all strings
 * - Wildcard `*` anywhere in the pattern, matching zero or more characters
 * - Literal match when pattern contains no wildcards
 * - Array of patterns: returns true if ANY pattern matches (OR semantics)
 */
export function matchGlob(pattern: string | string[], str: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => matchGlob(p, str));
  }
  if (pattern === '*') {
    return true;
  }
  if (typeof pattern !== 'string') {
    return false;
  }
  if (!pattern.includes('*')) {
    return pattern === str;
  }
  return getGlobRegex(pattern).test(str);
}
