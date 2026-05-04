import QueryError from '../../errors/QueryError.ts';

export default class OpticReadFailureSchemaError extends QueryError {
  constructor(message: string, context: QueryError['context'] = {}) {
    super(message, {
      code: 'E_OPTIC_FAILURE_SCHEMA',
      context,
    });
    Object.freeze(this);
  }
}
