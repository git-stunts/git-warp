/**
 * Cursor I/O helpers for the seek command.
 * Extracted from seek.js to keep file size under 500 LOC.
 */
import { textEncode } from '../../../src/domain/utils/bytes.ts';
import {
  buildCursorActiveRef,
  buildCursorSavedRef,
  buildCursorSavedPrefix,
} from '../../../src/domain/utils/RefLayout.ts';
import { parseCursorBlob } from '../../../src/domain/utils/parseCursorBlob.ts';

/** @typedef {import('../types.js').Persistence} Persistence */
/** @typedef {import('../types.js').CursorBlob} CursorBlob */

/**
 * Removes the active seek cursor for a graph, returning to present state.
 * @param {Persistence} persistence
 * @param {string} graphName
 * @returns {Promise<void>}
 */
export async function clearActiveCursor(persistence, graphName) {
  const ref = buildCursorActiveRef(graphName);
  const exists = await persistence.readRef(ref);
  if (typeof exists === 'string' && exists.length > 0) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Reads a named saved cursor from Git ref storage.
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @returns {Promise<CursorBlob|null>}
 */
export async function readSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const oid = await persistence.readRef(ref);
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, `saved cursor '${name}'`);
}

/**
 * Persists a cursor under a named saved-cursor ref.
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @param {CursorBlob} cursor
 * @returns {Promise<void>}
 */
export async function writeSavedCursor(persistence, graphName, name, cursor) {
  const ref = buildCursorSavedRef(graphName, name);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(textEncode(json));
  await persistence.updateRef(ref, oid);
}

/**
 * Deletes a named saved cursor from Git ref storage.
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function deleteSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const exists = await persistence.readRef(ref);
  if (typeof exists === 'string' && exists.length > 0) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Lists all saved cursors for a graph.
 * @param {Persistence} persistence
 * @param {string} graphName
 * @returns {Promise<Array<{name: string, tick: number, mode?: string}>>}
 */
export async function listSavedCursors(persistence, graphName) {
  const prefix = buildCursorSavedPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const cursors = [];
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
