/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          0: '#07090f',
          1: '#0b0f18',
          2: '#10141f',
          3: '#171c28',
          4: '#1f2533',
          5: '#2a3142',
        },
        line: {
          DEFAULT: '#1e2433',
          soft: '#161c28',
          strong: '#2f3649',
        },
        fg: {
          DEFAULT: '#e6eaf2',
          soft: '#a6adbd',
          mute: '#6b7486',
        },
        brand: {
          500: '#4d8fff',
          600: '#1a6cff',
          700: '#1557d6',
        },
        ok: '#10b981',
        warn: '#f59e0b',
        err: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
