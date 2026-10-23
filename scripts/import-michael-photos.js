// Import the supplied Maputo photographs without resetting any existing data.
import crypto from 'node:crypto';
import { db, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { MICHAEL_AUTHOR, MICHAEL_PHOTOS } from '../public/data/michael-photos.js';

const username = 'michael.james.khosa';
const replacements = [
  'photo-1543960366-ef0016e1006b',
  'photo-1734592212133-a65ba7225c68',
  'photo-1692857477588-d024201cdcfa',
  'photo-1721403901773-ce6d56b709d2',
];

const result = tx(() => {
  let author = db.prepare('SELECT id, display_name, email FROM users WHERE username = ?').get(username);
  if (author && author.display_name !== MICHAEL_AUTHOR) throw new Error('O username já pertence a outra conta; importação cancelada.');
  if (!author) {
    const { lastInsertRowid } = db.prepare(`INSERT INTO users (username, display_name, email, password_hash, bio)
      VALUES (?, ?, ?, ?, ?)`).run(username, MICHAEL_AUTHOR, 'photos-michael-james-khosa@lume.invalid',
      hashPassword(crypto.randomBytes(48).toString('hex')),
      'Fotografias de Maputo por Michael James Khosa, partilhadas na Lume.');
    author = { id: lastInsertRowid };
  }
  let replaced = 0, added = 0;
  MICHAEL_PHOTOS.forEach((photo, index) => {
    if (db.prepare('SELECT id FROM photos WHERE src = ?').get(photo.src)) return;
    const previous = replacements[index] && db.prepare(`SELECT p.id FROM photos p
      WHERE p.src LIKE ? AND p.status = 'approved' AND p.credit_url LIKE 'https://unsplash.com/%'
      AND NOT EXISTS (SELECT 1 FROM featured f WHERE f.photo_id = p.id)
      ORDER BY p.id LIMIT 1`).get(`https://images.unsplash.com/${replacements[index]}?%`);
    const values = [author.id, photo.title, photo.category,
      'Fotografia de Maputo por Michael James Khosa.', 'maputo-cidade', 'Maputo',
      photo.src, photo.thumb, photo.width, photo.height];
    if (previous) {
      db.prepare(`UPDATE photos SET user_id = ?, title = ?, category = ?, description = ?, province = ?, city = ?,
        src = ?, thumb = ?, width = ?, height = ?, camera = '', lens = '', phone = '',
        credit_name = '', credit_url = '', source_url = '', reject_reason = '', reviewed_at = datetime('now')
        WHERE id = ?`).run(...values, previous.id);
      replaced++;
    } else {
      db.prepare(`INSERT INTO photos (user_id, title, category, description, province, city, src, thumb, width, height, status, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now'))`).run(...values);
      added++;
    }
  });
  return { replaced, added };
});
console.log(`Michael James Khosa: ${result.replaced} substituídas, ${result.added} adicionadas. Perfil: /@${username}`);
db.close();
