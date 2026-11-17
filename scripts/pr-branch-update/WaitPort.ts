/** Waits between polls of GitHub. Tests inject a wait that returns at once. */
export interface WaitPort {
  wait(milliseconds: number): Promise<void>;
}
