/**
 * Durable cursor I/O helpers for the seek command.
 * Extracted from seek.ts to keep file size under 500 LOC.
 */
import type SeekCursorStorePort from '../../../src/ports/SeekCursorStorePort.ts';
import type { CursorBlob } from '../types.ts';

/** Removes the active seek cursor for a graph, returning to present state. */
export async function clearActiveCursor(cursorStore: SeekCursorStorePort): Promise<void> {
  await cursorStore.clearActive();
}

/** Reads a named saved cursor from git-cas retention. */
export async function readSavedCursor(cursorStore: SeekCursorStorePort, name: string): Promise<CursorBlob | null> {
  return await cursorStore.readSaved(name);
}

/** Persists a cursor as a durable named bookmark. */
export async function writeSavedCursor(cursorStore: SeekCursorStorePort, name: string, cursor: CursorBlob): Promise<void> {
  await cursorStore.writeSaved(name, cursor);
}

/** Deletes a durable named cursor bookmark. */
export async function deleteSavedCursor(cursorStore: SeekCursorStorePort, name: string): Promise<void> {
  await cursorStore.deleteSaved(name);
}

/** Lists all saved cursors for a graph. */
export async function listSavedCursors(cursorStore: SeekCursorStorePort): Promise<ReadonlyArray<{ name: string; tick: number; mode?: string }>> {
  return await cursorStore.listSaved();
}
