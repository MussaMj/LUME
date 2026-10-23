import { Router } from 'express';
import { db, PHOTO_SELECT } from '../db.js';
import { requireUser } from '../auth.js';
import { HttpError, publicUser, shapePhotos } from '../util.js';

export const users = Router();
export const me = Router();

// Perfil público: dados + fotografias aprovadas
users.get('/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) throw new HttpError(404, 'Fotógrafo não encontrado.');
  const photos = shapePhotos(db.prepare(`${PHOTO_SELECT} WHERE p.user_id = ? AND p.status = 'approved' ORDER BY p.created_at DESC, p.id DESC`)
    .all(user.id), req.user);
  const { email, role, ...profile } = publicUser(user);
  const featuredCount = db.prepare(`SELECT COUNT(DISTINCT f.photo_id) AS n FROM featured f
      JOIN photos p ON p.id = f.photo_id WHERE p.user_id = ?`).get(user.id).n;
  res.json({
    user: { ...profile, joinedAt: user.created_at, featuredCount },
    photos,
    isOwner: req.user?.id === user.id,
    followers: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followed_id = ?').get(user.id).n,
    following: !!req.user && !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(req.user.id, user.id),
    notifyEmail: !!req.user && !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ? AND notify_email = 1').get(req.user.id, user.id),
  });
});

// Os meus envios (todos os estados)
me.get('/photos', requireUser, (req, res) => {
  const rows = db.prepare(`${PHOTO_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(req.user.id);
  res.json({ photos: shapePhotos(rows, req.user) });
});

// Fotografias que me inspiraram
me.get('/inspired', requireUser, (req, res) => {
  const rows = db.prepare(`${PHOTO_SELECT}
      JOIN inspired i ON i.photo_id = p.id
      WHERE i.user_id = ? AND p.status = 'approved'
      ORDER BY i.created_at DESC`).all(req.user.id);
  res.json({ photos: shapePhotos(rows, req.user) });
});

users.post('/:username/follow', requireUser, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) throw new HttpError(404, 'Fotógrafo não encontrado.');
  if (user.id === req.user.id) throw new HttpError(400, 'Não podes seguir o teu próprio perfil.');
  if (req.body.notifyEmail !== undefined && typeof req.body.notifyEmail !== 'boolean') throw new HttpError(400, 'Preferência inválida.');
  db.prepare(`INSERT INTO follows (follower_id,followed_id,notify_email) VALUES (?,?,?)
    ON CONFLICT(follower_id,followed_id) DO UPDATE SET notify_email = excluded.notify_email`).run(req.user.id,user.id,Number(req.body.notifyEmail === true));
  if (req.body.notifyEmail !== true) db.prepare('UPDATE follower_notifications SET email_requested = 0 WHERE user_id = ? AND emailed_at IS NULL AND photo_id IN (SELECT id FROM photos WHERE user_id = ?)').run(req.user.id,user.id);
  res.json({ ok: true });
});
users.delete('/:username/follow', requireUser, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (user) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(req.user.id,user.id);
    db.prepare('UPDATE follower_notifications SET email_requested = 0 WHERE user_id = ? AND emailed_at IS NULL AND photo_id IN (SELECT id FROM photos WHERE user_id = ?)').run(req.user.id,user.id);
  }
  res.json({ ok: true });
});
