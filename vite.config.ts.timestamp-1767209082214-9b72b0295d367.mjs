// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/home/project";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  optimizeDeps: {
    exclude: ["lucide-react"],
    include: ["recharts"]
  },
  build: {
    // Increase limit since Stream.io is legitimately large (used for video/chat)
    chunkSizeWarningLimit: 2e3,
    // Use esbuild for faster minification (default)
    minify: "esbuild",
    // Target modern browsers for better compression
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Supabase
          "vendor-supabase": ["@supabase/supabase-js"],
          // Stream.io chat (separate from video)
          "vendor-stream-chat": ["stream-chat", "stream-chat-react"],
          // Stream.io video (separate chunk, lazy loaded)
          "vendor-stream-video": ["@stream-io/video-react-sdk"],
          // UI Icons
          "vendor-ui": ["lucide-react"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgICBpbmNsdWRlOiBbJ3JlY2hhcnRzJ10sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgLy8gSW5jcmVhc2UgbGltaXQgc2luY2UgU3RyZWFtLmlvIGlzIGxlZ2l0aW1hdGVseSBsYXJnZSAodXNlZCBmb3IgdmlkZW8vY2hhdClcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDIwMDAsXG4gICAgLy8gVXNlIGVzYnVpbGQgZm9yIGZhc3RlciBtaW5pZmljYXRpb24gKGRlZmF1bHQpXG4gICAgbWluaWZ5OiAnZXNidWlsZCcsXG4gICAgLy8gVGFyZ2V0IG1vZGVybiBicm93c2VycyBmb3IgYmV0dGVyIGNvbXByZXNzaW9uXG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgLy8gQ29yZSBSZWFjdCBsaWJyYXJpZXNcbiAgICAgICAgICAndmVuZG9yLXJlYWN0JzogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuXG4gICAgICAgICAgLy8gU3VwYWJhc2VcbiAgICAgICAgICAndmVuZG9yLXN1cGFiYXNlJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcblxuICAgICAgICAgIC8vIFN0cmVhbS5pbyBjaGF0IChzZXBhcmF0ZSBmcm9tIHZpZGVvKVxuICAgICAgICAgICd2ZW5kb3Itc3RyZWFtLWNoYXQnOiBbJ3N0cmVhbS1jaGF0JywgJ3N0cmVhbS1jaGF0LXJlYWN0J10sXG5cbiAgICAgICAgICAvLyBTdHJlYW0uaW8gdmlkZW8gKHNlcGFyYXRlIGNodW5rLCBsYXp5IGxvYWRlZClcbiAgICAgICAgICAndmVuZG9yLXN0cmVhbS12aWRlbyc6IFsnQHN0cmVhbS1pby92aWRlby1yZWFjdC1zZGsnXSxcblxuICAgICAgICAgIC8vIFVJIEljb25zXG4gICAgICAgICAgJ3ZlbmRvci11aSc6IFsnbHVjaWRlLXJlYWN0J10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUl6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLGNBQWM7QUFBQSxJQUN4QixTQUFTLENBQUMsVUFBVTtBQUFBLEVBQ3RCO0FBQUEsRUFDQSxPQUFPO0FBQUE7QUFBQSxJQUVMLHVCQUF1QjtBQUFBO0FBQUEsSUFFdkIsUUFBUTtBQUFBO0FBQUEsSUFFUixRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUE7QUFBQSxVQUVaLGdCQUFnQixDQUFDLFNBQVMsYUFBYSxrQkFBa0I7QUFBQTtBQUFBLFVBR3pELG1CQUFtQixDQUFDLHVCQUF1QjtBQUFBO0FBQUEsVUFHM0Msc0JBQXNCLENBQUMsZUFBZSxtQkFBbUI7QUFBQTtBQUFBLFVBR3pELHVCQUF1QixDQUFDLDRCQUE0QjtBQUFBO0FBQUEsVUFHcEQsYUFBYSxDQUFDLGNBQWM7QUFBQSxRQUM5QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
