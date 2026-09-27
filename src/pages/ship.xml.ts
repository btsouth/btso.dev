import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { notesHtml, releases } from '../lib/ship';

// The ship log as RSS: every release with its notes.
export function GET(context: APIContext) {
  return rss({
    title: 'btso.dev ship log',
    description: 'Every release across Tyler South\'s apps.',
    site: context.site ?? 'https://btso.dev',
    items: releases.slice(0, 100).map((r) => ({
      title: `${r.project.name} ${r.tag}`,
      link: r.url,
      pubDate: new Date(r.at),
      content: notesHtml(r.body, r.project),
      categories: [r.project.name],
    })),
  });
}
