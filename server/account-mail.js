import crypto from 'node:crypto';
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { flushMailQueue } from './mail.js';
import { HttpError } from './util.js';
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export function queueAccountEmail(userId,kind) {
  const recent=db.prepare('SELECT id FROM account_mail WHERE user_id=? AND kind=? AND next_attempt_at>?').get(userId,kind,Date.now()-60000);
  if(recent)return;
  const user=db.prepare('SELECT email FROM users WHERE id=?').get(userId);
  const token=crypto.randomBytes(32).toString('hex');
  const url=new URL('/entrar',process.env.APP_URL || 'http://localhost:8080');
  // The fragment is not sent to the HTTP server or included in referrer headers.
  url.hash=`${kind}=${token}`;
  tx(()=>{
    db.prepare('DELETE FROM account_tokens WHERE user_id=? AND kind=?').run(userId,kind);
    db.prepare('DELETE FROM account_mail WHERE user_id=? AND kind=? AND sent_at IS NULL').run(userId,kind);
    db.prepare('INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)').run(digest(token),userId,kind,Date.now()+(kind==='reset'?30*60e3:24*3600e3));
    db.prepare('INSERT INTO account_mail(user_id,kind,payload,next_attempt_at) VALUES(?,?,?,?)').run(userId,kind,JSON.stringify({to:user.email,url:url.href}),Date.now());
  });
  void flushMailQueue();
}
export function consumeAccountToken(token,kind,password) {
  if(!/^[a-f0-9]{64}$/.test(String(token || '')))throw new HttpError(400,'O link é inválido ou expirou. Pede um novo link.');
  return tx(()=>{
    const entry=db.prepare('SELECT * FROM account_tokens WHERE token_hash=? AND kind=? AND used_at IS NULL AND expires_at>?').get(digest(token),kind,Date.now());
    if(!entry)throw new HttpError(400,'O link é inválido ou expirou. Pede um novo link.');
    db.prepare('UPDATE account_tokens SET used_at=? WHERE token_hash=?').run(Date.now(),digest(token));
    if(kind==='reset') {
      db.prepare("UPDATE users SET password_hash=?,verified_at=COALESCE(verified_at,datetime('now')) WHERE id=?").run(hashPassword(password),entry.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(entry.user_id);
      db.prepare("DELETE FROM account_tokens WHERE user_id=? AND kind='reset'").run(entry.user_id);
    } else db.prepare("UPDATE users SET verified_at=datetime('now') WHERE id=?").run(entry.user_id);
    db.prepare('DELETE FROM account_mail WHERE user_id=? AND kind=?').run(entry.user_id,kind);
    return entry.user_id;
  });
}
