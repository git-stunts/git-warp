import StagedContent from '../api/StagedContent.ts';
import WarpError from '../errors/WarpError.ts';
import type ContentAttachmentPayload from '../graph/ContentAttachmentPayload.ts';
import {
  stageContentAttachment,
  type StageContentAttachmentOptions,
} from './PatchBuilderContent.ts';

/** Owns staging provenance for one Runtime; metadata alone cannot authorize publication. */
export default class ContentStagingAuthority {
  readonly #payloads = new WeakMap<StagedContent, ContentAttachmentPayload>();

  constructor() { Object.freeze(this); }

  async stage(options: StageContentAttachmentOptions): Promise<StagedContent> {
    const payload = await stageContentAttachment(options);
    if (payload.size === null) {
      throw new WarpError('Staged content is missing its plaintext size', 'E_CONTENT_SIZE');
    }
    const content = new StagedContent({
      id: payload.handle.toString(),
      mime: payload.mime === null ? null : payload.mime.toString(),
      size: payload.size.toNumber(),
    });
    this.#payloads.set(content, payload);
    return content;
  }

  requirePayload(content: StagedContent): ContentAttachmentPayload {
    const payload = this.#payloads.get(content);
    if (payload === undefined) {
      throw new WarpError('Content was not staged by this Runtime', 'E_CONTENT_FOREIGN');
    }
    return payload;
  }
}
