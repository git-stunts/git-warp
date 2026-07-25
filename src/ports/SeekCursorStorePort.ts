export type SeekCursorState = {
  readonly tick: number;
  readonly mode?: string;
  readonly nodes?: number;
  readonly edges?: number;
  readonly frontierHash?: string;
};

export type NamedSeekCursorState = SeekCursorState & {
  readonly name: string;
};

export type SeekCursorSweepResult = {
  readonly removed: number;
  readonly generation: string | null;
};

/**
 * Graph-scoped storage for active and named seek cursor state.
 *
 * Implementations retain immutable cursor bytes behind lifecycle-owned handles.
 * Active cursor state may expire; named bookmarks remain until explicitly
 * removed.
 */
export default interface SeekCursorStorePort {
  readActive(): Promise<SeekCursorState | null>;
  writeActive(cursor: SeekCursorState): Promise<void>;
  clearActive(): Promise<void>;
  readSaved(name: string): Promise<SeekCursorState | null>;
  writeSaved(name: string, cursor: SeekCursorState): Promise<void>;
  deleteSaved(name: string): Promise<void>;
  listSaved(): Promise<ReadonlyArray<NamedSeekCursorState>>;
  sweep(): Promise<SeekCursorSweepResult>;
}
