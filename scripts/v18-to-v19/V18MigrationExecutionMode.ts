export type V18MigrationExecutionModeName = 'promote' | 'rehearse';

/** Explicitly selects whether verified scratch refs are promoted. */
export default class V18MigrationExecutionMode {
  static readonly #PROMOTE = new V18MigrationExecutionMode('promote');
  static readonly #REHEARSE = new V18MigrationExecutionMode('rehearse');

  readonly name: V18MigrationExecutionModeName;

  private constructor(name: V18MigrationExecutionModeName) {
    this.name = name;
    Object.freeze(this);
  }

  static promote(): V18MigrationExecutionMode {
    return V18MigrationExecutionMode.#PROMOTE;
  }

  static rehearse(): V18MigrationExecutionMode {
    return V18MigrationExecutionMode.#REHEARSE;
  }

  promotesVerifiedRefs(): boolean {
    return this === V18MigrationExecutionMode.#PROMOTE;
  }
}
