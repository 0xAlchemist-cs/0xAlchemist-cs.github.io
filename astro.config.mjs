import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://0xalchemist-cs.github.io',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  vite: {
    server: {
      watch: {
        ignored: [
          '**/.tools/**',
          '**/reports/**',
          '**/test-results/**',
          '**/playwright-report/**',
        ],
      },
    },
  },
  integrations: [
    mdx(),
    sitemap({ filter: (url) => !url.endsWith('/search/') }),
  ],
  markdown: { shikiConfig: { theme: 'github-light-high-contrast' } },
});
