import WarpReadRequestError from '../errors/WarpReadRequestError.ts';
import ObserverIdentity from './ObserverIdentity.ts';
import Purpose from './Purpose.ts';
import ReadBudget from './ReadBudget.ts';

type WarpReadRequestFields = {
  readonly graph: string;
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  readonly question: string;
  readonly subject: string;
  readonly key: string | null;
  readonly budget: ReadBudget | null;
};

function validateIdentifiers(graph: string, question: string): void {
  if (typeof graph !== 'string' || graph.length === 0) {
    throw new WarpReadRequestError('A read request needs a non-empty graph identifier');
  }
  if (typeof question !== 'string' || question.length === 0) {
    throw new WarpReadRequestError('A read request needs a non-empty question identifier');
  }
}

function validateSubject(subject: string): void {
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new WarpReadRequestError('A read request needs a non-empty subject');
  }
}

function validateKey(key: string | null): void {
  if (key !== null && (typeof key !== 'string' || key.length === 0)) {
    throw new WarpReadRequestError('A read request key must be a non-empty string or null');
  }
}

function validateScope(observer: ObserverIdentity, purpose: Purpose, budget: ReadBudget | null): void {
  if (!(observer instanceof ObserverIdentity)) {
    throw new WarpReadRequestError('A read request needs an ObserverIdentity');
  }
  if (!(purpose instanceof Purpose)) {
    throw new WarpReadRequestError('A read request needs a Purpose');
  }
  if (budget !== null && !(budget instanceof ReadBudget)) {
    throw new WarpReadRequestError('A read request budget must be a ReadBudget or null');
  }
}

function validateFields(fields: WarpReadRequestFields): void {
  validateIdentifiers(fields.graph, fields.question);
  validateSubject(fields.subject);
  validateKey(fields.key);
  validateScope(fields.observer, fields.purpose, fields.budget);
}

/**
 * What the access boundary is asked to authorize before anything is read. It names the
 * exact question, so a port can grant one subject or property and refuse another.
 */
export default class WarpReadRequest {
  readonly graph: string;
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  /** The versioned question, such as `node.property/v1`. */
  readonly question: string;
  /** The node the question asks about. */
  readonly subject: string;
  /** The property the question asks about, or null when it asks about the node itself. */
  readonly key: string | null;
  /** The budget the caller asked for, or null to take the observer's default. */
  readonly budget: ReadBudget | null;

  constructor(fields: WarpReadRequestFields) {
    validateFields(fields);
    this.graph = fields.graph;
    this.observer = fields.observer;
    this.purpose = fields.purpose;
    this.question = fields.question;
    this.subject = fields.subject;
    this.key = fields.key;
    this.budget = fields.budget;
    Object.freeze(this);
  }
}
