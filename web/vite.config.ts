import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,                      // reachable from Tailscale / LAN devices
    allowedHosts: ['.ts.net'],       // Tailscale MagicDNS domain
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      // OAuth authorization server endpoints (so the full flow also works on 5173 in dev)
      '/authorize': 'http://localhost:3000',
      '/token': 'http://localhost:3000',
      '/register': 'http://localhost:3000',
      '/revoke': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
