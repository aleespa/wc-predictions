/**
 * Cloudflare Pages Function: /api/[[catchall]].js
 *
 * Intercepts all /api/* requests (except /api/auth/*) and acts as an
 * authenticated proxy to the backend.
 *
 * Flow:
 *  1. Read the session cookie and look up the user in KV.
 *  2. Forward the request to the backend with the resolved user identity in
 *     a trusted X-User-Sub header (the backend trusts this header because it
 *     is set by this server-side function, never by the browser).
 *  3. If no valid session exists and the route requires auth, return 401.
 */

const BACKEND_URL = 'https://wc-predictions-backend.fly.dev';

// Routes the backend accepts without authentication
const PUBLIC_PATH_PREFIXES = [
  '/api/matches',
  '/api/teams',
  '/api/leaderboard',
  '/api/bracket',
  '/api/community/leaderboard',
  '/api/users/',     // /api/users/:username  (public profiles)
];

function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p));
}

export async function onRequest(context) {
  const { request, env } = context;

  // Validate environment configuration
  if (!env.SESSIONS) {
    console.error('KV SESSIONS binding missing in [[catchall]]');
    // If KV is missing, we can't authenticate, but we can still allow public routes
    // through without the X-User-Sub header.
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Let /api/auth/* pass through to the dedicated auth functions — do not proxy them here.
  if (pathname.startsWith('/api/auth/')) {
    return context.next();
  }

  // Resolve session from cookie
  const cookie = request.headers.get('Cookie') || '';
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];
  let userSub = null;
  let userData = null;

  if (sessionId && env.SESSIONS) {
    try {
      const sessionData = await env.SESSIONS.get(sessionId);
      if (sessionData) {
        userData = JSON.parse(sessionData);
        userSub = userData.sub ?? null;
      }
    } catch (err) {
      console.error('KV get failed in [[catchall]]:', err);
    }
  }

  // Reject unauthenticated requests to protected routes
  if (!userSub && !isPublicPath(pathname)) {
    return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build the proxied request
  const backendUrl = new URL(pathname + url.search, BACKEND_URL);

  const headers = new Headers();
  // Copy relevant headers from original request
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!['cookie', 'host', 'cf-ray', 'cf-connecting-ip', 'x-user-sub', 'x-user-email', 'x-user-name'].includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  // Inject the trusted user identity header
  if (userSub) {
    headers.set('X-User-Sub', userSub);
    if (userData.email) headers.set('X-User-Email', userData.email);
    if (userData.name)  headers.set('X-User-Name', userData.name);
  }
  
  // Ensure the host header points to the backend
  headers.set('Host', new URL(BACKEND_URL).host);

  const proxyRequest = new Request(backendUrl.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow',
  });

  try {
    const response = await fetch(proxyRequest);

    // Strip any CORS headers from the backend — Cloudflare Pages handles CORS
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Access-Control-Allow-Origin');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Proxy fetch failed in [[catchall]]:', err);
    return new Response(JSON.stringify({ detail: 'Failed to reach backend server' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
