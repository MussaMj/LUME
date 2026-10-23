import nodemailer from 'nodemailer';
import { db } from './db.js';
import { ADMIN_EMAIL } from './auth.js';

let transport;
let working = false;
let rerun = false;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM || !process.env.APP_URL) return null;
  const origin = new URL(process.env.APP_URL);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('APP_URL inválido.');
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: process.env.NODE_ENV === 'production',
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transport;
}

// Called inside the photo transaction so a committed upload always has a notification.
export function queueUploadEmail(photoId, user, photo) {
  db.prepare('INSERT INTO email_outbox (photo_id, payload) VALUES (?, ?)').run(photoId, JSON.stringify({
    name: user.display_name, email: user.email, title: photo.title, category: photo.category,
  }));
}

// Queued in the moderation transaction; repeat approvals never send duplicate confirmations.
export function queueApprovalEmail(photo) {
  db.prepare("INSERT OR IGNORE INTO email_outbox (photo_id, kind, payload) VALUES (?, 'approval', ?)")
    .run(photo.id, JSON.stringify({ name: photo.display_name, email: photo.author_email, title: photo.title }));
  db.prepare(`INSERT OR IGNORE INTO follower_notifications (photo_id,user_id,email_requested)
    SELECT ?,f.follower_id,f.notify_email FROM follows f JOIN users u ON u.id = f.followed_id WHERE u.username = ?`).run(photo.id,photo.username);
}

export async function flushMailQueue() {
  if (working) { rerun = true; return; }
  working = true;
  try {
    const sender = getTransport();
    if (!sender) return;
    const accountMessages=db.prepare('SELECT * FROM account_mail WHERE sent_at IS NULL AND next_attempt_at<=? ORDER BY id LIMIT 10').all(Date.now());
    for(const row of accountMessages) {
      try {
        if(!db.prepare('SELECT token_hash FROM account_tokens WHERE user_id=? AND kind=? AND used_at IS NULL AND expires_at>?').get(row.user_id,row.kind,Date.now())) {
          db.prepare("UPDATE account_mail SET sent_at=datetime('now'),payload='{}' WHERE id=?").run(row.id); continue;
        }
        const payload=JSON.parse(row.payload);
        const verify=row.kind==='verify';
        const info=await sender.sendMail({from:process.env.MAIL_FROM,to:payload.to,
          subject:verify?'[Lume] Confirma o teu e-mail':'[Lume] Recuperar palavra-passe',
          text:`${verify?'Confirma o teu e-mail para entrar no Lume.':'Pediste para recuperar a tua palavra-passe.'}\n\n${payload.url}\n\nEste link expira em ${verify?'24 horas':'30 minutos'}. Se não fizeste este pedido, ignora esta mensagem.`});
        if(!info.accepted?.length)throw new Error('Recipient rejected');
        db.prepare("UPDATE account_mail SET sent_at=datetime('now'),payload='{}',attempts=attempts+1 WHERE id=?").run(row.id);
      } catch {
        db.prepare('UPDATE account_mail SET attempts=attempts+1,next_attempt_at=? WHERE id=?').run(Date.now()+Math.min(3600000,30000*2**Math.min(row.attempts,7)),row.id);
      }
    }
    const pending = db.prepare('SELECT * FROM email_outbox WHERE sent_at IS NULL AND next_attempt_at <= ? ORDER BY id LIMIT 10').all(Date.now());
    for (const row of pending) {
      try {
        const data = JSON.parse(row.payload);
        const photoUrl = new URL(`/foto/${row.photo_id}`, process.env.APP_URL).href;
        const adminUrl = new URL('/admin', process.env.APP_URL).href;
        const info = await sender.sendMail({
          from: process.env.MAIL_FROM,
          ...(row.kind === 'approval' ? {
            to: data.email,
            subject: '[Lume] A tua fotografia foi aprovada!',
            text: `Olá ${data.name},\n\nA tua fotografia “${data.title}” foi aprovada e já está disponível na galeria do Lume.\n\nVer fotografia: ${photoUrl}\n\nObrigado por partilhares o teu olhar connosco!\nEquipa Lume`,
          } : {
          to: ADMIN_EMAIL,
          subject: '[Lume] Nova foto pendente de aprovação!',
          text: `Uma nova fotografia aguarda aprovação.\n\nNome: ${data.name}\nE-mail: ${data.email}\nTítulo: ${data.title}\nCategoria: ${data.category}\n\nRever e aprovar: ${adminUrl}`,
          }),
        });
        if (!info.accepted?.length) throw new Error('Destinatário não aceite.');
        db.prepare("UPDATE email_outbox SET sent_at = datetime('now'), attempts = attempts + 1 WHERE id = ?").run(row.id);
      } catch (err) {
        const delay = Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7));
        db.prepare('UPDATE email_outbox SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?').run(Date.now() + delay, row.id);
        console.error(`[mail] Notificação ${row.id} adiada (${err.code || 'falha SMTP'}).`);
      }
    }
    const followers = db.prepare(`SELECT n.*,u.email,u.display_name,p.title,a.display_name AS author,a.username AS author_username
      FROM follower_notifications n JOIN users u ON u.id = n.user_id JOIN photos p ON p.id = n.photo_id
      JOIN users a ON a.id = p.user_id JOIN follows f ON f.follower_id = n.user_id AND f.followed_id = p.user_id
      WHERE n.email_requested = 1 AND f.notify_email = 1 AND n.emailed_at IS NULL AND p.status = 'approved' AND n.next_attempt_at <= ?
      ORDER BY n.id LIMIT 20`).all(Date.now());
    for (const notification of followers) {
      try {
        const info = await sender.sendMail({ from: process.env.MAIL_FROM, to: notification.email,
          subject: `[Lume] Nova fotografia de ${notification.author}`,
          text: `Olá ${notification.display_name},\n\n${notification.author} publicou “${notification.title}”.\n${new URL(`/foto/${notification.photo_id}`,process.env.APP_URL).href}\n\nPodes desactivar estes e-mails no perfil do fotógrafo, em “Receber novidades por e-mail”:\n${new URL(`/@${notification.author_username}`,process.env.APP_URL).href}` });
        if (!info.accepted?.length) throw new Error('Destinatário não aceite.');
        db.prepare("UPDATE follower_notifications SET emailed_at = datetime('now'), attempts = attempts + 1 WHERE id = ?").run(notification.id);
      } catch {
        db.prepare('UPDATE follower_notifications SET attempts = attempts + 1,next_attempt_at = ? WHERE id = ?')
          .run(Date.now()+Math.min(3600000,30000*2**Math.min(notification.attempts,7)),notification.id);
      }
    }

  } catch {
    console.error('[mail] Configuração de e-mail inválida. Verifica APP_URL e SMTP.');
  } finally {
    working = false;
    if (rerun) { rerun = false; void flushMailQueue(); }
  }
}

export function startMailWorker() {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM || !process.env.APP_URL) {
    console.warn('[mail] SMTP por configurar; notificações ficam guardadas para envio posterior.');
  }
  void flushMailQueue();
  const timer = setInterval(() => void flushMailQueue(), 30000);
  timer.unref();
  return timer;
}

export async function verifyMailConfiguration() {
  const sender=getTransport();
  if(!sender)throw new Error('Configura SMTP_HOST, MAIL_FROM e APP_URL.');
  await sender.verify();
  console.log('Ligação SMTP e autenticação verificadas. Confirma também a recepção real de um e-mail de teste pela aplicação.');
}
