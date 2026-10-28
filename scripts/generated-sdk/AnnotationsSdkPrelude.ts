/**
 * Fixed head of the generated annotations SDK: imports, value types and the
 * runtime validators every rendered Intent and Observer factory calls.
 */
export default function renderAnnotationsSdkPrelude(requestTypes: readonly string[]): string {
  return `/* @generated from annotations.graphql by Wesley 0.3.0-alpha.1 and scripts/generated-sdk/RenderAnnotationsSdk.ts. Do not edit. */

/** Generated SDKs construct validated Intent and Observer values for Runtime Lane workflows. */
import type {
  Intent,
  Observer,
  ReadingValue,
} from '@git-stunts/git-warp';
import {
  createManyObserver,
  createObserver,
  intent,
  reading,
} from '@git-stunts/git-warp/advanced';
import type {
${requestTypes.map((type) => `  ${type},`).join('\n')}
} from './annotations.wesley.generated.ts';

/** One stored field. An absent property reads as null. */
export type FieldValue = string | number | boolean | null;

/** One bounded page of neighbour ids, with the graph prefix removed. */
export type NeighborPage = Readonly<{
  ids: readonly string[];
  cursor: string | null;
  complete: boolean;
}>;

class AnnotationsSdkValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationsSdkValidationError';
  }
}

function requireRequest<TRequest>(request: TRequest, operation: string): TRequest {
  if (typeof request !== 'object' || request === null) {
    throw new AnnotationsSdkValidationError(\`\${operation} request must be an object\`);
  }
  return request;
}

function requireId(prefix: string, value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AnnotationsSdkValidationError(\`\${field} must be a non-empty string\`);
  }
  return prefix + value;
}

function requireValue<TValue extends string | number | boolean>(value: TValue, field: string): TValue {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new AnnotationsSdkValidationError(\`\${field} must be a safe integer\`);
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new AnnotationsSdkValidationError(\`\${field} must be a scalar\`);
  }
  return value;
}

function requireIds(ids: readonly string[], max: number, field: string): readonly string[] {
  if (!Array.isArray(ids)) {
    throw new AnnotationsSdkValidationError(\`\${field} must be an array\`);
  }
  if (ids.length > max) {
    throw new AnnotationsSdkValidationError(\`\${field} must contain at most \${max} values\`);
  }
  return Object.freeze(ids.map((id, index) => requireId('', id, \`\${field}[\${index}]\`)));
}

function cursorOption(cursor: string | null | undefined): { readonly cursor?: string } {
  return typeof cursor === 'string' && cursor.length > 0 ? { cursor } : {};
}

function decodeScalar(value: ReadingValue): FieldValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new AnnotationsSdkValidationError('annotations field Observer expected a scalar');
}

function neighborId(edge: ReadingValue, prefix: string): string {
  if (typeof edge === 'object' && edge !== null && 'neighborId' in edge && typeof edge.neighborId === 'string'
    && edge.neighborId.startsWith(prefix)) {
    return edge.neighborId.slice(prefix.length);
  }
  throw new AnnotationsSdkValidationError(\`annotations neighbour must be a \${prefix} node\`);
}

function neighborPageDecoder(prefix: string): (value: ReadingValue) => NeighborPage {
  return (value) => {
    if (typeof value !== 'object' || value === null || !('edges' in value) || !Array.isArray(value.edges)
      || !('completeness' in value) || !('cursor' in value)) {
      throw new AnnotationsSdkValidationError('annotations neighbourhood Observer expected a neighbourhood page');
    }
    const edges: readonly ReadingValue[] = value.edges;
    const cursor = typeof value.cursor === 'string' ? value.cursor : null;
    return Object.freeze({
      ids: Object.freeze(edges.map((edge) => neighborId(edge, prefix))),
      cursor,
      complete: value.completeness === 'complete',
    });
  };
}
`;
}
