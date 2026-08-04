const POSIX_HOME_PATTERN = [
  ['', 'Users', String.raw`[^/\s]+`].join('/') + String.raw`(?:/|$)`,
  ['', 'home', String.raw`[^/\s]+`].join('/') + String.raw`(?:/|$)`,
];
const DARWIN_TEMP_PATTERN = [
  ['', 'private', 'var', 'folders', String.raw`[^/\s]+`].join('/') + String.raw`(?:/|$)`,
  ['', 'var', 'folders', String.raw`[^/\s]+`].join('/') + String.raw`(?:/|$)`,
];
const WINDOWS_HOME_PATTERN = String.raw`[A-Za-z]:\\` + 'Users' + String.raw`\\[^\\\s]+(?:\\|$)`;

const MACHINE_LOCAL_PATH_PATTERN = new RegExp(
  [...POSIX_HOME_PATTERN, ...DARWIN_TEMP_PATTERN, WINDOWS_HOME_PATTERN].join('|'),
  'u'
);

export class MachineLocalPathPolicy {
  containsMachineLocalPath(content: string): boolean {
    return MACHINE_LOCAL_PATH_PATTERN.test(content);
  }
}
