export const FUNCTIONS_ORIGIN =
  import.meta.env.VITE_FUNCTIONS_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : '');
