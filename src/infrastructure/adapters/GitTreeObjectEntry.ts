/** One entry of a Git tree object, as the object session decodes it. */
export type GitTreeObjectEntry = {
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
  readonly name: string;
};
