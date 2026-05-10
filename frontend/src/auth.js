import { Clerk } from '@clerk/clerk-js';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file.");
}

export const clerk = new Clerk(clerkPublishableKey);

export async function initAuth() {
  try {
    await clerk.load({
      proxyUrl: 'https://wc-predictions.pages.dev/api/clerk-proxy'
    });
  } catch (err) {
  }
  
  // Listen for session changes to keep the app in sync
  clerk.addListener(({ session, user }) => {
  });
}
