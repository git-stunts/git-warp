import { writeFileSync } from 'node:fs';

import {
  mutationAssignRoleOperation,
  mutationRegisterUserOperation,
  queryRoleOfOperation,
  queryRolesOfOperation,
} from '../../test/fixtures/generated-sdk/users.wesley.generated.ts';
import {
  V19_CAPABILITY_CONTRACT,
} from '../../bin/cli/capabilities/V19CapabilityContract.generated.ts';

class GeneratedSdkContractError extends Error {
  constructor(operation: string) {
    super(`Wesley users.graphql contract drifted at ${operation}`);
    this.name = 'GeneratedSdkContractError';
  }
}

class GeneratedSdkUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedSdkUsageError';
  }
}

function requireRegisterUserContract(): void {
  const operation = mutationRegisterUserOperation;
  const directive = operation.directives.intent;
  const actual = [
    operation.operationType,
    operation.fieldName,
    directive.kind,
    directive.subject,
  ].join(':');
  if (actual !== 'MUTATION:registerUser:NODE_ADD:subject') {
    throw new GeneratedSdkContractError('registerUser');
  }
}

function requireAssignRoleContract(): void {
  const operation = mutationAssignRoleOperation;
  const directive = operation.directives.intent;
  const actual = [
    operation.operationType,
    operation.fieldName,
    directive.kind,
    directive.subject,
    directive.key,
    directive.value,
  ].join(':');
  if (actual !== 'MUTATION:assignRole:PROPERTY_SET:subject:role:role') {
    throw new GeneratedSdkContractError('assignRole');
  }
}

function requireRoleOfContract(): void {
  const operation = queryRoleOfOperation;
  const directive = operation.directives.observer;
  const actual = [
    operation.operationType,
    operation.fieldName,
    directive.id,
    directive.reading,
    directive.subject,
    directive.key,
    directive.cardinality,
    directive.decoder,
  ].join(':');
  if (
    actual !==
    'QUERY:roleOf:users.role-of:PROPERTY:subject:role:EXACTLY_ONE:STRING'
  ) {
    throw new GeneratedSdkContractError('roleOf');
  }
}

function requireRolesOfContract(): void {
  const operation = queryRolesOfOperation;
  const directive = operation.directives.observer;
  const actual = [
    operation.operationType,
    operation.fieldName,
    directive.id,
    directive.reading,
    directive.subject,
    directive.key,
    directive.cardinality,
    directive.decoder,
    directive.maxReadings,
  ].join(':');
  if (
    actual !==
    'QUERY:rolesOf:users.roles-of:PROPERTY:subjects:role:MANY:STRING:256'
  ) {
    throw new GeneratedSdkContractError('rolesOf');
  }
}

const SDK_SOURCE = `/* @generated from users.graphql by Wesley and the git-warp SDK fixture renderer. */

/** ${V19_CAPABILITY_CONTRACT.sdkSummary} */
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
  MutationAssignRoleRequest,
  MutationRegisterUserRequest,
  QueryRoleOfRequest,
  QueryRolesOfRequest,
} from './users.wesley.generated.js';

const ROLE_KEY = 'role';
const ROLE_OF_OBSERVER_ID = 'users.role-of';
const ROLES_OF_OBSERVER_ID = 'users.roles-of';
const MAX_ROLE_READINGS = 256;

class UsersSdkValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'UsersSdkValidationError';
  }
}

function requireRequest<TRequest>(
  request: TRequest,
  operation: string,
): TRequest {
  if (typeof request !== 'object' || request === null) {
    throw new UsersSdkValidationError(\`\${operation} request must be an object\`);
  }
  return request;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UsersSdkValidationError(\`\${field} must be a non-empty string\`);
  }
  return value;
}

function freezeSubjects(subjects: string[]): readonly string[] {
  if (!Array.isArray(subjects)) {
    throw new UsersSdkValidationError('users.rolesOf.subjects must be an array');
  }
  if (subjects.length > MAX_ROLE_READINGS) {
    throw new UsersSdkValidationError(
      \`users.rolesOf.subjects must contain at most \${MAX_ROLE_READINGS} values\`,
    );
  }
  return Object.freeze(
    subjects.map((subject, index) =>
      requireNonEmptyString(subject, \`users.rolesOf.subjects[\${index}]\`)
    ),
  );
}

function decodeRole(value: ReadingValue): string {
  if (typeof value !== 'string') {
    throw new UsersSdkValidationError('users role Observer expected a string');
  }
  return value;
}

function registerUser(fields: MutationRegisterUserRequest): Intent {
  const request = requireRequest(fields, 'users.registerUser');
  return intent.node.add({
    subject: requireNonEmptyString(
      request.subject,
      'users.registerUser.subject',
    ),
  });
}

function assignRole(fields: MutationAssignRoleRequest): Intent {
  const request = requireRequest(fields, 'users.assignRole');
  return intent.property.set({
    subject: requireNonEmptyString(
      request.subject,
      'users.assignRole.subject',
    ),
    key: ROLE_KEY,
    value: requireNonEmptyString(request.role, 'users.assignRole.role'),
  });
}

function roleOf(fields: QueryRoleOfRequest): Observer<string> {
  const request = requireRequest(fields, 'users.roleOf');
  const subject = requireNonEmptyString(
    request.subject,
    'users.roleOf.subject',
  );
  return createObserver(
    ROLE_OF_OBSERVER_ID,
    reading.property({ subject, key: ROLE_KEY }),
    decodeRole,
  );
}

function rolesOf(fields: QueryRolesOfRequest): Observer<string> {
  const request = requireRequest(fields, 'users.rolesOf');
  const subjects = freezeSubjects(request.subjects);
  return createManyObserver(
    ROLES_OF_OBSERVER_ID,
    function* roleReadings() {
      for (const subject of subjects) {
        yield reading.property({ subject, key: ROLE_KEY });
      }
    },
    decodeRole,
  );
}

export const users = Object.freeze({
  intents: Object.freeze({
    registerUser,
    assignRole,
  }),
  observers: Object.freeze({
    roleOf,
    rolesOf,
  }),
});
`;

function requireOutputPath(): string {
  const index = process.argv.indexOf('--out');
  if (index === -1) {
    throw new GeneratedSdkUsageError('missing required --out <path> argument');
  }
  const output = process.argv[index + 1];
  if (output === undefined) {
    throw new GeneratedSdkUsageError('--out flag requires a path argument');
  }
  return output;
}

requireRegisterUserContract();
requireAssignRoleContract();
requireRoleOfContract();
requireRolesOfContract();
writeFileSync(requireOutputPath(), SDK_SOURCE);
