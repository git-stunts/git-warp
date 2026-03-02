import CommitPort from './CommitPort.js';
import BlobPort from './BlobPort.js';
import TreePort from './TreePort.js';
import RefPort from './RefPort.js';

/**
 * Abstract port for graph persistence operations.
 *
 * Defines the contract for reading and writing graph data to a Git-backed
 * storage layer. Concrete adapters (e.g., GitGraphAdapter) implement this
 * interface to provide actual Git operations.
 *
 * This is a **composite port** that implements the union of four focused ports:
 *
 * - {@link CommitPort} — commit creation, reading, logging, counting, ping
 * - {@link BlobPort} — blob read/write
 * - {@link TreePort} — tree read/write, emptyTree getter
 * - {@link RefPort} — ref update/read/delete
 *
 * Domain services should document which focused port(s) they actually depend on
 * via JSDoc, even though they accept the full GraphPersistencePort at runtime.
 * This enables future narrowing without breaking backward compatibility.
 *
 * All methods throw by default and must be overridden by implementations.
 *
 * @abstract
 */
class GraphPersistencePort {}

/** @type {Array<typeof CommitPort | typeof BlobPort | typeof TreePort | typeof RefPort>} */
const focusedPorts = [CommitPort, BlobPort, TreePort, RefPort];
const seen = new Map();

for (const Port of focusedPorts) {
  const allDescriptors = Object.getOwnPropertyDescriptors(Port.prototype);
  /** @type {Record<string, PropertyDescriptor>} */
  const descriptors = Object.fromEntries(
    Object.entries(allDescriptors).filter(([k]) => k !== 'constructor'),
  );

  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (seen.has(name)) {
      throw new Error(
        `GraphPersistencePort composition collision: "${name}" defined by both ` +
          `${seen.get(name).name} and ${Port.name}`,
      );
    }
    seen.set(name, Port);
    Object.defineProperty(GraphPersistencePort.prototype, name, descriptor);
  }
}

export default GraphPersistencePort;
