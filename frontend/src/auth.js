// Self-hosted Google OAuth auth module.
// Session is maintained server-side in Cloudflare KV; the browser only holds a
// HttpOnly session cookie — no tokens are exposed to JavaScript.

let currentUser = null;

/**
 * Call once on app load. Fetches the current session from the server and
 * populates `currentUser`. Returns the user object or null.
 */
export async function initAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    currentUser = data ?? null;
  } catch (err) {
    console.error('Auth: Failed to fetch session', err);
    currentUser = null;
  }
  return currentUser;
}

/** Returns the current user object { sub, email, name, picture } or null. */
export function getUser() {
  return currentUser;
}

/** Returns true if a user is currently signed in. */
export function isAuthenticated() {
  return currentUser !== null;
}

/** Redirects the browser to the Google OAuth consent screen. */
export function signIn() {
  window.location.href = '/api/auth/google';
}

/** Clears the server-side session and redirects to /login. */
export function signOut() {
  window.location.href = '/api/auth/logout';
}
