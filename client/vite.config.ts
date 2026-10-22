import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { quizioTemplate } from './templatePlugin';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  publicDir: false,
  plugins: [react(), quizioTemplate(root)],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.join(root, 'tailwind.config.cjs') }), autoprefixer()],
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { outDir: path.join(root, 'client/dist'), emptyOutDir: true },
});
