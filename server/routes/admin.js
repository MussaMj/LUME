import { Router } from 'express';
import { db, PHOTO_SELECT, tx } from '../db.js';
import { queueApprovalEmail, flushMailQueue } from '../mail.js';
import { photosChanged } from '../events.js';
import { requireAdmin } from '../auth.js';
import { HttpError, shapePhoto, text } from '../util.js';
import { deletePhotoFiles } from './photos.js';

// Moderação: só o administrador autorizado (403 aos restantes)
const router = Router();
router.use(requireAdmin);

router.get('/stats', (_req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    pending: count("SELECT COUNT(*) AS n FROM photos WHERE status = 'pending'"),
    approved: count("SELECT COUNT(*) AS n FROM photos WHERE status = 'approved'"),
    rejected: count("SELECT COUNT(*) AS n FROM photos WHERE status = 'rejected'"),
    users: count('SELECT COUNT(*) AS n FROM users'),
  });
});

// Fila de moderação: mais antigas primeiro
router.get('/queue', (req, res) => {
  const rows = db.prepare(`${PHOTO_SELECT} WHERE p.status = 'pending' ORDER BY p.created_at ASC, p.id ASC`).all();
  res.json({ photos: rows.map((r) => shapePhoto(r, req.user)) });
});

router.get('/photos', (req, res) => {
  const status = ['approved', 'rejected'].includes(req.query.status) ? req.query.status : 'approved';
  const q = `%${text(req.query.q, { max: 80 })}%`;
  const rows = db.prepare(`${PHOTO_SELECT}
      WHERE p.status = ? AND (p.title LIKE ? OR p.city LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)
      ORDER BY p.reviewed_at DESC, p.id DESC LIMIT 120`).all(status, q, q, q, q);
  res.json({ photos: rows.map((r) => shapePhoto(r, req.user)) });
});

function review(req, status, reason = '') {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Fotografia inválida.');
  const previous = db.prepare('SELECT status FROM photos WHERE id = ?').get(id);
  const { changes } = db.prepare(`UPDATE photos SET status = ?, reject_reason = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?`).run(status, reason, req.user.id, id);
  if (!changes) throw new HttpError(404, 'Fotografia não encontrada.');
  const photo = db.prepare(`${PHOTO_SELECT} WHERE p.id = ?`).get(id);
  if (status === 'approved' && previous.status !== 'approved') queueApprovalEmail(photo);
  return shapePhoto(photo, req.user);
}

router.post('/photos/:id/approve', (req, res) => {
  const photo = tx(() => review(req, 'approved'));
  void flushMailQueue();
  photosChanged();
  res.json({ photo });
});

router.post('/photos/:id/reject', (req, res) => {
  const reason = text(req.body.reason, { max: 300, label: 'Motivo' });
  const photo = review(req, 'rejected', reason);
  photosChanged();
  res.json({ photo });
});

router.post('/review-batch', (req, res) => {
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)
      || !['approve', 'reject'].includes(action)) throw new HttpError(400, 'Selecção inválida (máximo 100 fotografias).');
  const reason = text(req.body.reason, { max: 300, label: 'Motivo' });
  const unique = [...new Set(ids)];
  tx(() => {
    for (const id of unique) {
      const pending = db.prepare("SELECT id FROM photos WHERE id = ? AND status = 'pending'").get(id);
      if (!pending) throw new HttpError(409, 'A fila foi alterada. Actualiza a selecção.');
      review({ params: { id }, user: req.user }, action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? reason : '');
    }
  });
  void flushMailQueue();
  photosChanged();
  res.json({ ok: true, count: unique.length });
});

router.delete('/photos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(req.params.id));
  if (!row) throw new HttpError(404, 'Fotografia não encontrada.');
  db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
  deletePhotoFiles(row);
  photosChanged();
  res.json({ ok: true });
});

/* ---------- Foto da Semana ---------- */
router.get('/featured', (req, res) => {
  const rows = db.prepare(`SELECT f.id AS featured_id, f.note, f.featured_at, p.id AS photo_id
      FROM featured f JOIN photos p ON p.id = f.photo_id ORDER BY f.featured_at DESC, f.id DESC LIMIT 12`).all();
  res.json({
    history: rows.map((f) => ({
      id: f.featured_id,
      note: f.note,
      featuredAt: f.featured_at,
      photo: shapePhoto(db.prepare(`${PHOTO_SELECT} WHERE p.id = ?`).get(f.photo_id), req.user),
    })),
  });
});

router.post('/featured', (req, res) => {
  const photo = db.prepare("SELECT id FROM photos WHERE id = ? AND status = 'approved'").get(Number(req.body.photoId));
  if (!photo) throw new HttpError(400, 'Só fotografias aprovadas podem ser Foto da Semana.');
  const note = text(req.body.note, { max: 280, label: 'Nota' });
  db.prepare('INSERT INTO featured (photo_id, note, featured_by) VALUES (?, ?, ?)').run(photo.id, note, req.user.id);
  photosChanged();
  res.status(201).json({ ok: true });
});

export default router;
