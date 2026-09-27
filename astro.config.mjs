// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

const SITE = 'https://btso.dev';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({
    isr: false,
  }),
  integrations: [
    // No lastmod/changefreq: a uniform build timestamp on every URL is noise
    // Google discounts, and a wrong lastmod is worse than none.
    sitemap(),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  redirects: {
    // Company-era routes folded into the personal dev site's anchors.
    '/about': '/#about',
    '/contact': '/#about',
    '/support': '/#about',
    '/products': '/#projects',
    '/products/toolport': 'https://toolport.app',
    '/work': '/#projects',
  },
  vite: {
    resolve: {},
  },
});
