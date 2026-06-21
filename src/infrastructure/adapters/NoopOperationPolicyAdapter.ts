import OperationPolicyPort, {
  type OperationPolicyExecuteOptions,
} from '../../ports/OperationPolicyPort.ts';

export default class NoopOperationPolicyAdapter extends OperationPolicyPort {
  override async execute<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<T> {
    return await operation(options.signal);
  }

  override async stream<T>(
    operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<AsyncIterable<T>> {
    return await operation(options.signal);
  }
}
