// Simple local debug to mirror what Netlify will use
console.log("Deploy debug:");
console.log("- NODE_ENV:", process.env.NODE_ENV || "(not set)");
console.log("- VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL || "(not set)");
console.log("- VITE_FUNCTIONS_ORIGIN:", process.env.VITE_FUNCTIONS_ORIGIN || "(not set)");
console.log("- STRIPE_SECRET_KEY present:", !!process.env.STRIPE_SECRET_KEY);
console.log("- STRIPE_WEBHOOK_SECRET present:", !!process.env.STRIPE_WEBHOOK_SECRET);
// NOTE: OpenAI keys are only in Supabase Edge Functions, not Netlify
