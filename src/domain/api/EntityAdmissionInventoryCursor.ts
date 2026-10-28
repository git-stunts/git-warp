import WarpError from '../errors/WarpError.ts';
import { compareStrings } from '../utils/StringComparison.ts';

const CURSOR_PREFIX = 'git-warp:entity-admission-inventory-cursor:1:';
const CURSOR_PART_COUNT = 6;
const COUNT_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

type CursorFields = Readonly<{
  lane: string;
  basisId: string;
  admissionCount: number;
  streamDigest: string;
  remaining: ReadonlyMap<string, number>;
}>;

/**
 * Where a paged entity admission inventory stopped (#1039): the Lane and the
 * opaque basis it inventories, the admissions already emitted with their
 * rolling digest, and per writer how many admissions are still unread. A
 * later Observation given the cursor resumes the same basis exactly there,
 * so the last page can certify the whole inventory.
 *
 * The encoding names only public values (Lane, writer ids, counts and opaque
 * digests). Its check digest detects a damaged cursor; it is a resumption
 * handle, not an authority.
 */
export default class EntityAdmissionInventoryCursor {
  readonly lane: string;
  readonly basisId: string;
  readonly admissionCount: number;
  readonly streamDigest: string;
  readonly remaining: ReadonlyMap<string, number>;

  constructor(fields: CursorFields) {
    this.lane = requirePart(fields.lane);
    this.basisId = requirePart(fields.basisId);
    this.admissionCount = requireCount(fields.admissionCount);
    this.streamDigest = requirePart(fields.streamDigest);
    this.remaining = freezeRemaining(fields.remaining);
    Object.freeze(this);
  }

  /** The unchecked parts this cursor encodes, which its check digest covers. */
  parts(): readonly string[] {
    return Object.freeze([
      encodeURIComponent(this.lane),
      encodeURIComponent(this.basisId),
      String(this.admissionCount),
      encodeURIComponent(this.streamDigest),
      [...this.remaining].map(([writerId, count]) => `${encodeURIComponent(writerId)}=${count}`).join(','),
    ]);
  }

  /** The cursor text, given the check digest of `parts()`. */
  encode(check: string): string {
    return CURSOR_PREFIX + [...this.parts(), encodeURIComponent(check)].join('|');
  }

  /** The cursor and its stated check digest, or a typed refusal of malformed text. */
  static parse(text: string): Readonly<{ cursor: EntityAdmissionInventoryCursor; check: string }> {
    const parts = cursorParts(text);
    const part = (index: number): string => parts[index] ?? '';
    return Object.freeze({
      cursor: new EntityAdmissionInventoryCursor({
        lane: decodePart(part(0)), basisId: decodePart(part(1)), admissionCount: parseCount(part(2)),
        streamDigest: decodePart(part(3)), remaining: parseRemaining(part(4)),
      }),
      check: requirePart(decodePart(part(5))),
    });
  }
}

function cursorParts(text: string): readonly string[] {
  const parts = typeof text === 'string' && text.startsWith(CURSOR_PREFIX)
    ? text.slice(CURSOR_PREFIX.length).split('|') : [];
  if (parts.length !== CURSOR_PART_COUNT) {
    throw cursorError('Entity admission inventory cursor is malformed');
  }
  return parts;
}

function parseRemaining(raw: string): ReadonlyMap<string, number> {
  const positions = new Map<string, number>();
  for (const entry of raw.length === 0 ? [] : raw.split(',')) {
    const separator = entry.lastIndexOf('=');
    positions.set(decodePart(entry.slice(0, separator)), parseCount(entry.slice(separator + 1)));
  }
  return positions;
}

function freezeRemaining(remaining: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  if (!(remaining instanceof Map)) {
    throw cursorError('Entity admission inventory cursor positions must be a Map');
  }
  const positions = new Map<string, number>();
  for (const [writerId, count] of [...remaining].sort(([left], [right]) => compareStrings(left, right))) {
    positions.set(requirePart(writerId), requireCount(count));
  }
  return positions;
}

function parseCount(text: string): number {
  if (!COUNT_PATTERN.test(text)) {
    throw cursorError('Entity admission inventory cursor holds a malformed count');
  }
  return requireCount(Number(text));
}

function requireCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw cursorError('Entity admission inventory cursor holds a malformed count');
  }
  return value;
}

function requirePart(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw cursorError('Entity admission inventory cursor is malformed');
  }
  return value;
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw cursorError('Entity admission inventory cursor is malformed');
  }
}

function cursorError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_CURSOR');
}
