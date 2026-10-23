import { validateConfig } from './server/config.js';
import { securityHeaders, persistentLimit, requestLogging } from './server/security.js';
import { startBackups } from './server/backups.js';
import express from 'express';
import path from 'node:path';
import { db } from './server/db.js';
import { cleanupSessions, loadUser, sameOrigin } from './server/auth.js';
import { PROVINCES, provinceName } from './server/provinces.js';
import { startMailWorker } from './server/mail.js';
import { photoEvents } from './server/events.js';
import { errorHandler } from './server/util.js';
import communityRoutes from './server/routes/community.js';
import authRoutes from './server/routes/auth.js';
import photoRoutes, { UPLOAD_DIR } from './server/routes/photos.js';
import collectionRoutes from './server/routes/collections.js';
import adminRoutes from './server/routes/admin.js';
import { users, me } from './server/routes/users.js';

validateConfig();
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(import.meta.dirname, 'public');
const page = (name) => name === 'admin' ? path.join(import.meta.dirname, 'server', 'views', 'admin.html') : path.join(PUBLIC, `${name}.html`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : 'loopback');

app.use(securityHeaders);
app.use(requestLogging);
app.use(express.json({ limit: '100kb' }));
app.use(loadUser);
app.get('/api/health',(_req,res)=>{db.prepare('SELECT 1').get();res.set('Cache-Control','no-store').json({status:'ok'});});

/* ---------- API ---------- */
const api = express.Router();
api.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
api.use(sameOrigin);
api.use(persistentLimit({scope:'api',windowMs:60000,max:300}));
api.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const update = () => res.write('event: photos\ndata: {}\n\n');
  const engagement = data => res.write(`event: engagement\ndata: ${JSON.stringify(data)}\n\n`);
  photoEvents.on('change', update);
  photoEvents.on('engagement', engagement);
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); photoEvents.off('change', update); photoEvents.off('engagement', engagement); });
});
api.get('/provinces', (_req, res) => res.json({ provinces: PROVINCES }));
api.use('/community', communityRoutes);
api.use('/auth', authRoutes);
api.use('/photos', photoRoutes);
api.use('/users', users);
api.use('/me', me);
api.use('/collections', collectionRoutes);
api.use('/admin', adminRoutes);
api.use((_req, res) => res.status(404).json({ error: 'Não encontrado.' }));
api.use(errorHandler);
app.use('/api', api);

/* ---------- Ficheiros enviados: pendentes só para o autor e admins ---------- */
app.get('/media/:file', (req, res) => {
  const url = `/media/${path.basename(req.params.file)}`;
  const photo = db.prepare('SELECT user_id, status FROM photos WHERE src = ? OR thumb = ? LIMIT 1').get(url, url);
  const allowed = photo && (photo.status === 'approved' || req.user?.role === 'admin' || req.user?.id === photo.user_id);
  if (!allowed) return res.status(404).end();
  res.set('Cache-Control','private, no-store');
  res.sendFile(path.join(UPLOAD_DIR, path.basename(req.params.file)));
});

/* ---------- Páginas ---------- */
app.get(['/historia/:id', '/exposicao/:id'], (_req, res) => res.sendFile(page('comunidade')));

// Perfil do fotógrafo: /@username
app.get(/^\/@([a-z0-9_.]{3,30})\/?$/i, (_req, res) => res.sendFile(page('perfil')));

// Dashboard protegido antes de qualquer entrega de ficheiros estáticos
app.get(['/admin', '/admin.html', '/bastidores', '/bastidores.html'], (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.user) return res.redirect(`/entrar?next=${encodeURIComponent(req.originalUrl)}&notice=admin-login`);
  if (req.user.role !== 'admin') return res.redirect('/?error=access-denied');
  res.sendFile(page('admin'));
});

// Link partilhável de uma foto, com pré-visualização para o WhatsApp (Open Graph)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
app.get('/foto/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare(`SELECT p.*, u.display_name FROM photos p JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.status = 'approved'`).get(id);
  if (!p) return res.redirect('/descobrir');
  const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const img = p.src.startsWith('http') ? p.src : origin + p.src;
  const title = `${p.title} — ${p.credit_name || p.display_name}`;
  const desc = `${p.city}, ${provinceName(p.province)} · LUME, O Brilho de Moçambique`;
  const target = `/descobrir?foto=${id}`;
  res.type('html').send(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="LUME">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(origin + req.originalUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${target}">
<style>body{background:#0d0d0c}</style></head>
<body><a href="${target}">Abrir fotografia</a></body></html>`);
});

app.use(express.static(PUBLIC, { extensions: ['html'] }));
app.use((_req, res) => res.status(404).sendFile(page('404')));

const sockets=new Set();
const server=app.listen(PORT, () => {
  cleanupSessions();
  setInterval(cleanupSessions,3600000).unref();
  startMailWorker();
  startBackups();
  console.log(`LUME a correr em http://localhost:${PORT}`);
});

server.requestTimeout=120000;
server.headersTimeout=20000;
server.keepAliveTimeout=5000;
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  console.log('[server] A encerrar ligações.');
  server.close(()=>{db.close();process.exit(0);});
  setTimeout(()=>{for(const socket of sockets)socket.destroy();},1000).unref();
  setTimeout(()=>process.exit(1),10000).unref();
});
