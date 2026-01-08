import GraphPersistencePort from '../../ports/GraphPersistencePort.js';

/**
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {import('../../../plumbing/index.js').default} options.plumbing
   */
  constructor({ plumbing }) {
    super();
    this.plumbing = plumbing;
  }

  get emptyTree() {
    return this.plumbing.emptyTree;
  }

  async commitNode({ message, parents = [], sign = false }) {
    const args = ['commit-tree', this.emptyTree];
    
    parents.forEach((p) => {
      args.push('-p', p);
    });

    if (sign) {
      args.push('-S');
    }
    args.push('-m', message);

    return await this.plumbing.execute({ args });
  }

  async showNode(sha) {
    return await this.plumbing.execute({ args: ['show', '-s', '--format=%B', sha] });
  }

  async logNodes({ ref, limit = 50, format }) {
    return await this.plumbing.execute({ args: ['log', `-${limit}`, `--format=${format}`, ref] });
  }
}
