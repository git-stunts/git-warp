/**
 * Cursor I/O helpers for the seek command.
 * Extracted from seek.ts to keep file size under 500 LOC.
 */
import { textEncode } from '../../../src/domain/utils/bytes.ts';
import {
  buildCursorActiveRef,
  buildCursorSavedRef,
  buildCursorSavedPrefix,
} from '../../../src/domain/utils/RefLayout.ts';
import { parseCursorBlob } from '../../../src/domain/utils/parseCursorBlob.ts';
import type { Persistence, CursorBlob } from '../types.ts';

/** Removes the active seek cursor for a graph, returning to present state. */
export async function clearActiveCursor(persistence: Persistence, graphName: string): Promise<void> {
  const ref = buildCursorActiveRef(graphName);
  const exists = await persistence.readRef(ref);
  if (typeof exists === 'string' && exists.length > 0) {
    await persistence.deleteRef(ref);
  }
}

/** Reads a named saved cursor from Git ref storage. */
export async function readSavedCursor(persistence: Persistence, graphName: string, name: string): Promise<CursorBlob | null> {
  const ref = buildCursorSavedRef(graphName, name);
  const oid = await persistence.readRef(ref);
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, `saved cursor '${name}'`);
}

/** Persists a cursor under a named saved-cursor ref. */
export async function writeSavedCursor(persistence: Persistence, graphName: string, name: string, cursor: CursorBlob): Promise<void> {
  const ref = buildCursorSavedRef(graphName, name);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(textEncode(json));
  await persistence.updateRef(ref, oid);
}

/** Deletes a named saved cursor from Git ref storage. */
export async function deleteSavedCursor(persistence: Persistence, graphName: string, name: string): Promise<void> {
  const ref = buildCursorSavedRef(graphName, name);
  const exists = await persistence.readRef(ref);
  if (typeof exists === 'string' && exists.length > 0) {
    await persistence.deleteRef(ref);
  }
}

/** Lists all saved cursors for a graph. */
export async function listSavedCursors(persistence: Persistence, graphName: string): Promise<Array<{ name: string; tick: number; mode?: string }>> {
  const prefix = buildCursorSavedPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const cursors: Array<{ tick: number; mode?: string; name: string }> = [];
  for (const ref of refs) {
    const name = ref.slice(prefix.length);
    if (typeof name === 'string' && name.length > 0) {
      const oid = await persistence.readRef(ref);
      if (typeof oid === 'string' && oid.length > 0) {
        const buf = await persistence.readBlob(oid);
        const cursor = parseCursorBlob(buf, `saved cursor '${name}'`);
        cursors.push({ name, ...cursor });
      }
    }
  }
  return cursors;
}
