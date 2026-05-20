import type { Handle } from '@sveltejs/kit';

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

function getHtmlLang(pathname: string) {
  return pathname === '/pt' || pathname.startsWith('/pt/') ? 'pt-BR' : 'en';
}

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace('<html lang="en">', `<html lang="${getHtmlLang(event.url.pathname)}">`)
  });

  for (const [header, value] of Object.entries(crossOriginIsolationHeaders)) {
    response.headers.set(header, value);
  }

  return response;
};
