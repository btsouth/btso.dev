import { SITE_URL } from './site';
import { generatedAt } from './ship';

// Social images are regenerated with the GitHub data (scripts/generate-og.mjs),
// so their URLs carry the data's timestamp and link previews refresh with it.
export const ogImage = (path: string) => `${SITE_URL}${path}?v=${Date.parse(generatedAt)}`;
