import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Serve and emit the original Quizio files from src, without maintaining copied assets.
export function quizioTemplate(root: string): Plugin {
  const images = path.join(root, 'src/assets/images');
  const manifest = path.join(root, 'src/manifest.json');
  const worker = path.join(root, 'src/assets/js/service-worker.js');
  let isBuild = false;
  function files(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const file = path.join(directory, name);
      return statSync(file).isDirectory() ? files(file) : [file];
    });
  }
  const renderWorker = (version: string, precache: string[]) =>
    readFileSync(worker, 'utf8')
      .replace('__QUIZIO_VERSION__', version)
      .replace('__QUIZIO_PRECACHE__', JSON.stringify(precache));

  return {
    name: 'original-quizio-template',
    enforce: 'post',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
        } catch {
          res.statusCode = 400;
          res.end('Invalid path');
          return;
        }
        let file: string | undefined;
        let mime = 'application/octet-stream';
        if (pathname === '/manifest.json') {
          file = manifest;
          mime = 'application/manifest+json';
        } else if (pathname === '/service-worker.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end(renderWorker('development', []));
          return;
        } else if (pathname.startsWith('/assets/images/')) {
          file = path.resolve(images, pathname.slice('/assets/images/'.length));
          if (!file.startsWith(images + path.sep)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          mime =
            (
              {
                '.png': 'image/png',
                '.svg': 'image/svg+xml',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
              } as Record<string, string>
            )[path.extname(file)] || mime;
        }
        if (!file) {
          next();
          return;
        }
        try {
          const body = readFileSync(file);
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('Not found');
        }
      });
    },
    buildStart() {
      if (!isBuild) return;
      for (const file of files(images)) {
        this.addWatchFile(file);
        this.emitFile({
          type: 'asset',
          fileName: 'assets/images/' + path.relative(images, file).split(path.sep).join('/'),
          source: readFileSync(file),
        });
      }
      this.addWatchFile(manifest);
      this.addWatchFile(worker);
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: readFileSync(manifest) });
    },
    generateBundle(_options, bundle) {
      const digest = createHash('sha256').update(readFileSync(worker));
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        digest.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      const precache = [
        '/index.html',
        ...Object.keys(bundle)
          .filter((name) => name !== 'index.html')
          .map((name) => '/' + name),
      ];
      this.emitFile({
        type: 'asset',
        fileName: 'service-worker.js',
        source: renderWorker(digest.digest('hex').slice(0, 16), precache),
      });
    },
  };
}
