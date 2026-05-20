const fallbackSiteOrigin = 'https://8disc.app';
const configuredSiteOrigin = import.meta.env.PUBLIC_SITE_URL as string | undefined;

function normalizeSiteOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}

export const siteOrigin = normalizeSiteOrigin(configuredSiteOrigin || fallbackSiteOrigin);
export const siteName = '8disc';
export const ogImagePath = 'https://i.imgur.com/9cBXKJ8.png';

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
