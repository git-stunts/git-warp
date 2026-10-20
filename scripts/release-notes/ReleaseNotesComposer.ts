// Composes GitHub Release notes that lead with the curated CHANGELOG synopsis.
// Generated PR history lists intermediate titles, so it follows as evidence.

const GENERATED_HEADING = "## What's Changed";
const SYNOPSIS_SECTIONS = /^### (?:Release notes|Compatibility|Breaking|Upgrad|Migrat)/iu;
const RELATIVE_LINK = /\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/giu;

export class ReleaseNotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseNotesError';
  }
}

export type ReleaseNotesInput = Readonly<{
  changelog: string;
  summary: string;
  /** The current release body on a rerun, or null when creating the release. */
  existing: string | null;
}>;

export default class ReleaseNotesComposer {
  readonly repository: string;
  readonly tag: string;
  readonly version: string;

  constructor({ repository, tag }: { readonly repository: string; readonly tag: string }) {
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) { throw new ReleaseNotesError(`invalid repository: ${repository}`); }
    if (!/^v\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(tag)) { throw new ReleaseNotesError(`invalid tag: ${tag}`); }
    this.repository = repository;
    this.tag = tag;
    this.version = tag.slice(1);
    Object.freeze(this);
  }

  /**
   * Synopsis, link to the full changelog, registry summary, then any generated
   * history already on the release. Recomposing a composed body is a no-op.
   */
  compose({ changelog, summary, existing }: ReleaseNotesInput): string {
    const parts = [this.#synopsis(changelog), `Full changelog: ${this.#blob('CHANGELOG.md')}`, summary.trim()];
    const generated = existing === null ? -1 : existing.indexOf(GENERATED_HEADING);
    if (existing !== null && generated >= 0) {
      parts.push(existing.slice(generated).trim());
    }
    return `${parts.join('\n\n')}\n`;
  }

  #synopsis(changelog: string): string {
    const lines = this.#section(changelog);
    const header = /^## \[[^\]]+\](?: - (\S+))?/u.exec(lines[0] ?? '');
    const date = header?.[1];
    const kept: string[] = [date === undefined ? `## git-warp ${this.version}` : `## git-warp ${this.version} (${date})`];
    let keep = true;
    for (const line of lines.slice(1)) {
      if (line.startsWith('### ')) { keep = SYNOPSIS_SECTIONS.test(line); }
      if (keep) { kept.push(line.replace(RELATIVE_LINK, (_match, path: string) => `](${this.#blob(path)})`)); }
    }
    return kept.join('\n').trim();
  }

  #section(changelog: string): string[] {
    const lines = changelog.split('\n');
    const start = lines.findIndex((line) => line.startsWith(`## [${this.version}]`));
    if (start < 0) { throw new ReleaseNotesError(`CHANGELOG.md has no section for ${this.version}`); }
    const next = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
    return lines.slice(start, next < 0 ? undefined : next);
  }

  #blob(path: string): string {
    return `https://github.com/${this.repository}/blob/${this.tag}/${path.replace(/^\.\//u, '')}`;
  }
}
