/**
 * Well-known legacy property key for content attachment.
 * Stores a content-addressed blob OID as the property value.
 */
export const CONTENT_PROPERTY_KEY = '_content';

/**
 * Well-known legacy property key for attached content MIME metadata.
 * Stores a MIME type hint for the attached logical content referenced by `_content`.
 */
export const CONTENT_MIME_PROPERTY_KEY = '_content.mime';

/**
 * Well-known legacy property key for attached content byte-size metadata.
 * Stores the byte length of the attached logical content referenced by `_content`.
 */
export const CONTENT_SIZE_PROPERTY_KEY = '_content.size';
