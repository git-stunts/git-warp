import Intent from '../../src/domain/api/Intent.ts';
import {
  createManyObserver,
  createObserver,
} from '../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../src/domain/api/Reading.ts';

export const users = Object.freeze({
  intents: Object.freeze({
    assignRole(fields: { readonly subject: string; readonly role: string }) {
      return Intent.setProperty({
        subject: fields.subject,
        key: 'role',
        value: fields.role,
      });
    },
  }),
  observers: Object.freeze({
    roleOf(fields: { readonly subject: string }) {
      return createObserver<string>(
        'users.role-of',
        LegacyReading.property({ subject: fields.subject, key: 'role' }),
        (value) => {
          if (typeof value !== 'string') {
            throw new TypeError('users.role-of expected a string');
          }
          return value;
        },
      );
    },
    rolesOf(fields: { readonly subjects: readonly string[] }) {
      return createManyObserver<string>(
        'users.roles-of',
        function* () {
          for (const subject of fields.subjects) {
            yield LegacyReading.property({ subject, key: 'role' });
          }
        },
        (value) => {
          if (typeof value !== 'string') {
            throw new TypeError('users.roles-of expected a string');
          }
          return value;
        },
      );
    },
  }),
});
