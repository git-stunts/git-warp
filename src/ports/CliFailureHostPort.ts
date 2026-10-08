/** Process capabilities used to finish a failed CLI invocation. */
export default interface CliFailureHostPort {
  close(): Promise<void>;
  writeHuman(text: string): void;
  writeMachine(text: string): void;
  exit(code: number): void;
}
