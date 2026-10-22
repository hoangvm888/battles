import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { createPool } from './db.js';
const pool = createPool();
const app = createApp({ pool });
const clientDirectory = path.resolve(process.cwd(), 'client/dist');
if (existsSync(clientDirectory)) {
  app.use(
    express.static(clientDirectory, {
      maxAge: '1h',
      index: false,
      setHeaders(res, file) {
        if (['index.html', 'service-worker.js', 'manifest.json'].includes(path.basename(file))) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (
          file.includes(path.sep + 'assets' + path.sep) &&
          !file.includes(path.sep + 'images' + path.sep)
        ) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('/{*splat}', (req, res) => {
    if (
      req.path.startsWith('/assets/') ||
      (path.extname(req.path) && !req.path.endsWith('.html'))
    ) {
      res.status(404).type('text').send('Asset not found.');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDirectory, 'index.html'));
  });
}
const port = Number(process.env.PORT) || 3001;
const server = app.listen(
  port,
  process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  () => console.log(`Battle API listening on port ${port}`),
);
async function stop() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
