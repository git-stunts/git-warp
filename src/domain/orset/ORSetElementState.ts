import ORSetElementStateError from "../errors/ORSetElementStateError.ts";

type ORSetElementStateFields = {
  readonly element: string;
  readonly dots: ReadonlySet<string>;
  readonly tombstonedDots: ReadonlySet<string>;
};

/**
 * Runtime-backed OR-Set element state.
 *
 * Carries the live and tombstoned dots for one element without
 * leaking trie leaf transport shapes upward.
 */
export default class ORSetElementState {
  readonly #element: string;
  readonly #dots: ReadonlySet<string>;
  readonly #tombstonedDots: ReadonlySet<string>;

  constructor(fields: ORSetElementStateFields) {
    validateElement(fields.element);
    validateDots("dots", fields.dots);
    validateDots("tombstonedDots", fields.tombstonedDots);
    this.#element = fields.element;
    this.#dots = new Set(fields.dots);
    this.#tombstonedDots = new Set(fields.tombstonedDots);
    Object.freeze(this);
  }

  get element(): string {
    return this.#element;
  }

  get dots(): ReadonlySet<string> {
    return new Set(this.#dots);
  }

  get tombstonedDots(): ReadonlySet<string> {
    return new Set(this.#tombstonedDots);
  }

  hasLiveDots(): boolean {
    return this.#dots.size > 0;
  }
}

function validateElement(element: string): void {
  if (typeof element !== "string" || element.length === 0) {
    throw new ORSetElementStateError(
      `ORSetElementState requires a non-empty element string; received ${String(element)}`,
      { context: { field: "element", element } },
    );
  }
}

function validateDots(field: string, dots: ReadonlySet<string>): void {
  if (!(dots instanceof Set)) {
    throw new ORSetElementStateError(
      `ORSetElementState requires ${field} to be a Set<string>`,
      { context: { field } },
    );
  }
  for (const dot of dots) {
    if (typeof dot !== "string") {
      throw new ORSetElementStateError(
        `ORSetElementState requires ${field} to contain only strings`,
        { context: { field, dot: String(dot) } },
      );
    }
  }
}
