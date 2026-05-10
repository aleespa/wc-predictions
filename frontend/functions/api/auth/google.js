export async function onRequest(context) {
  const { env } = context;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: 'https://wc-predictions.pages.dev/api/auth/callback',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302
  );
}
