import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: {
    rollupOptions: {
      input: { main: 'index.html', about: 'about.html', developer: 'developer.html', deployment: 'lab-index.html' }
    }
  }
});
