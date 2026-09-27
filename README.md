# btso.dev

Tyler South's personal site at [btso.dev](https://btso.dev). Omarchy themes (press `T` to cycle), a homepage hero
built from real GitHub activity, a ship log of every release, an Omarchy hub, and a page per app.
Legal pages live at their own routes.

Built with [Astro](https://astro.build).

## Stack

- Astro 6 (static, Vercel adapter)
- Auto sitemap (`@astrojs/sitemap`), ship log RSS (`@astrojs/rss`)
- Inter variable + JetBrains Mono (self-hosted via Fontsource)
- Social preview images rendered at build from the site's data (`@resvg/resvg-js`, JetBrains Mono in `scripts/og-fonts`)
- Deployed on Vercel

## Run locally

```bash
npm install
npm run dev        # http://localhost:4321
```

## Build

```bash
npm run og         # social images into public/og/ (also runs as part of build)
npm run build      # social images, then astro build
npm run lint
```

## Structure

- `src/pages/` - routes (homepage, ship log, Omarchy hub, `/p/<app>`, legal, 404)
- `src/layouts/` - `Base.astro` (shell + theme), `Legal.astro` (legal content)
- `src/components/` - header, footer, SEO, cards and release entries
- `src/data/projects.json` - apps shown on the site; `src/data/github.json` - GitHub snapshot
- `src/lib/ship.ts` - merges the two, stats, release note rendering
- `src/scripts/` - client code: themes, hero canvas, live activity, ship log filters
- `src/lib/site.ts` - canonical URL, name, emails
- `scripts/generate-og.mjs` - social images for the homepage, ship log, Omarchy hub and each app
- `src/pages/llms.txt.ts` - plain-text site summary for AI tools, built from the project list
- `public/` - static assets and favicons

## GitHub data

`src/data/projects.json` is the opt-in list of apps shown on the site (name, group, tagline,
images, install command). `src/data/github.json` is a snapshot of their stars, releases and the
contribution calendar, written by `scripts/fetch-github.mjs`:

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/fetch-github.mjs
```

The `Refresh GitHub data` workflow runs that and commits the snapshot when it changed, which
deploys the site. [btsouth/btso-watch](https://github.com/btsouth/btso-watch), a Cloudflare
Worker on a cron, triggers it with a `repository_dispatch` within minutes of a new release and every 6 hours for stars
and the activity calendar. The workflow's own daily schedule is only a safety net. The homepage
hero also polls GitHub's public events API in the browser, so new pushes and releases show up
within a few minutes without a rebuild.

Adding an app: add an entry to `projects.json` (and any images under `public/assets/projects/`),
then run the fetch script.

## Deploy

GitHub `main` deploys to Vercel production at `btso.dev`.

## License

The code is MIT licensed, see [LICENSE](LICENSE). That covers the site's code, not its content:
my photo and the app icons and screenshots under `public/` belong to me and aren't included,
so please swap in your own. JetBrains Mono in `scripts/og-fonts/` is under the
SIL Open Font License ([OFL.txt](scripts/og-fonts/OFL.txt)).

