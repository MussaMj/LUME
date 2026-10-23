// Add supplied photographs without replacing existing photos or resetting the database.
import crypto from 'node:crypto';
import { db, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { ADAIMA_AUTHOR, ADAIMA_PHOTOS } from '../public/data/adaima-photos.js';
const username = 'adaima.mussa.mustafa';
const result = tx(() => {
  let author = db.prepare('SELECT id, display_name, email FROM users WHERE username = ?').get(username);
  if (author && (author.display_name !== ADAIMA_AUTHOR || author.email !== 'photos-adaima-mussa-mustafa@lume.invalid')) throw new Error('O username já pertence a outra conta; importação cancelada.');
  if (!author) {
    const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, display_name, email, password_hash, bio) VALUES (?, ?, ?, ?, ?)`).run(username, ADAIMA_AUTHOR,
      'photos-adaima-mussa-mustafa@lume.invalid', hashPassword(crypto.randomBytes(48).toString('hex')), 'Fotografias de Adaíma Mussa Mustafa, partilhadas na Lume.');
    author = { id: lastInsertRowid };
  }
  let added = 0;
  for (const photo of ADAIMA_PHOTOS) {
    if (db.prepare('SELECT id FROM photos WHERE src = ?').get(photo.src)) continue;
    db.prepare(`INSERT INTO photos (user_id, title, category, description, province, city, src, thumb, width, height, status, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now'))`).run(author.id, photo.title, photo.category,
      `Fotografia de ${ADAIMA_AUTHOR}.`, photo.province, photo.city, photo.src, photo.thumb, photo.width, photo.height);
    added++;
  }
  return { added };
});
console.log(`Adaíma Mussa Mustafa: ${result.added} fotografias adicionadas. Perfil: /@${username}`);
db.close();
