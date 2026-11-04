import { defineConfig } from 'vite';
import { attachCoop } from './server/socket.js';

export default defineConfig({
  plugins: [{
    name: 'coop-server',
    configureServer(server) { attachCoop(server.httpServer); },
    configurePreviewServer(server) { attachCoop(server.httpServer); },
  }],
});
