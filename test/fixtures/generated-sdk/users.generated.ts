/* @generated from users.graphql by Wesley and the git-warp SDK fixture renderer. */

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
    throw new UsersSdkValidationError(`${operation} request must be an object`);
  }
  return request;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UsersSdkValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

function freezeSubjects(subjects: string[]): readonly string[] {
  if (!Array.isArray(subjects)) {
    throw new UsersSdkValidationError('users.rolesOf.subjects must be an array');
  }
  if (subjects.length > MAX_ROLE_READINGS) {
    throw new UsersSdkValidationError(
      `users.rolesOf.subjects must contain at most ${MAX_ROLE_READINGS} values`,
    );
  }
  return Object.freeze(
    subjects.map((subject, index) =>
      requireNonEmptyString(subject, `users.rolesOf.subjects[${index}]`)
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
