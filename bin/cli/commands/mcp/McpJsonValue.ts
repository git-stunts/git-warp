export type McpJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly McpJsonValue[]
  | { readonly [key: string]: McpJsonValue };

export type McpJsonObject = { readonly [key: string]: McpJsonValue };

export function isMcpJsonObject(value: unknown): value is McpJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
