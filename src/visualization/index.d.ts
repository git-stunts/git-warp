/**
 * Visualization module for rendering WARP graph data as ASCII tables,
 * SVG diagrams, and interactive browser views.
 *
 * @module
 */

// ASCII renderers
export declare const colors: Record<string, (s: string) => string>;
export declare const colorsDefault: Record<string, (s: string) => string>;
export declare function createBox(content: string, options?: Record<string, unknown>): string;
export declare function createTable(rows: unknown[], options?: Record<string, unknown>): string;
export declare function progressBar(current: number, total: number, options?: Record<string, unknown>): string;
export declare function renderInfoView(data: Record<string, unknown>): string;
export declare function renderCheckView(data: Record<string, unknown>): string;
export declare function renderMaterializeView(data: Record<string, unknown>): string;
export declare function renderHistoryView(data: Record<string, unknown>): string;
export declare function summarizeOps(ops: unknown[]): string;
export declare function renderPathView(data: Record<string, unknown>): string;
export declare function renderGraphView(data: Record<string, unknown>): string;

// SVG renderer
export declare function renderSvg(positionedGraph: Record<string, unknown>, options?: Record<string, unknown>): string;

// Layout engine
export declare function layoutGraph(graphData: { nodes: unknown[]; edges: unknown[] }, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function queryResultToGraphData(result: Record<string, unknown>): { nodes: unknown[]; edges: unknown[] };
export declare function pathResultToGraphData(result: Record<string, unknown>): { nodes: unknown[]; edges: unknown[] };
export declare function rawGraphToGraphData(result: Record<string, unknown>): { nodes: unknown[]; edges: unknown[] };
export declare function toElkGraph(graphData: { nodes: unknown[]; edges: unknown[] }, options?: Record<string, unknown>): Record<string, unknown>;
export declare function getDefaultLayoutOptions(): Record<string, string>;
export declare function runLayout(elkGraph: Record<string, unknown>): Promise<Record<string, unknown>>;

// Utils
export declare function truncate(str: string, maxWidth: number): string;
export declare function timeAgo(dateStr: string): string;
export declare function formatDuration(ms: number): string;
export declare function padRight(str: string, width: number): string;
export declare function padLeft(str: string, width: number): string;
export declare function center(str: string, width: number): string;
export declare function stripAnsi(str: string): string;
