export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Define the target Clerk Frontend API URL
  // This is derived from your publishable key's decoded domain
  const CLERK_FRONTEND_API = "https://stirred-bear-45.clerk.accounts.dev";
  
  // Update the hostname to Clerk's Frontend API
  url.hostname = new URL(CLERK_FRONTEND_API).hostname;
  
  // Ensure we strip the prefix correctly
  url.pathname = url.pathname.replace(/^\/api\/clerk-proxy/, "");
  if (!url.pathname.startsWith("/")) {
    url.pathname = "/" + url.pathname;
  }

  // Create the new request to forward
  const proxyReq = new Request(url.toString(), {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.body,
    redirect: 'manual',
  });

  // Add required Clerk proxy headers
  proxyReq.headers.set('Clerk-Proxy-Url', 'https://wc-predictions.pages.dev/api/clerk-proxy');
  
  // Use the secret key from environment variables
  if (env.CLERK_SECRET_KEY) {
    proxyReq.headers.set('Clerk-Secret-Key', env.CLERK_SECRET_KEY);
  }
  
  // Set X-Forwarded-For using Cloudflare's IP header
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) {
    proxyReq.headers.set('X-Forwarded-For', clientIp);
  }

  // Forward the request to Clerk
  return fetch(proxyReq);
}
