import crypto from 'node:crypto';
import { db, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { NEW_PHOTOGRAPHERS } from '../public/data/new-photographers.js';
const results = tx(() => NEW_PHOTOGRAPHERS.map(({author: name, username, email, photos}) => {
  let user = db.prepare('SELECT id, display_name, email FROM users WHERE username = ?').get(username);
  if (username === 'mussajunior') {
    if (!user || !['Mussa Mustafa', name].includes(user.display_name)) throw new Error('Verifica a conta mussajunior antes de importar.');
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, user.id);
  } else {
    if (user && (user.display_name !== name || user.email !== email)) throw new Error(`O username ${username} pertence a outra conta.`);
    if (!user) {
      const {lastInsertRowid} = db.prepare('INSERT INTO users (username, display_name, email, password_hash, bio) VALUES (?, ?, ?, ?, ?)').run(username, name, email,
        hashPassword(crypto.randomBytes(48).toString('hex')), `Fotografias de ${name}, partilhadas na Lume.`);
      user = {id:lastInsertRowid};
    }
  }
  let added = 0;
  for (const p of photos) {
    if (db.prepare('SELECT id FROM photos WHERE src = ?').get(p.src)) continue;
    db.prepare(`INSERT INTO photos (user_id, title, category, description, province, city, src, thumb, width, height, status, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now'))`).run(user.id,p.title,p.category,`Fotografia de ${name}.`,p.province,p.city,p.src,p.thumb,p.width,p.height);
    added++;
  }
  return {author:name,added,profile:`/@${username}`};
}));
console.log(results);db.close();
