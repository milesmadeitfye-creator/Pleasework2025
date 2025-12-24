/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ghoste: {
          // New strict color palette - Dark Navy / Black / White only
          navy: '#07111E',        // primary app background
          black: '#000000',       // top nav, panels, footers
          white: '#F8FAFC',       // main text
          blue: '#1A6CFF',        // accents, active states
          grey: '#94A3B8',        // secondary text / labels
          success: '#00F7A7',     // connected/active indicators
          warning: '#FACC15',     // warning status
          error: '#EF4444',       // error states

          // Legacy aliases for backward compatibility (map to new palette)
          bg: '#07111E',
          'bg-secondary': '#000000',
          surface: '#000000',
          'surface-hover': '#1A1A24',
          accent: '#1A6CFF',
          'accent-hover': '#1557D6',
          'accent-soft': '#0A2E6B',
          border: '#1E293B',
          'border-light': '#334155',
          text: '#F8FAFC',
          'text-muted': '#94A3B8',
          'text-secondary': '#64748B',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
