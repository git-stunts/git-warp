/* @ts-self-types="./index.d.ts" */

/**
 * @module
 *
 * Visualization module for rendering WARP graph data as ASCII tables,
 * SVG diagrams, and interactive browser views. Includes ELK-based
 * graph layout, ANSI formatting utilities, and CLI renderers.
 */

// ASCII renderers
export * from './renderers/ascii/index.js';

// SVG renderer
export { renderSvg } from './renderers/svg/index.js';

// Layout engine
export {
  layoutGraph,
  queryResultToGraphData,
  pathResultToGraphData,
  rawGraphToGraphData,
  toElkGraph,
  getDefaultLayoutOptions,
  runLayout,
} from './layouts/index.js';

// Utils
export { truncate } from './utils/truncate.js';
export { timeAgo, formatDuration } from './utils/time.js';
export { padRight, padLeft, center } from './utils/unicode.js';
export { stripAnsi } from './utils/ansi.js';
