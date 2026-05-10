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

const BACKEND_URL = 'https://wc-predictions.duckdns.org'; // Update if needed

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

  if (sessionId) {
    const sessionData = await env.SESSIONS.get(sessionId);
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        userSub = parsed.sub ?? null;
      } catch { /* ignore malformed session */ }
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

  const headers = new Headers(request.headers);
  // Remove the session cookie — the backend doesn't need it
  headers.delete('Cookie');
  // Inject the trusted user identity header
  if (userSub) {
    headers.set('X-User-Sub', userSub);
    // Also forward name and email for auto-creating the user on first sign-in
    if (sessionId) {
      const sessionData = await env.SESSIONS.get(sessionId);
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData);
          if (parsed.email) headers.set('X-User-Email', parsed.email);
          if (parsed.name)  headers.set('X-User-Name', parsed.name);
        } catch { /* ignore */ }
      }
    }
  }
  // Ensure the host header points to the backend
  headers.set('Host', new URL(BACKEND_URL).host);

  const proxyRequest = new Request(backendUrl.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow',
  });

  const response = await fetch(proxyRequest);

  // Strip any CORS headers from the backend — Cloudflare Pages handles CORS
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('Access-Control-Allow-Origin');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
