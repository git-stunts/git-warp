const POSIX_PATH_PREFIXES = Object.freeze([
  '/Users/',
  '/home/',
  '/private/var/folders/',
  '/var/folders/',
]);
const WINDOWS_PATH_PREFIX_PATTERN = /[a-z]:\\users\\$/iu;
const WHITESPACE_PATTERN = /\s/u;
const MAX_PREFIX_CHARACTERS = Math.max(
  ...POSIX_PATH_PREFIXES.map((prefix) => prefix.length),
  'C:\\Users\\'.length
);

export class MachineLocalPathStreamScanner {
  readonly #decoder = new TextDecoder();
  #suffix = '';
  #posixSegmentLength: number | null = null;
  #windowsSegmentLength: number | null = null;
  #matched = false;
  #finished = false;

  write(bytes: Uint8Array): boolean {
    if (this.#finished) {
      throw new Error('Machine-local path stream scanner is already finished');
    }
    this.#scan(this.#decoder.decode(bytes, { stream: true }));
    return this.#matched;
  }

  finish(): boolean {
    if (!this.#finished) {
      this.#scan(this.#decoder.decode());
      this.#matched ||=
        this.#hasCompleteSegment(this.#posixSegmentLength) ||
        this.#hasCompleteSegment(this.#windowsSegmentLength);
      this.#finished = true;
    }
    return this.#matched;
  }

  #scan(content: string): void {
    for (const character of content) {
      this.#advanceCandidates(character);
      if (this.#matched) {
        return;
      }
      this.#suffix = (this.#suffix + character).slice(-MAX_PREFIX_CHARACTERS);
      if (POSIX_PATH_PREFIXES.some((prefix) => this.#suffix.endsWith(prefix))) {
        this.#posixSegmentLength = 0;
      }
      if (WINDOWS_PATH_PREFIX_PATTERN.test(this.#suffix)) {
        this.#windowsSegmentLength = 0;
      }
    }
  }

  #advanceCandidates(character: string): void {
    this.#posixSegmentLength = this.#advanceCandidate(
      this.#posixSegmentLength,
      character,
      '/'
    );
    this.#windowsSegmentLength = this.#advanceCandidate(
      this.#windowsSegmentLength,
      character,
      '\\'
    );
  }

  #advanceCandidate(length: number | null, character: string, delimiter: string): number | null {
    if (length === null) {
      return null;
    }
    if (character === delimiter) {
      this.#matched ||= length > 0;
      return null;
    }
    if (WHITESPACE_PATTERN.test(character)) {
      return null;
    }
    return length + 1;
  }

  #hasCompleteSegment(length: number | null): boolean {
    return length !== null && length > 0;
  }
}
