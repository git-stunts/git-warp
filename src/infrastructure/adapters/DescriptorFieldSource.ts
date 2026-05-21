export type DescriptorFieldSource = {
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly targets: readonly string[];
  readonly schemaHash?: string;
  readonly sourceHash?: string;
  readonly integrityStatus?: string;
  readonly integrityScope?: string;
  readonly hashAlgorithm?: string;
  readonly signatureAlgorithm?: string;
  readonly signatureKeyId?: string;
  readonly generatedLegs?: readonly string[];
  readonly generatedFiles?: readonly string[];
};
