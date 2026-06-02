import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const fallbackSiteOrigin = 'https://8disc.pro';
const siteOrigin = (process.env.PUBLIC_SITE_URL || fallbackSiteOrigin).replace(/\/+$/, '');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: '200.html'
    }),
    prerender: {
      origin: siteOrigin
    }
  }
};

export default config;
