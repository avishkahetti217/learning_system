import express from 'express';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { api } from './routes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.LEARNLOG_PASSWORD;

const app = express();
app.disable('x-powered-by');

// Optional HTTP Basic auth — set LEARNLOG_PASSWORD when the app is reachable by others.
if (PASSWORD) {
  const digest = s => createHash('sha256').update(s).digest();
  const expected = digest(PASSWORD);
  app.use((req, res, next) => {
    const encoded = (req.headers.authorization || '').replace(/^Basic\s+/i, '');
    const given = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
    if (timingSafeEqual(digest(given), expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="LearnLog"').status(401).send('Authentication required');
  });
}

app.use('/api', express.json({ limit: '10mb' }), (req, res, next) => { req.body ??= {}; next(); }, api);

if (isProd) {
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h', index: 'index.html' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`LearnLog running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (${isProd ? 'production' : 'development'})`);
});
