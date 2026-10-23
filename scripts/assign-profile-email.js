// Trusted operator action: only attach a real email to an editorial placeholder profile.
import { ADMIN_EMAIL } from '../server/auth.js';
import { db } from '../server/db.js';
const username=process.argv[2], email=(process.env.LUME_PROFILE_EMAIL || '').trim().toLowerCase();
if(email===ADMIN_EMAIL)throw new Error('O endereço administrativo está reservado. Usa o comando admin.');
if(email.endsWith('.invalid'))throw new Error('Usa um endereço real do fotógrafo.');
if(!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Uso: LUME_PROFILE_EMAIL=<email> npm run profile:assign -- <username>');
const user=db.prepare('SELECT id,email FROM users WHERE username=?').get(username);
if(!user || !user.email.endsWith('@lume.invalid'))throw new Error('Só é permitido atribuir e-mail a um perfil editorial ainda não reclamado.');
db.prepare('UPDATE users SET email=?,verified_at=NULL WHERE id=?').run(email,user.id);
db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
console.log('E-mail atribuído. O autor deve usar Recuperar palavra-passe e confirmar a posse do endereço.');db.close();
