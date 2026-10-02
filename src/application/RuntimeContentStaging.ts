import type { ContentInput } from '../domain/api/ContentInput.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import type ContentStagingAuthority from '../domain/services/ContentStagingAuthority.ts';
import type AssetStoragePort from '../ports/AssetStoragePort.ts';
import type RuntimeActivity from './RuntimeActivity.ts';

type RuntimeContentStagingOptions = Readonly<{
  readonly activity: RuntimeActivity;
  readonly authority: ContentStagingAuthority;
  readonly storage: () => AssetStoragePort | null;
  readonly slug: string;
}>;

/** Composes one lane's staging capability with its owning Runtime's lifetime. */
export default class RuntimeContentStaging {
  readonly #options: RuntimeContentStagingOptions;

  constructor(options: RuntimeContentStagingOptions) {
    this.#options = Object.freeze({ ...options });
    Object.freeze(this);
  }

  stage(content: ContentInput, metadata?: ContentMetadataInput): Promise<StagedContent> {
    const { activity, authority, storage, slug } = this.#options;
    return activity.run(async () => await authority.stage({
      assetStorage: storage(), content, metadata, slug,
    }));
  }
}
