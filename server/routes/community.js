import { Router } from 'express';
import { db, PHOTO_SELECT, tx } from '../db.js';
import { requireUser, requireAdmin } from '../auth.js';
import { HttpError, shapePhoto, text } from '../util.js';

const router = Router();

const getItem = (id) => db.prepare('SELECT * FROM community_items WHERE id = ?').get(Number(id));
const photoList = (sql, args, viewer) => db.prepare(sql).all(...args).map((p) => shapePhoto(p, viewer));
function shape(item, viewer) {
  const payload = JSON.parse(item.payload);
  const author = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(item.user_id);
  const result = { id: item.id, kind: item.kind, title: item.title, intro: item.intro, status: item.status,
    payload, author: { username: author.username, displayName: author.display_name }, isOwner: item.user_id === viewer?.id };
  if (item.kind === 'story') {
    result.photos = (payload.frames || []).map((frame) => {
      const row = db.prepare(`${PHOTO_SELECT} WHERE p.id = ? AND p.status = 'approved'`).get(frame.photoId);
      return row ? { ...shapePhoto(row, viewer), caption: frame.caption } : null;
    }).filter(Boolean);
  }
  if (item.kind === 'spotlight') {
    const user = db.prepare('SELECT username, display_name, bio FROM users WHERE username = ?').get(payload.username);
    result.photographer = user && { username: user.username, displayName: user.display_name, bio: user.bio };
    result.photos = user ? photoList(`${PHOTO_SELECT} WHERE u.username = ? AND p.status = 'approved' ORDER BY p.id DESC LIMIT 6`, [user.username], viewer) : [];
  }
  if (item.kind === 'event') {
    result.attendees = db.prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE item_id = ?').get(item.id).n;
    result.joined = !!viewer && !!db.prepare('SELECT 1 FROM event_rsvps WHERE item_id = ? AND user_id = ?').get(item.id, viewer.id);
  }
  return result;
}

router.get('/items', (req, res) => {
  const rows = req.query.manage === '1' && req.user?.role === 'admin'
    ? db.prepare("SELECT * FROM community_items WHERE kind != 'challenge' ORDER BY id DESC").all()
    : db.prepare("SELECT * FROM community_items WHERE kind != 'challenge' AND (status = 'published' OR user_id = ?) ORDER BY id DESC").all(req.user?.id || -1);
  res.json({ items: rows.map((item) => shape(item, req.user)) });
});
router.get('/items/:id', (req, res) => {
  const item = getItem(req.params.id);
  if (!item || item.kind === 'challenge' || (item.status !== 'published' && item.user_id !== req.user?.id && req.user?.role !== 'admin')) throw new HttpError(404, 'Conteúdo não encontrado.');
  res.json({ item: shape(item, req.user) });
});

function validate(body, user) {
  const kind = body.kind;
  if (!['story', 'event', 'spotlight'].includes(kind)) throw new HttpError(400, 'Tipo inválido.');
  if (kind !== 'story' && user.role !== 'admin') throw new HttpError(403, 'Só a curadoria pode publicar este conteúdo.');
  const title = text(body.title, { max: 120, required: true, label: 'Título' });
  const intro = text(body.intro, { max: 1600, label: 'Introdução' });
  const data = body.payload || {};
  let payload;
  if (kind === 'story') {
    if (!Array.isArray(data.frames) || data.frames.length < 5 || data.frames.length > 10) throw new HttpError(400, 'Escolhe entre 5 e 10 fotografias.');
    const seen = new Set();
    payload = { frames: data.frames.map((frame) => {
      if (!frame || !Number.isSafeInteger(Number(frame.photoId))) throw new HttpError(400, 'Fotografia inválida.');
      const photo = db.prepare("SELECT user_id FROM photos WHERE id = ? AND status = 'approved'").get(Number(frame.photoId));
      if (!photo || (photo.user_id !== user.id && user.role !== 'admin') || seen.has(Number(frame.photoId))) throw new HttpError(400, 'Usa fotografias próprias, aprovadas e sem repetições.');
      seen.add(Number(frame.photoId));
      return { photoId: Number(frame.photoId), caption: text(frame.caption, { max: 400, label: 'Legenda' }) };
    }) };
  } else if (kind === 'event') {
    const date = new Date(data.date);
    const capacity = Number(data.capacity);
    if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 500) throw new HttpError(400, 'Data ou limite de participantes inválido.');
    payload = { date: date.toISOString(), capacity, location: text(data.location, { max: 200, required: true, label: 'Ponto de encontro' }) };
  } else {
    const username = text(data.username, { max: 30, required: true });
    if (!db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new HttpError(400, 'Fotógrafo não encontrado.');
    payload = { username };
  }
  return { kind, title, intro, payload };
}
router.post('/items', requireUser, (req, res) => {
  const item = validate(req.body, req.user);
  const status = req.user.role === 'admin' ? 'published' : 'pending';
  const { lastInsertRowid } = db.prepare('INSERT INTO community_items (kind,user_id,title,intro,payload,status) VALUES (?,?,?,?,?,?)')
    .run(item.kind, req.user.id, item.title, item.intro, JSON.stringify(item.payload), status);
  res.status(201).json({ item: shape(getItem(lastInsertRowid), req.user) });
});
router.patch('/items/:id', requireAdmin, (req, res) => {
  const old = getItem(req.params.id);
  if (!old || old.kind === 'challenge') throw new HttpError(404, 'Conteúdo não encontrado.');
  const status = req.body.status ?? old.status;
  if (!['pending','published','archived'].includes(status)) throw new HttpError(400, 'Estado inválido.');
  if (req.body.kind && req.body.kind !== old.kind) throw new HttpError(400, 'O tipo de conteúdo não pode ser alterado.');
  const value = status === 'archived' && Object.keys(req.body).length === 1
    ? { title: old.title, intro: old.intro, payload: JSON.parse(old.payload) }
    : validate({ ...old, payload: JSON.parse(old.payload), ...req.body }, req.user);
  db.prepare('UPDATE community_items SET title = ?, intro = ?, payload = ?, status = ? WHERE id = ?')
    .run(value.title, value.intro, JSON.stringify(value.payload), status, old.id);
  res.json({ item: shape(getItem(old.id), req.user) });
});
router.post('/items/:id/participate', requireUser, (req, res) => {
  const item = getItem(req.params.id);
  if (!item || item.kind === 'challenge' || item.status !== 'published') throw new HttpError(404, 'Conteúdo não encontrado.');
  const payload = JSON.parse(item.payload);
  if (item.kind === 'event') {
    tx(() => {
      if (new Date(payload.date) <= new Date()) throw new HttpError(409, 'Este encontro já terminou.');
      if (!db.prepare('SELECT 1 FROM event_rsvps WHERE item_id = ? AND user_id = ?').get(item.id, req.user.id)) {
        if (db.prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE item_id = ?').get(item.id).n >= payload.capacity) throw new HttpError(409, 'As vagas estão preenchidas.');
        db.prepare('INSERT INTO event_rsvps VALUES (?,?)').run(item.id, req.user.id);
      }
    });
  } else throw new HttpError(400, 'Conteúdo sem inscrições.');
  res.json({ item: shape(getItem(item.id), req.user) });
});
router.delete('/items/:id/participate', requireUser, (req, res) => {
  const item = getItem(req.params.id);
  if (!item || item.kind === 'challenge') throw new HttpError(404, 'Conteúdo não encontrado.');
  if (item.kind === 'event') db.prepare('DELETE FROM event_rsvps WHERE item_id = ? AND user_id = ?').run(item.id, req.user.id);
  else throw new HttpError(400, 'Conteúdo sem inscrições.');
  res.json({ ok: true });
});

router.get('/exhibitions', (req, res) => {
  const rows = db.prepare(`SELECT c.id,c.name,u.username,u.display_name,
    (SELECT p.thumb FROM collection_items ci JOIN photos p ON p.id = ci.photo_id WHERE ci.collection_id = c.id AND p.status = 'approved' ORDER BY ci.added_at DESC LIMIT 1) AS cover
    FROM collections c JOIN users u ON u.id = c.user_id WHERE c.is_public = 1 ORDER BY c.id DESC`).all();
  res.json({ exhibitions: rows });
});
router.get('/exhibitions/:id', (req, res) => {
  const collection = db.prepare('SELECT c.id,c.name,u.username,u.display_name FROM collections c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.is_public = 1').get(Number(req.params.id));
  if (!collection) throw new HttpError(404, 'Exposição não encontrada.');
  res.json({ collection, photos: photoList(`${PHOTO_SELECT} JOIN collection_items ci ON ci.photo_id = p.id WHERE ci.collection_id = ? AND p.status = 'approved' ORDER BY ci.added_at`, [collection.id], req.user) });
});

router.get('/notifications', requireUser, (req, res) => {
  const notifications = db.prepare(`SELECT n.id,n.read_at,p.id AS photo_id,p.title,u.display_name,u.username
    FROM follower_notifications n JOIN photos p ON p.id = n.photo_id JOIN users u ON u.id = p.user_id
    WHERE n.user_id = ? AND p.status = 'approved' ORDER BY n.id DESC LIMIT 100`).all(req.user.id);
  res.json({ notifications });
});
router.post('/notifications/read', requireUser, (req, res) => {
  db.prepare("UPDATE follower_notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  res.json({ ok: true });
});

export default router;
