/**
 * Cloudflare Pages Function: /api/me
 *
 * This function handles the /api/me endpoint by:
 * 1. Resolving the session from the cookie.
 * 2. Forwarding the request to the backend with the trusted X-User-Sub header.
 *
 * This ensures the backend can return the full user stats (points, etc.)
 * using the new session cookie authentication.
 */

const BACKEND_URL = 'https://wc-predictions-backend.fly.dev';

export async function onRequest(context) {
  const { request, env } = context;

  // Validate environment configuration
  if (!env.SESSIONS) {
    console.error('KV SESSIONS binding missing in /api/me');
    return new Response(JSON.stringify({ detail: 'Cloudflare KV SESSIONS binding missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve session from cookie
  const cookie = request.headers.get('Cookie') || '';
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (!sessionId) {
    return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionData = await env.SESSIONS.get(sessionId);
  if (!sessionData) {
    return new Response(JSON.stringify({ detail: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = JSON.parse(sessionData);
  const userSub = user.sub;

  // Build the proxied request to the backend
  const backendUrl = new URL('/api/me', BACKEND_URL);

  const headers = new Headers();
  // We don't forward all headers from the client to avoid conflicts
  headers.set('X-User-Sub', userSub);
  if (user.email) headers.set('X-User-Email', user.email);
  if (user.name)  headers.set('X-User-Name', user.name);
  headers.set('Host', new URL(BACKEND_URL).host);
  headers.set('Accept', 'application/json');

  const proxyRequest = new Request(backendUrl.toString(), {
    method: 'GET',
    headers,
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
    console.error('Proxy fetch failed:', err);
    return new Response(JSON.stringify({ detail: 'Failed to reach backend server' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
