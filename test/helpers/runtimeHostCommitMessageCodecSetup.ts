import { installDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { installRuntimeHostStorageResolver } from '../../src/domain/warp/RuntimeHostPortResolvers.ts';
import MemoryRuntimeStorageAdapter from '../../src/infrastructure/adapters/MemoryRuntimeStorageAdapter.ts';

installDefaultRuntimeHostNodePorts();
installRuntimeHostStorageResolver((history) => new MemoryRuntimeStorageAdapter({ history }));
