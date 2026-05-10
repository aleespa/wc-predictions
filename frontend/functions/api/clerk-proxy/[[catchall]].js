export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://wc-predictions.pages.dev',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  
  // Define the target Clerk Frontend API URL
  // We use the one provided in your prompt, but fall back to the account domain if needed.
  // Given the error dev_browser_unauthenticated, it's vital we use the correct account domain for dev instances.
  const CLERK_DOMAIN = 'stirred-bear-45.clerk.accounts.dev';
  
  const clerkUrl = new URL(
    `https://${CLERK_DOMAIN}` +
    url.pathname.replace('/api/clerk-proxy', '') +
    url.search
  );

  const headers = new Headers(request.headers);
  headers.set('Host', CLERK_DOMAIN);
  headers.set('Origin', 'https://wc-predictions.pages.dev');
  
  // Ensure Clerk-Proxy-Url is set correctly for session handling
  headers.set('Clerk-Proxy-Url', 'https://wc-predictions.pages.dev/api/clerk-proxy');
  
  if (env.CLERK_SECRET_KEY) {
    headers.set('Clerk-Secret-Key', env.CLERK_SECRET_KEY);
  }

  const response = await fetch(new Request(clerkUrl.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? request.body
      : undefined,
    redirect: 'manual'
  }));

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', 'https://wc-predictions.pages.dev');
  responseHeaders.set('Access-Control-Allow-Credentials', 'true');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
