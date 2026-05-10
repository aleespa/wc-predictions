export async function onRequest(context) {
  const { request, env } = context;

  const cookie = request.headers.get('Cookie') || '';
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (!sessionId) {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await env.SESSIONS.get(sessionId);

  if (!data) {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
