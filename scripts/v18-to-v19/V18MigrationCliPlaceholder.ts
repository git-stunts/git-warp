export type V18MigrationCliPlaceholderForm = 'literal' | 'shell';

/** One operator-supplied CLI value, in every form the guidance may show. */
export default class V18MigrationCliPlaceholder {
  /** Form used by `--help` after the flag name. */
  readonly synopsis: string;
  /** Form used by copy-and-edit examples. */
  readonly literal: string;
  /** Form used by scripted maintenance-window examples. */
  readonly shell: string;

  constructor(forms: Readonly<{ literal: string; shell: string; synopsis: string }>) {
    if (forms.literal === '' || forms.shell === '' || forms.synopsis === '') {
      throw new Error('CLI placeholder forms cannot be empty');
    }
    this.synopsis = forms.synopsis;
    this.literal = forms.literal;
    this.shell = forms.shell;
    Object.freeze(this);
  }

  render(form: V18MigrationCliPlaceholderForm): string {
    return form === 'shell' ? this.shell : this.literal;
  }
}
