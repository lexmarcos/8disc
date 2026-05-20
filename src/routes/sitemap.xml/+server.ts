import { absoluteUrl, localizedPages, xDefaultPath } from '$lib/seo';
import type { RequestHandler } from './$types';

export const prerender = true;

const lastmod = '2026-05-20';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function alternateLinks() {
  const links = localizedPages.map(
    ({ hreflang, path }) =>
      `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(
        absoluteUrl(path)
      )}" />`
  );

  links.push(
    `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
      absoluteUrl(xDefaultPath)
    )}" />`
  );

  return links.join('\n    ');
}

function urlEntry(path: string, priority: string) {
  return `<url>
    <loc>${escapeXml(absoluteUrl(path))}</loc>
    ${alternateLinks()}
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: RequestHandler = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="https://www.w3.org/1999/xhtml">
  ${urlEntry('/', '1.0')}
  ${urlEntry('/pt/', '0.9')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
