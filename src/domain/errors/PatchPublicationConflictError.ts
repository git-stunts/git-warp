import PersistenceError from './PersistenceError.ts';

/** Typed adapter-boundary failure for a conflicting patch publication. */
export default class PatchPublicationConflictError extends PersistenceError {
  static readonly CODE = 'E_PATCH_PUBLICATION_CONFLICT';

  constructor(cause?: Error) {
    super(
      'Patch publication conflicted with the current writer head',
      PatchPublicationConflictError.CODE,
      cause === undefined ? {} : { cause },
    );
  }
}
