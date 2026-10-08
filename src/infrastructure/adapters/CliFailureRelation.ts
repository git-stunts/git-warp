/** Wire labels describe cause edges; they do not select domain behavior. */
export type CliFailureRelation = 'cause' | 'originalError' | 'aggregate' | 'cleanup';
