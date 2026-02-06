import stripAnsiLib from 'strip-ansi';

// Strip ANSI escape codes for snapshot testing
export function stripAnsi(str) {
  return stripAnsiLib(str);
}

export default { stripAnsi };
