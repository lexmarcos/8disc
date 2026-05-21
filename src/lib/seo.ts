const fallbackSiteOrigin = 'https://8disc.pro';
const configuredSiteOrigin = import.meta.env.PUBLIC_SITE_URL as string | undefined;
const legacySiteOrigin = 'https://8disc.app';

function normalizeSiteOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}

export const siteOrigin = normalizeSiteOrigin(
  configuredSiteOrigin && configuredSiteOrigin !== legacySiteOrigin
    ? configuredSiteOrigin
    : fallbackSiteOrigin
);
export const siteName = '8disc';
export const ogImagePath = '/og-image.jpg?v=2';
export const ogImageType = 'image/jpeg';
export const ogImageWidth = 1200;
export const ogImageHeight = 630;

export const localizedPages = [
  { locale: 'en', hreflang: 'en', path: '/', label: 'English' },
  { locale: 'pt', hreflang: 'pt-BR', path: '/pt/', label: 'Portugues' }
] as const;

export const xDefaultPath = '/';

export type SeoLocale = (typeof localizedPages)[number]['locale'];

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin}${normalizedPath}`;
}
