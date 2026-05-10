export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://wc-predictions.pages.dev/api/auth/callback',
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Token exchange failed:', errText);
    return new Response('Token exchange failed', { status: 500 });
  }

  const { id_token } = await tokenRes.json();

  // Decode the Google ID token (no verification needed — Google just issued it)
  const [, payload] = id_token.split('.');
  // atob only handles standard base64; Google uses base64url, so we need to fix padding
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const user = JSON.parse(atob(padded));

  // Create a session ID and store user info in KV (expires in 7 days)
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(
    sessionId,
    JSON.stringify({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    }),
    { expirationTtl: 60 * 60 * 24 * 7 }
  );

  // Set session cookie and redirect to app
  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://wc-predictions.pages.dev/#/',
      'Set-Cookie': [
        `session=${sessionId}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=604800',
      ].join('; '),
    },
  });
}
