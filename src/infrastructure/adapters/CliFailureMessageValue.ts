/** Display transport data after sanitization and a bounded UTF-8 prefix. */
export type CliFailureMessageValue = Readonly<{ message: string; truncated: boolean }>;
