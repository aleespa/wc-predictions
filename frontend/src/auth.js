import { Clerk } from '@clerk/clerk-js';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file.");
}

export const clerk = new Clerk(clerkPublishableKey);

export async function initAuth() {
  try {
    await clerk.load({
      proxyUrl: '/api/clerk-proxy',
      routing: 'hash',
      navigate: (to) => {
        // Handle hash-based routing for Clerk redirects
        // If 'to' is a full URL or already has a hash, we handle it
        if (to.includes('#')) {
           const [base, hash] = to.split('#');
           window.location.hash = hash;
        } else {
           const path = to.startsWith('/') ? to : `/${to}`;
           window.location.hash = `#${path}`;
        }
      }
    });
  } catch (err) {
  }
  
  // Listen for session changes to keep the app in sync
  clerk.addListener(({ session, user }) => {
  });
}
