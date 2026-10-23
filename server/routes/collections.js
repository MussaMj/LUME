import { engagementChanged } from '../events.js';
import { Router } from 'express';
import { db, PHOTO_SELECT } from '../db.js';
import { requireUser } from '../auth.js';
import { HttpError, shapePhoto, text } from '../util.js';

// Álbuns de favoritos: sempre privados, só o dono os vê
const router = Router();
router.use(requireUser);

function ownCollection(req) {
  const c = db.prepare('SELECT * FROM collections WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!c) throw new HttpError(404, 'Álbum não encontrado.');
  return c;
}

router.get('/', (req, res) => {
  const photoId = Number(req.query.photo) || 0;
  const rows = db.prepare(`
    SELECT c.id, c.name, c.created_at, c.is_public,
      (SELECT COUNT(*) FROM collection_items ci JOIN photos p ON p.id = ci.photo_id
         WHERE ci.collection_id = c.id AND p.status = 'approved') AS count,
      (SELECT p.thumb FROM collection_items ci JOIN photos p ON p.id = ci.photo_id
         WHERE ci.collection_id = c.id AND p.status = 'approved' ORDER BY ci.added_at DESC LIMIT 1) AS cover,
      EXISTS (SELECT 1 FROM collection_items WHERE collection_id = c.id AND photo_id = ?) AS has_photo
    FROM collections c WHERE c.user_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(photoId, req.user.id);
  res.json({
    collections: rows.map((c) => ({
      id: c.id, name: c.name, count: c.count, cover: c.cover, createdAt: c.created_at, isPublic: !!c.is_public, hasPhoto: !!c.has_photo,
    })),
  });
});

router.post('/', (req, res) => {
  const name = text(req.body.name, { max: 60, required: true, label: 'Nome do álbum' });
  const { lastInsertRowid } = db.prepare('INSERT INTO collections (user_id, name) VALUES (?, ?)').run(req.user.id, name);
  res.status(201).json({ collection: { id: lastInsertRowid, name, count: 0, cover: null, hasPhoto: false } });
});

router.get('/:id', (req, res) => {
  const c = ownCollection(req);
  const photos = db.prepare(`${PHOTO_SELECT}
      JOIN collection_items ci ON ci.photo_id = p.id
      WHERE ci.collection_id = ? AND p.status = 'approved'
      ORDER BY ci.added_at DESC`).all(c.id).map((r) => shapePhoto(r, req.user));
  res.json({ collection: { id: c.id, name: c.name, createdAt: c.created_at, isPublic: !!c.is_public }, photos });
});

router.patch('/:id', (req, res) => {
  const c = ownCollection(req);
  const name = text(req.body.name ?? c.name, { max: 60, required: true, label: 'Nome do álbum' });
  if (req.body.isPublic !== undefined && typeof req.body.isPublic !== 'boolean') throw new HttpError(400, 'Visibilidade inválida.');
  const isPublic = req.body.isPublic === undefined ? c.is_public : Number(req.body.isPublic);
  db.prepare('UPDATE collections SET name = ?, is_public = ? WHERE id = ?').run(name, isPublic, c.id);
  res.json({ collection: { id: c.id, name, isPublic: !!isPublic } });
});

router.delete('/:id', (req, res) => {
  const c = ownCollection(req);
  const affected = db.prepare('SELECT photo_id FROM collection_items WHERE collection_id=?').all(c.id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(c.id);
  affected.forEach(row=>engagementChanged(row.photo_id));
  res.json({ ok: true });
});

router.post('/:id/photos', (req, res) => {
  const c = ownCollection(req);
  const photo = db.prepare("SELECT id FROM photos WHERE id = ? AND status = 'approved'").get(Number(req.body.photoId));
  if (!photo) throw new HttpError(404, 'Fotografia não encontrada.');
  db.prepare('INSERT OR IGNORE INTO collection_items (collection_id, photo_id) VALUES (?, ?)').run(c.id, photo.id);
  engagementChanged(photo.id);
  res.json({ ok: true });
});

router.delete('/:id/photos/:photoId', (req, res) => {
  const c = ownCollection(req);
  db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND photo_id = ?').run(c.id, Number(req.params.photoId));
  engagementChanged(Number(req.params.photoId));
  res.json({ ok: true });
});

export default router;
