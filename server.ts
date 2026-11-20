/**
 * Express + Vite Full-Stack Server
 *
 * Exposes the Jujutsu REST API used by the web build and mounts Vite middleware
 * in development or the production bundle from `dist/`.
 */

// Must run before importing modules that read `process.env` at load time.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import * as jjService from './electron/jj-service';

// The bundled server (dist/server.cjs) is always production: it lives next
// to the built index.html, so paths resolve from __dirname, not from the
// directory the user happened to launch it from.
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.npm_lifecycle_event === 'start' ||
  __dirname.endsWith(`${path.sep}dist`);

function repoParam(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (value.includes('\0')) throw new Error('Ruta de repositorio inválida');
  return path.resolve(value);
}

function fail(res: express.Response, error: any) {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  // Local only by design: this API can run jj mutations on any repo path,
  // so it must never be exposed outside localhost (no auth, no token).
  const HOST = process.env.HOST || '127.0.0.1';

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // --- Repository inspection -------------------------------------------------
  app.get('/api/jj/info', async (req, res) => {
    try {
      res.json(await jjService.getRepoInfo(repoParam(req.query.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/jj/log', async (req, res) => {
    try {
      const revset = typeof req.query.revset === 'string' ? req.query.revset : 'all()';
      res.json(await jjService.getLog(repoParam(req.query.repo), revset));
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/jj/status', async (req, res) => {
    try {
      res.json(await jjService.getStatus(repoParam(req.query.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/jj/diff', async (req, res) => {
    try {
      const revision = typeof req.query.revision === 'string' ? req.query.revision : '@';
      const target = typeof req.query.target === 'string' ? req.query.target : undefined;
      res.json(await jjService.getDiff(revision, target, repoParam(req.query.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/jj/logs', (_req, res) => {
    res.json(jjService.getExecutionLogs());
  });

  app.get('/api/jj/operations', async (req, res) => {
    try {
      res.json(await jjService.getOperations(repoParam(req.query.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  // --- Mutations -------------------------------------------------------------
  app.post('/api/jj/describe', async (req, res) => {
    try {
      const { revision, message } = req.body ?? {};
      if (!message || !String(message).trim()) throw new Error('El mensaje de la descripción es obligatorio');
      res.json(await jjService.describe(String(revision ?? '@'), String(message ?? ''), repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/new', async (req, res) => {
    try {
      const { parentRevision, message } = req.body ?? {};
      res.json(await jjService.newCommit(parentRevision, message, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/commit', async (req, res) => {
    try {
      if (!req.body?.message) throw new Error('El mensaje del commit es obligatorio');
      res.json(await jjService.commit(String(req.body.message), repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/undo', async (req, res) => {
    try {
      res.json(await jjService.undo(repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/split', async (req, res) => {
    try {
      const { revision, filesToSplitOff, message } = req.body ?? {};
      res.json(
        await jjService.split(revision ?? '@', filesToSplitOff, repoParam(req.body?.repo), message),
      );
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/rebase', async (req, res) => {
    try {
      const { sourceRev, destinationRev } = req.body ?? {};
      if (!sourceRev || !destinationRev) throw new Error('Origen y destino del rebase son obligatorios');
      res.json(await jjService.rebase(String(sourceRev), String(destinationRev), repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/abandon', async (req, res) => {
    try {
      if (!req.body?.revision) throw new Error('La revisión es obligatoria');
      res.json(await jjService.abandon(String(req.body.revision), repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/resolve', async (req, res) => {
    try {
      const { file, side } = req.body ?? {};
      if (!file) throw new Error('Falta el archivo en conflicto a resolver');
      if (side !== 'ours' && side !== 'theirs') throw new Error('El lado debe ser "ours" o "theirs"');
      res.json(await jjService.resolveConflict(String(file), side, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/edit', async (req, res) => {
    try {
      res.json(await jjService.editCommit(String(req.body?.revision ?? '@'), repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/merge', async (req, res) => {
    try {
      const { rev1, rev2, message } = req.body ?? {};
      if (!rev1 || !rev2) throw new Error('Se requieren dos revisiones para el merge');
      res.json(await jjService.merge(String(rev1), String(rev2), message, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/bookmark', async (req, res) => {
    try {
      const { name, revision } = req.body ?? {};
      if (!name) throw new Error('El nombre del bookmark es obligatorio');
      res.json(await jjService.createBookmark(String(name), revision, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/push', async (req, res) => {
    try {
      const { remote, bookmark } = req.body ?? {};
      res.json(await jjService.push(remote, bookmark, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/fetch', async (req, res) => {
    try {
      res.json(await jjService.fetch(req.body?.remote, repoParam(req.body?.repo)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/clone', async (req, res) => {
    try {
      const { url, targetPath } = req.body ?? {};
      if (!url || !targetPath) throw new Error('URL y carpeta destino son obligatorias');
      res.json(await jjService.clone(String(url), String(targetPath)));
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/jj/binary', async (req, res) => {
    try {
      const binaryPath = req.body?.binaryPath;
      if (!binaryPath) throw new Error('La ruta del binario es obligatoria');
      const success = await jjService.setBinaryPath(String(binaryPath));
      if (!success) {
        res.status(400).json({ error: `No se pudo ejecutar jj en "${binaryPath}".` });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      fail(res, error);
    }
  });

  // Read-only binary check: does NOT change the configured binary.
  app.post('/api/jj/binary/test', async (req, res) => {
    try {
      const binaryPath = req.body?.binaryPath;
      if (!binaryPath) throw new Error('La ruta del binario es obligatoria');
      const success = await jjService.testBinaryPath(String(binaryPath));
      res.json({ success });
    } catch (error) {
      fail(res, error);
    }
  });

  // --- Frontend --------------------------------------------------------------
  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (error: any) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
  } else {
    // In production the server bundle lives in dist/ next to index.html.
    const distPath = __dirname;
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      throw new Error('No se encontró dist/index.html. Ejecuta `npm run build` antes de `npm start`.');
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server]', error);
    if (res.headersSent) return;
    res.status(500).json({ error: error?.message || 'Error interno del servidor' });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`Jujutsu GUI (${IS_PRODUCTION ? 'production' : 'development'}) on http://${HOST}:${PORT}`);
  });

  server.on('error', (error: any) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(
        `El puerto ${PORT} ya está en uso. Cierra el otro proceso o define PORT con otro valor.`,
      );
    } else {
      console.error('No se pudo iniciar el servidor:', error);
    }
    process.exit(1);
  });
}

startServer().catch(error => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
