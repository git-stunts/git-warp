import type RefPort from '../../ports/RefPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type ContentOwner from '../api/ContentOwner.ts';
import ContentReadBasis from './ContentReadBasis.ts';
import ContentReadProjection from './ContentReadProjection.ts';

type ContentReadBinding = Readonly<{ refs: RefPort; journal: PatchJournalPort }>;
const bindings = new WeakMap<WarpWorldline, ContentReadBinding>();

export function bindContentReadRuntime(runtime: WarpWorldline, binding: ContentReadBinding): void {
  if (bindings.has(runtime)) { throw new WarpError('Content read runtime already bound', 'E_CONTENT_READ_BINDING'); }
  bindings.set(runtime, Object.freeze({ ...binding }));
}

export async function captureContentReadBasis(runtime: WarpWorldline): Promise<ContentReadBasis> {
  return await ContentReadBasis.capture(requireBinding(runtime).refs, runtime.worldlineName);
}

export async function projectContent(runtime: WarpWorldline, owner: ContentOwner, basis: ContentReadBasis) {
  return await new ContentReadProjection(owner).read(requireBinding(runtime).journal, basis);
}

function requireBinding(runtime: WarpWorldline): ContentReadBinding {
  const binding = bindings.get(runtime);
  if (binding === undefined) { throw new WarpError('Content read runtime unavailable', 'E_CONTENT_READ_BINDING'); }
  return binding;
}
