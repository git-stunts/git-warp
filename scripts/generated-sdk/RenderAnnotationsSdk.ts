import { writeFileSync } from 'node:fs';

import * as wesley from '../../examples/annotations/sdk/annotations.wesley.generated.ts';
import renderAnnotationsSdkPrelude from './AnnotationsSdkPrelude.ts';

/**
 * Application-owned stage-two renderer for the annotations example SDK.
 *
 * Wesley owns structure: it preserves every directive of annotations.graphql as
 * operation metadata. This renderer owns meaning: it binds each supported
 * directive to a git-warp Intent or Reading constructor and refuses anything
 * whose runtime meaning or bound is not explicit.
 */

type IntentDirective = Readonly<{
  kind: string; subject?: string; prefix?: string; key?: string; value?: string; literal?: string;
  from?: string; fromPrefix?: string; to?: string; toPrefix?: string; label?: string; when?: string;
}>;

type ObserverDirective = Readonly<{
  id: string; reading: string; subject: string; prefix: string; key?: string; label?: string;
  neighborPrefix?: string; limit?: number; cursor?: string; cardinality: string; decoder: string;
  maxSubjects?: number;
}>;

type OperationMetadata = Readonly<{
  operationType: string;
  fieldName: string;
  directives: Readonly<{
    intent?: IntentDirective | readonly IntentDirective[];
    observer?: ObserverDirective | readonly ObserverDirective[];
  }>;
}>;

class AnnotationsSdkContractError extends Error {
  constructor(operation: string, message: string) {
    super(`annotations.graphql ${operation}: ${message}`);
    this.name = 'AnnotationsSdkContractError';
  }
}

const MAX_NEIGHBOR_LIMIT = 1000;
const OPERATIONS: readonly OperationMetadata[] = Object.values(wesley);

function list<TValue>(value: TValue | readonly TValue[] | undefined): readonly TValue[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function pascal(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function quote(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function required(operation: string, value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new AnnotationsSdkContractError(operation, `${label} is required`);
  }
  return value;
}

function idExpression(operation: string, argument: string | undefined, prefix: string | undefined): string {
  const field = required(operation, argument, 'subject argument');
  const label = `annotations.${operation}.${field}`;
  return `requireId(${quote(required(operation, prefix, 'prefix'))}, request.${field}, ${quote(label)})`;
}

function intentStatement(operation: string, directive: IntentDirective): string {
  const subject = (): string => idExpression(operation, directive.subject, directive.prefix);
  const edge = (): string => {
    const from = idExpression(operation, directive.from, directive.fromPrefix);
    const to = idExpression(operation, directive.to, directive.toPrefix);
    return `{ from: ${from}, to: ${to}, label: ${quote(required(operation, directive.label, 'label'))} }`;
  };
  switch (directive.kind) {
    case 'NODE_ADD': return `intents.push(intent.node.add({ subject: ${subject()} }));`;
    case 'NODE_REMOVE': return `intents.push(intent.node.remove({ subject: ${subject()} }));`;
    case 'EDGE_ADD': return `intents.push(intent.edge.add(${edge()}));`;
    case 'EDGE_REMOVE': return `intents.push(intent.edge.remove(${edge()}));`;
    case 'PROPERTY_SET': return `intents.push(intent.property.set({ subject: ${subject()}, key: ${quote(required(operation, directive.key, 'key'))}, value: ${propertyValue(operation, directive)} }));`;
    default: throw new AnnotationsSdkContractError(operation, `unsupported intent kind ${directive.kind}`);
  }
}

function propertyValue(operation: string, directive: IntentDirective): string {
  if ((directive.value === undefined) === (directive.literal === undefined)) {
    throw new AnnotationsSdkContractError(operation, 'PROPERTY_SET needs exactly one of value or literal');
  }
  if (directive.literal !== undefined) {
    return quote(directive.literal);
  }
  const field = required(operation, directive.value, 'value');
  return `requireValue(request.${field}, ${quote(`annotations.${operation}.${field}`)})`;
}

function renderMutation(operation: OperationMetadata): string {
  const name = operation.fieldName;
  const directives = list(operation.directives.intent);
  if (directives.length === 0 || operation.directives.observer !== undefined) {
    throw new AnnotationsSdkContractError(name, 'a Mutation must carry only @intent directives');
  }
  const statements = directives.map((directive) => {
    const statement = intentStatement(name, directive);
    if (directive.when === undefined) {
      return `  ${statement}`;
    }
    const field = `request.${directive.when}`;
    if (directive.value !== directive.when) {
      throw new AnnotationsSdkContractError(name, 'when must name the optional value it guards');
    }
    return `  if (${field} !== undefined && ${field} !== null) {\n    ${statement}\n  }`;
  });
  return [
    `function ${name}(fields: Mutation${pascal(name)}Request): readonly Intent[] {`,
    `  const request = requireRequest(fields, ${quote(`annotations.${name}`)});`,
    '  const intents: Intent[] = [];',
    ...statements,
    '  return Object.freeze(intents);',
    '}',
  ].join('\n');
}

function sameAcross(name: string, directives: readonly ObserverDirective[], pick: (directive: ObserverDirective) => string | number | undefined): void {
  const first = directives[0];
  if (first === undefined || directives.some((directive) => pick(directive) !== pick(first))) {
    throw new AnnotationsSdkContractError(name, 'repeated @observer directives must share id, subject, prefix, cardinality, decoder and bound');
  }
}

function neighborhoodReading(name: string, directive: ObserverDirective, subject: string): string {
  const limit = directive.limit;
  if (limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > MAX_NEIGHBOR_LIMIT) {
    throw new AnnotationsSdkContractError(name, `NEIGHBORHOOD limit must be 1..${MAX_NEIGHBOR_LIMIT}`);
  }
  if (directive.decoder !== 'NEIGHBOR_PAGE') {
    throw new AnnotationsSdkContractError(name, 'NEIGHBORHOOD readings decode as NEIGHBOR_PAGE');
  }
  const cursor = directive.cursor === undefined ? '' : `, ...cursorOption(request.${directive.cursor})`;
  return `reading.neighborhood({ subject: ${subject}, direction: 'out', labels: [${quote(required(name, directive.label, 'label'))}], limit: ${limit}${cursor} })`;
}

function decoderExpression(name: string, directive: ObserverDirective): string {
  if (directive.decoder === 'SCALAR' && directive.reading === 'PROPERTY') {
    return 'decodeScalar';
  }
  if (directive.decoder === 'NEIGHBOR_PAGE' && directive.reading === 'NEIGHBORHOOD') {
    return `neighborPageDecoder(${quote(required(name, directive.neighborPrefix, 'neighborPrefix'))})`;
  }
  throw new AnnotationsSdkContractError(name, `unsupported reading ${directive.reading}/${directive.decoder}`);
}

function valueType(directive: ObserverDirective): string {
  return directive.decoder === 'SCALAR' ? 'FieldValue' : 'NeighborPage';
}

function renderExactlyOne(name: string, directive: ObserverDirective, directives: readonly ObserverDirective[]): string {
  if (directives.length !== 1 || directive.reading !== 'NEIGHBORHOOD') {
    throw new AnnotationsSdkContractError(name, 'EXACTLY_ONE observers take one NEIGHBORHOOD directive');
  }
  const subject = idExpression(name, directive.subject, directive.prefix);
  return [
    `function ${name}(fields: Query${pascal(name)}Request): Observer<NeighborPage> {`,
    `  const request = requireRequest(fields, ${quote(`annotations.${name}`)});`,
    `  return createObserver(${quote(directive.id)}, ${neighborhoodReading(name, directive, subject)}, ${decoderExpression(name, directive)});`,
    '}',
  ].join('\n');
}

function renderMany(name: string, directive: ObserverDirective, directives: readonly ObserverDirective[]): { source: string; keys: readonly string[] | null; bound: number } {
  const bound = directive.maxSubjects;
  if (bound === undefined || !Number.isInteger(bound) || bound < 1) {
    throw new AnnotationsSdkContractError(name, 'MANY observers need a positive maxSubjects bound');
  }
  const subject = `${quote(directive.prefix)} + id`;
  let readings: string;
  let keys: readonly string[] | null = null;
  if (directive.reading === 'PROPERTY') {
    keys = directives.map((each) => required(name, each.key, 'key'));
    readings = `      for (const key of ${constantName(name)}) {\n        yield reading.property({ subject: ${subject}, key });\n      }`;
  } else if (directives.length === 1) {
    readings = `      yield ${neighborhoodReading(name, directive, subject)};`;
  } else {
    throw new AnnotationsSdkContractError(name, 'a MANY NEIGHBORHOOD observer takes one directive');
  }
  const source = [
    `function ${name}(fields: Query${pascal(name)}Request): Observer<${valueType(directive)}> {`,
    `  const request = requireRequest(fields, ${quote(`annotations.${name}`)});`,
    `  const ids = requireIds(request.${directive.subject}, ${bound}, ${quote(`annotations.${name}.${directive.subject}`)});`,
    `  return createManyObserver(${quote(directive.id)}, function* readings() {`,
    '    for (const id of ids) {',
    readings,
    '    }',
    `  }, ${decoderExpression(name, directive)});`,
    '}',
  ].join('\n');
  return { source, keys, bound };
}

function constantName(name: string): string {
  return `${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_KEYS`;
}

type RenderedQuery = Readonly<{ name: string; source: string; keys: readonly string[] | null; bound: number | null }>;

function renderQuery(operation: OperationMetadata): RenderedQuery {
  const name = operation.fieldName;
  const directives = list(operation.directives.observer);
  const first = directives[0];
  if (first === undefined || operation.directives.intent !== undefined) {
    throw new AnnotationsSdkContractError(name, 'a Query must carry only @observer directives');
  }
  for (const pick of [(d: ObserverDirective) => d.id, (d: ObserverDirective) => d.subject, (d: ObserverDirective) => d.prefix,
    (d: ObserverDirective) => d.cardinality, (d: ObserverDirective) => d.decoder, (d: ObserverDirective) => d.maxSubjects,
    (d: ObserverDirective) => d.reading]) {
    sameAcross(name, directives, pick);
  }
  if (first.cardinality === 'EXACTLY_ONE') {
    return { name, source: renderExactlyOne(name, first, directives), keys: null, bound: null };
  }
  if (first.cardinality !== 'MANY') {
    throw new AnnotationsSdkContractError(name, `unsupported cardinality ${first.cardinality}`);
  }
  const many = renderMany(name, first, directives);
  return { name, ...many };
}

function requireOutputPath(): string {
  const index = process.argv.indexOf('--out');
  const output = index === -1 ? undefined : process.argv[index + 1];
  if (output === undefined) {
    throw new AnnotationsSdkContractError('renderer', 'missing required --out <path> argument');
  }
  return output;
}

function render(): string {
  const mutations = OPERATIONS.filter((operation) => operation.operationType === 'MUTATION').map(renderMutation);
  const queries = OPERATIONS.filter((operation) => operation.operationType === 'QUERY').map(renderQuery);
  if (OPERATIONS.some((operation) => operation.operationType !== 'MUTATION' && operation.operationType !== 'QUERY')) {
    throw new AnnotationsSdkContractError('schema', 'only Query and Mutation operations are supported');
  }
  const requestTypes = OPERATIONS.map((operation) => `${operation.operationType === 'MUTATION' ? 'Mutation' : 'Query'}${pascal(operation.fieldName)}Request`).sort();
  const keyTables = queries.flatMap((query) => query.keys === null ? [] : [`const ${constantName(query.name)} = Object.freeze([${query.keys.map(quote).join(', ')}] as const);`]);
  const fieldsExport = queries.flatMap((query) => query.keys === null ? [] : [`    ${query.name}: ${constantName(query.name)},`]);
  const limitsExport = queries.flatMap((query) => query.bound === null ? [] : [`    ${query.name}: ${query.bound},`]);
  const names = (items: readonly string[]): string => items.map((item) => `    ${item},`).join('\n');
  const prelude = renderAnnotationsSdkPrelude(requestTypes);
  return [
    prelude.trimEnd(),
    '',
    keyTables.join('\n'),
    '',
    [...mutations, ...queries.map((query) => query.source)].join('\n\n'),
    '',
    'export const annotations = Object.freeze({',
    `  intents: Object.freeze({\n${names(OPERATIONS.filter((op) => op.operationType === 'MUTATION').map((op) => op.fieldName))}\n  }),`,
    `  observers: Object.freeze({\n${names(queries.map((query) => query.name))}\n  }),`,
    `  fields: Object.freeze({\n${fieldsExport.join('\n')}\n  }),`,
    `  limits: Object.freeze({\n${limitsExport.join('\n')}\n  }),`,
    '});',
    '',
  ].join('\n');
}

writeFileSync(requireOutputPath(), render());
