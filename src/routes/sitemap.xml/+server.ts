import { absoluteUrl, localizedPages, xDefaultPath } from '$lib/seo';
import type { RequestHandler } from './$types';

export const prerender = true;

const lastmod = '2026-07-17';
type SitemapAlternatePage = {
  hreflang: string;
  path: string;
};
const advancedLocalizedPages = [
  { hreflang: 'en', path: '/advanced/' },
  { hreflang: 'pt-BR', path: '/pt/advanced/' }
] as const;

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function alternateLinks(pages: readonly { hreflang: string; path: string }[], defaultPath: string) {
  const links = pages.map(
    ({ hreflang, path }) =>
      `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(
        absoluteUrl(path)
      )}" />`
  );

  links.push(
    `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
      absoluteUrl(defaultPath)
    )}" />`
  );

  return links.join('\n    ');
}

function urlEntry(
  path: string,
  priority: string,
  pages: readonly SitemapAlternatePage[] = localizedPages,
  defaultPath = xDefaultPath
) {
  return `<url>
    <loc>${escapeXml(absoluteUrl(path))}</loc>
    ${alternateLinks(pages, defaultPath)}
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: RequestHandler = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urlEntry('/', '1.0')}
  ${urlEntry('/pt/', '0.9')}
  ${urlEntry('/advanced/', '0.8', advancedLocalizedPages, '/advanced/')}
  ${urlEntry('/pt/advanced/', '0.7', advancedLocalizedPages, '/advanced/')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
