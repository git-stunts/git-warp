/**
 * Shared Unicode symbol constants for ASCII renderers.
 *
 * Extracted from history.js, info.js, path.js, and graph.js to eliminate
 * duplicate character constant definitions across renderers.
 */

/** Timeline characters for patch history and writer timelines. */
export const TIMELINE = {
  vertical: '\u2502',     // │
  dot: '\u25CF',          // ●
  connector: '\u251C',    // ├
  end: '\u2514',          // └
  top: '\u250C',          // ┌
  line: '\u2500',         // ─
};

/** Arrow characters for path and graph visualization. */
export const ARROW = {
  line: '\u2500',      // ─
  right: '\u25B6',     // ▶
  left: '\u25C0',      // ◀
  down: '\u25BC',      // ▼
  up: '\u25B2',        // ▲
};

/** Tree characters for hierarchical displays. */
export const TREE = {
  branch: '\u251C',    // ├
  last: '\u2514',      // └
  vertical: '\u2502',  // │
  space: ' ',
};
