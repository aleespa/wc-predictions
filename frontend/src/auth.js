import { Clerk } from '@clerk/clerk-js';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file.");
}

export const clerk = new Clerk(clerkPublishableKey);

export async function initAuth() {
  console.log('Initializing Clerk...');
  await clerk.load();
  console.log('Clerk loaded. User:', clerk.user ? clerk.user.id : 'null');
  
  // Listen for session changes to keep the app in sync
  clerk.addListener(({ session, user }) => {
    console.log('Clerk session/user changed:', { sessionId: session?.id, userId: user?.id });
    // We can trigger a global re-render here if needed
  });
}
