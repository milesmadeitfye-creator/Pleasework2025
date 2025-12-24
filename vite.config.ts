import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['recharts'],
  },
  build: {
    // Increase limit since Stream.io is legitimately large (used for video/chat)
    chunkSizeWarningLimit: 2000,
    // Use esbuild for faster minification (default)
    minify: 'esbuild',
    // Target modern browsers for better compression
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],

          // Stream.io chat (separate from video)
          'vendor-stream-chat': ['stream-chat', 'stream-chat-react'],

          // Stream.io video (separate chunk, lazy loaded)
          'vendor-stream-video': ['@stream-io/video-react-sdk'],

          // UI Icons
          'vendor-ui': ['lucide-react'],
        },
      },
    },
  },
});
