import { absoluteUrl } from '$lib/seo';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
      ''
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    }
  );
