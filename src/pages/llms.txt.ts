import type { APIContext } from 'astro';
import { GROUPS, projects, type Group } from '../lib/ship';

// A plain-text summary for AI tools, built from the same project list as the site.
export function GET({ site }: APIContext) {
  const base = String(site ?? 'https://btso.dev').replace(/\/$/, '');
  const section = (g: Group) =>
    projects
      .filter((p) => p.group === g)
      .map((p) => `- [${p.name}](${p.site ?? `https://github.com/${p.repo}`}): ${p.tagline}${p.version ? ` Latest release ${p.version}.` : ''} Source: https://github.com/${p.repo}`)
      .join('\n');
  const body = `# btso.dev

> Tyler South makes Omarchy apps, Windows utilities and tools for working with AI agents. Almost all of it is open source, and every release is listed in the ship log as it ships.

## ${GROUPS.ai}
${section('ai')}

## ${GROUPS.omarchy}
${section('omarchy')}

## ${GROUPS.windows}
${section('windows')}

## On this site
- [Ship log](${base}/ship): every release across every app, with release notes. RSS: ${base}/ship.xml
- [Omarchy apps and plugins](${base}/omarchy)
- One page per app with its changelog: ${base}/p/<app>, for example ${base}/p/toolport

## About
- Tyler South, developer with a background in IT and security. Linux daily, still uses Windows.
- GitHub: https://github.com/btsouth
- Email: tyler@btso.dev
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
