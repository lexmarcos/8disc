import type { Handle } from '@sveltejs/kit';

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  for (const [header, value] of Object.entries(crossOriginIsolationHeaders)) {
    response.headers.set(header, value);
  }

  return response;
};
