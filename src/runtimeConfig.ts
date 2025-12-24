export const RUNTIME_CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  build: {
    branch: import.meta.env.CONTEXT || import.meta.env.VITE_GIT_BRANCH || 'unknown',
    commit: (import.meta.env.VITE_GIT_COMMIT_SHA || 'unknown').toString().slice(0, 7),
  },
};
