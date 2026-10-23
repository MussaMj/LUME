// Provisionamento local do único administrador. Nunca aceita palavras-passe pela CLI.
import { db } from '../server/db.js';
import { ADMIN_EMAIL, hashPassword } from '../server/auth.js';

const username = process.argv[2];
if (!/^[a-z0-9_.]{3,30}$/.test(username || '')) {
  console.error('Uso: LUME_ADMIN_PASSWORD=<segredo> npm run admin -- <username>');
  process.exit(1);
}
const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL);
if (existing) {
  db.prepare("UPDATE users SET role = 'admin',verified_at=COALESCE(verified_at,datetime('now')) WHERE id = ?").run(existing.id);
  console.log(`Conta administrativa existente: @${existing.username}. Painel: /admin`);
} else {
  const password = process.env.LUME_ADMIN_PASSWORD || '';
  if (password.length < 12) {
    console.error('Define LUME_ADMIN_PASSWORD com pelo menos 12 caracteres para criar a conta administrativa.');
    process.exit(1);
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    console.error('Esse username já existe. Escolhe outro para a conta administrativa.');
    process.exit(1);
  }
  db.prepare("INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .run(username, 'Administração Lume', ADMIN_EMAIL, hashPassword(password));
  db.prepare("UPDATE users SET verified_at=datetime('now') WHERE email=?").run(ADMIN_EMAIL);
  console.log(`Conta @${username} criada. Painel: /admin`);
}
