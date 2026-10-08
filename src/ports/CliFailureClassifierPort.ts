/** Recognizes the executable's runtime CLI error class without importing it. */
export default interface CliFailureClassifierPort {
  isCliError(error: Error): boolean;
}
