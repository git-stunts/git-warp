import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

const ARCHIVE_REF_PREFIX = 'refs/warp-migration-archive/';
const LIVE_WARP_REF_PREFIX = 'refs/warp/';
const MISSING_ARCHIVE_REF_CODE = 'E_MISSING_ARCHIVE_REF';
const LIVE_ARCHIVE_REF_TARGET_CODE = 'E_LIVE_ARCHIVE_REF_TARGET';
const INVALID_ARCHIVE_REF_CODE = 'E_INVALID_ARCHIVE_REF';
const INVALID_REF_CHARACTERS = Object.freeze(new Set(['~', '^', ':', '?', '*', '[', '\\']));

export type GraphModelMigrationArchiveRefFields = {
  readonly refName: string;
};

/** Explicit archive ref target for preserved pre-migration lineage. */
export default class GraphModelMigrationArchiveRef {
  readonly refName: string;

  constructor(fields: GraphModelMigrationArchiveRefFields) {
    const checkedFields = requireFields(fields);
    const notice = GraphModelMigrationArchiveRef.validateRefName(checkedFields.refName);
    if (notice !== null) {
      throw new WarpError(notice.message, notice.code);
    }
    this.refName = checkedFields.refName;
    Object.freeze(this);
  }

  /** Validates an archive ref target without constructing one. */
  static validateRefName(refName: string | null | undefined): GraphModelMigrationNotice | null {
    if (typeof refName !== 'string' || refName.length === 0) {
      return GraphModelMigrationNotice.fatal(
        MISSING_ARCHIVE_REF_CODE,
        'migration finalization requires an explicit archive ref target',
      );
    }
    const prefixNotice = validateRefPrefix(refName);
    return prefixNotice ?? validateRefShape(refName);
  }
}

function requireFields(
  fields: GraphModelMigrationArchiveRefFields | null | undefined,
): GraphModelMigrationArchiveRefFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationArchiveRef fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function validateRefPrefix(refName: string): GraphModelMigrationNotice | null {
  if (refName.startsWith(LIVE_WARP_REF_PREFIX)) {
    return GraphModelMigrationNotice.fatal(
      LIVE_ARCHIVE_REF_TARGET_CODE,
      `archive ref must not target live graph ref ${refName}`,
    );
  }
  if (!refName.startsWith(ARCHIVE_REF_PREFIX)) {
    return GraphModelMigrationNotice.fatal(
      INVALID_ARCHIVE_REF_CODE,
      `archive ref must start with ${ARCHIVE_REF_PREFIX}`,
    );
  }
  return null;
}

function validateRefShape(refName: string): GraphModelMigrationNotice | null {
  if (!hasInvalidRefShape(refName)) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    INVALID_ARCHIVE_REF_CODE,
    `archive ref has invalid shape ${refName}`,
  );
}

function hasInvalidRefShape(refName: string): boolean {
  const suffix = refName.slice(ARCHIVE_REF_PREFIX.length);
  return [
    suffix.length === 0,
    suffix.startsWith('/'),
    suffix.endsWith('/'),
    refName.includes('//'),
    refName.includes('..'),
    refName.trim() !== refName,
    containsInvalidRefCharacter(refName),
  ].some((invalid) => invalid);
}

function containsInvalidRefCharacter(refName: string): boolean {
  for (const character of refName) {
    if (isInvalidRefCharacter(character)) {
      return true;
    }
  }
  return false;
}

function isInvalidRefCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 32 || code === 127 || INVALID_REF_CHARACTERS.has(character);
}
