/**
 * ELK layout runner: lazy-loads elkjs and executes layout.
 *
 * The ELK engine (~2.5 MB) is loaded via dynamic import() only when
 * a layout is actually requested, keeping normal CLI startup fast.
 */

/**
 * @typedef {{ id: string, x?: number, y?: number, width?: number, height?: number, labels?: Array<{ text: string }> }} ElkResultChild
 * @typedef {{ id: string, sources?: string[], targets?: string[], labels?: Array<{ text: string }>, sections?: unknown[] }} ElkResultEdge
 * @typedef {{ children?: ElkResultChild[], edges?: ElkResultEdge[], width?: number, height?: number }} ElkResult
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, label?: string }} PosNode
 * @typedef {{ x: number, y: number }} LayoutPoint
 * @typedef {{ startPoint?: LayoutPoint, endPoint?: LayoutPoint, bendPoints?: LayoutPoint[] }} LayoutSection
 * @typedef {{ id: string, source: string, target: string, label?: string, sections?: LayoutSection[] }} PosEdge
 * @typedef {{ nodes: PosNode[], edges: PosEdge[], width: number, height: number }} PositionedGraph
 * @typedef {{ id: string, children?: Array<{ id: string, width?: number, height?: number, labels?: Array<{ text: string }> }>, edges?: Array<{ id: string, sources?: string[], targets?: string[], labels?: Array<{ text: string }> }>, layoutOptions?: Record<string, string> }} ElkGraphInput
 * @typedef {{ layout: (graph: ElkGraphInput) => Promise<ElkResult> }} ElkEngine
 */

/** Default node dimensions for missing ELK values. */
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 40;
const FALLBACK_GAP = 40;
const FALLBACK_Y = 20;
const FALLBACK_X_START = 20;

/** @type {Promise<unknown> | null} */
let elkPromise = null;

/**
 * Returns (or creates) a singleton ELK instance.
 * @returns {Promise<ElkEngine>} ELK instance
 */
function getElk() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then(
      (mod) => /** @type {ElkEngine} */ (new /** @type {{ new(): ElkEngine }} */ (mod.default)()),
    );
  }
  return /** @type {Promise<ElkEngine>} */ (elkPromise);
}

/**
 * Runs ELK layout on a graph and returns a PositionedGraph.
 *
 * @param {ElkGraphInput} elkGraph - ELK-format graph from toElkGraph()
 * @returns {Promise<PositionedGraph>} PositionedGraph
 */
export async function runLayout(elkGraph) {
  /** @type {ElkResult | undefined} */
  let result;
  try {
    const elk = await getElk();
    result = await elk.layout(elkGraph);
  } catch {
    return fallbackLayout(elkGraph);
  }
  return toPositionedGraph(result);
}

/**
 * Extracts the first label text from a labels array, or returns the fallback.
 * @param {Array<{ text: string }> | undefined} labels
 * @param {string} fallback
 * @returns {string}
 */
function firstLabel(labels, fallback) {
  if (labels !== undefined && labels !== null && labels.length > 0) {
    return labels[0].text;
  }
  return fallback;
}

/**
 * Extracts the first element of an array, or returns the fallback.
 * @param {string[] | undefined} arr
 * @param {string} fallback
 * @returns {string}
 */
function firstOrDefault(arr, fallback) {
  if (arr !== undefined && arr !== null && arr.length > 0) {
    return arr[0];
  }
  return fallback;
}

/**
 * Maps an ELK result child to a PosNode.
 * @param {ElkResultChild} c
 * @returns {PosNode}
 */
function mapChildToNode(c) {
  return {
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? DEFAULT_WIDTH,
    height: c.height ?? DEFAULT_HEIGHT,
    label: firstLabel(c.labels, c.id),
  };
}

/**
 * Maps an ELK result edge to a PosEdge.
 * @param {ElkResultEdge} e
 * @returns {PosEdge}
 */
function mapResultEdge(e) {
  return {
    id: e.id,
    source: firstOrDefault(e.sources, ''),
    target: firstOrDefault(e.targets, ''),
    label: firstLabel(e.labels, undefined),
    sections: /** @type {LayoutSection[]} */ (e.sections ?? []),
  };
}

/**
 * Returns the children array from an ELK result, defaulting to empty.
 * @param {ElkResult | undefined} r
 * @returns {ElkResultChild[]}
 */
function resultChildren(r) {
  return r?.children ?? [];
}

/**
 * Returns the edges array from an ELK result, defaulting to empty.
 * @param {ElkResult | undefined} r
 * @returns {ElkResultEdge[]}
 */
function resultEdges(r) {
  return r?.edges ?? [];
}

/**
 * Returns the width from an ELK result, defaulting to 0.
 * @param {ElkResult | undefined} r
 * @returns {number}
 */
function resultWidth(r) {
  return r?.width ?? 0;
}

/**
 * Returns the height from an ELK result, defaulting to 0.
 * @param {ElkResult | undefined} r
 * @returns {number}
 */
function resultHeight(r) {
  return r?.height ?? 0;
}

/**
 * Converts ELK output to a PositionedGraph.
 * @param {ElkResult | undefined} result
 * @returns {PositionedGraph}
 */
function toPositionedGraph(result) {
  return {
    nodes: resultChildren(result).map(mapChildToNode),
    edges: resultEdges(result).map(mapResultEdge),
    width: resultWidth(result),
    height: resultHeight(result),
  };
}

/**
 * Maps a fallback input child to a PosNode with horizontal positioning.
 * @param {{ id: string, width?: number, height?: number, labels?: Array<{ text: string }> }} c
 * @param {number} xPos - Horizontal offset for placement
 * @returns {PosNode}
 */
function mapFallbackChild(c, xPos) {
  return {
    id: c.id,
    x: xPos,
    y: FALLBACK_Y,
    width: c.width ?? DEFAULT_WIDTH,
    height: c.height ?? DEFAULT_HEIGHT,
    label: firstLabel(c.labels, c.id),
  };
}

/**
 * Maps a fallback input edge to a PosEdge.
 * @param {{ id: string, sources?: string[], targets?: string[], labels?: Array<{ text: string }> }} e
 * @returns {PosEdge}
 */
function mapFallbackEdge(e) {
  return {
    id: e.id,
    source: firstOrDefault(e.sources, ''),
    target: firstOrDefault(e.targets, ''),
    label: firstLabel(e.labels, undefined),
    sections: [],
  };
}

/**
 * Fallback: line nodes up horizontally when ELK fails.
 * @param {ElkGraphInput} elkGraph
 * @returns {PositionedGraph}
 */
function fallbackLayout(elkGraph) {
  let x = FALLBACK_X_START;
  const children = elkGraph.children ?? [];
  const nodes = children.map((c) => {
    const node = mapFallbackChild(c, x);
    x += (c.width ?? DEFAULT_WIDTH) + FALLBACK_GAP;
    return node;
  });

  const edges = (elkGraph.edges ?? []).map(mapFallbackEdge);
  return { nodes, edges, width: x, height: DEFAULT_HEIGHT + FALLBACK_Y + FALLBACK_Y };
}
