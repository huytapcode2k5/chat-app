import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // REST API
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // SignalR WebSocket hub
      '/hubs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,   // ← enable WebSocket proxy
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});