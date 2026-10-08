/** Serialization DTO for an already validated display node. */
export type CliFailureNodeValue = Readonly<{
  code: string;
  message: string;
  relation: string;
  causes: readonly CliFailureNodeValue[];
  truncated: boolean;
}>;
