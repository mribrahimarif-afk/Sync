import type { NextConfig } from 'next';

// The API origin is public by nature (it is called from the browser), so it is the only
// NEXT_PUBLIC_ variable. Never put secrets in NEXT_PUBLIC_ variables: they are shipped to browsers.
// The value is inlined at build time; change it by rebuilding.
function resolveApiBaseUrl(raw: string | undefined): string {
  const value = raw && raw.trim() !== '' ? raw.trim() : 'http://localhost:4000';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL "${value}" is not a valid URL. ` +
        'Set it to the API origin, e.g. http://localhost:4000 (see apps/web/.env.example).',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL must use http: or https: (got "${url.protocol}").`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_BASE_URL: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
  },
};

export default nextConfig;
