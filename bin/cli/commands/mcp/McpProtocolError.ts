import type { McpJsonValue } from './McpJsonValue.ts';

export default class McpProtocolError extends Error {
  readonly code: number;
  readonly data?: McpJsonValue;

  constructor(code: number, message: string, data?: McpJsonValue) {
    super(message);
    this.code = code;
    if (data !== undefined) {
      this.data = data;
    }
  }
}
