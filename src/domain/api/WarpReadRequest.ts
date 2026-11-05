import type ObserverIdentity from './ObserverIdentity.ts';
import type Purpose from './Purpose.ts';
import type ReadBudget from './ReadBudget.ts';

/** What the access boundary is asked to authorize before anything is read. */
export default class WarpReadRequest {
  readonly graph: string;
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  /** The versioned question, such as `node.property/v1`. */
  readonly question: string;
  /** The budget the caller asked for, or null to take the observer's default. */
  readonly budget: ReadBudget | null;

  constructor(fields: {
    readonly graph: string;
    readonly observer: ObserverIdentity;
    readonly purpose: Purpose;
    readonly question: string;
    readonly budget: ReadBudget | null;
  }) {
    this.graph = fields.graph;
    this.observer = fields.observer;
    this.purpose = fields.purpose;
    this.question = fields.question;
    this.budget = fields.budget;
    Object.freeze(this);
  }
}
