const SHA1_OID = /^[0-9a-f]{40}$/u;
const SHA256_OID = /^[0-9a-f]{64}$/u;

/**
 * A repository's object format, as far as hashing an object outside Git needs it: the
 * hash algorithm and the id of the empty tree. An object id names its format by its length.
 */
export default class GitObjectFormat {
  static readonly SHA1 = new GitObjectFormat('sha1', '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  static readonly SHA256 = new GitObjectFormat('sha256', '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321');

  readonly algorithm: string;
  readonly emptyTree: string;

  private constructor(algorithm: string, emptyTree: string) {
    this.algorithm = algorithm;
    this.emptyTree = emptyTree;
    Object.freeze(this);
  }

  /** The format whose object ids look like `oid`, or null when `oid` is not a lowercase hex id of either. */
  static ofOid(oid: string): GitObjectFormat | null {
    if (SHA1_OID.test(oid)) {
      return GitObjectFormat.SHA1;
    }
    return SHA256_OID.test(oid) ? GitObjectFormat.SHA256 : null;
  }
}
