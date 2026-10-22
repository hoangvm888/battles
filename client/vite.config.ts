import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { quizioTemplate } from './templatePlugin';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const tailwindVersion: string = require('tailwindcss/package.json').version;
if (!tailwindVersion.startsWith('3.')) {
  throw new Error(
    `Quizio requires Tailwind CSS 3; found ${tailwindVersion}. Stop the dev server, run ` +
      'npm install -D --save-exact tailwindcss@3.4.17 in the repository root, then run npm run dev again.',
  );
}

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
