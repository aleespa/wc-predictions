export async function onRequest(context) {
  const { request, env } = context;

  const cookie = request.headers.get('Cookie') || '';
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (sessionId) {
    await env.SESSIONS.delete(sessionId);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://wc-predictions.pages.dev/#/login',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
}
