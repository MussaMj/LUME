import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const temp = mkdtempSync(path.join(tmpdir(), 'lume-test-'));
process.env.DB_PATH = path.join(temp, 'test.db');
const { db } = await import('../server/db.js');
const { hashPassword, ADMIN_EMAIL } = await import('../server/auth.js');
let child, origin, adminCookie, userCookie, smtp;
const messages = [];
let rejectMail = true;
let output = '';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(50); }
  assert.fail('Timed out waiting for condition');
}

async function request(url, { cookie, body, method = 'GET', form } = {}) {
  const res = await fetch(origin + url, {
    method, redirect: 'manual',
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const raw = await res.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: res.status, data, headers: res.headers };
}

async function upload(title, cookie = userCookie) {
  const form = new FormData();
  form.set('title', title); form.set('category', 'Natureza');
  form.set('province', 'maputo-cidade'); form.set('city', 'Maputo');
  form.set('description', 'Uma fotografia de teste.');
  form.set('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'foto.png');
  return request('/api/photos', { cookie, method: 'POST', form });
}

before(async () => {
  db.prepare("INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')")
    .run('curador', 'Curador', ADMIN_EMAIL, hashPassword('test-admin-password'));
  // An old manually assigned admin role must not grant access to another email.
  db.prepare("INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .run('fotografo', 'Fotógrafo', 'author@example.test', hashPassword('test-user-password'));
  smtp = net.createServer((socket) => {
    socket.write('220 localhost ESMTP\r\n');
    let buffer = '', inData = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (true) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) break;
          const message = buffer.slice(0, end); buffer = buffer.slice(end + 5); inData = false;
          if (rejectMail) socket.write('451 Try later\r\n');
          else { messages.push(message); socket.write('250 Accepted\r\n'); }
          continue;
        }
        const end = buffer.indexOf('\r\n'); if (end < 0) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (/^EHLO|^HELO/i.test(line)) socket.write('250 localhost\r\n');
        else if (/^DATA/i.test(line)) { inData = true; socket.write('354 Send data\r\n'); }
        else if (/^QUIT/i.test(line)) { socket.end('221 Bye\r\n'); }
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1'); await once(smtp, 'listening');
  const portServer = net.createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const port = portServer.address().port; await new Promise((resolve) => portServer.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), UPLOAD_DIR: path.join(temp, 'uploads'),
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_USER: '', SMTP_PASS: '',
      MAIL_FROM: 'Lume <sender@example.test>', APP_URL: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (s) => output += s); child.stderr.on('data', (s) => output += s);
  await eventually(async () => { try { return (await fetch(origin + '/api/auth/me')).ok; } catch { return false; } });
});

after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  if (smtp) await new Promise((resolve) => smtp.close(resolve));
  db.close(); rmSync(temp, { recursive: true, force: true });
});

test('RBAC, protected HTML aliases, and reserved registration', async () => {
  let r = await request('/api/auth/register', { method: 'POST', body: { username: 'intruder', displayName: 'Intruder', email: ADMIN_EMAIL.toUpperCase(), password: 'test-password' } });
  assert.equal(r.status, 403);
  r = await request('/api/auth/login', { method: 'POST', body: { login: ADMIN_EMAIL.toUpperCase(), password: 'test-admin-password' } });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin');
  adminCookie = r.headers.get('set-cookie').split(';')[0];
  r = await request('/api/auth/login', { method: 'POST', body: { login: 'fotografo', password: 'test-user-password' } });
  assert.equal(r.data.user.role, 'user'); userCookie = r.headers.get('set-cookie').split(';')[0];
  for (const route of ['/admin', '/admin.html', '/bastidores', '/bastidores.html']) {
    for (const cookie of [undefined, userCookie]) {
      r = await request(route, { cookie });
      assert.equal(r.status, 302);
      if (cookie) assert.equal(r.headers.get('location'), '/?error=access-denied');
      else {
        const target = new URL(r.headers.get('location'), origin);
        assert.equal(target.pathname, '/entrar');
        assert.equal(target.searchParams.get('next'), route);
        assert.equal(target.searchParams.get('notice'), 'admin-login');
      }
    }
    assert.equal((await request(route, { cookie: adminCookie })).status, 200);
  }
  assert.equal((await request('/%61dmin.html', { cookie: userCookie })).status, 404);
  for (const url of ['/api/admin/stats', '/api/admin/queue']) {
    assert.equal((await request(url, { cookie: userCookie })).status, 403);
  }
  assert.equal((await request('/api/admin/review-batch', { cookie: userCookie, method: 'POST', body: { ids: [1], action: 'approve' } })).status, 403);
});

test('pending upload, SMTP failure persistence, approval and public author privacy', async () => {
  assert.equal((await upload('Sem sessão', '')).status, 401);
  const result = await upload('Luz de Maputo');
  assert.equal(result.status, 201); const p = result.data.photo;
  assert.equal(p.status, 'pending'); assert.equal(p.category, 'Natureza');
  assert.equal((await request(p.src)).status, 404);
  assert.equal((await request(`/api/photos/${p.id}`)).status, 404);
  assert.equal((await request('/api/photos')).data.photos.length, 0);
  await eventually(() => db.prepare('SELECT attempts FROM email_outbox WHERE photo_id = ?').get(p.id).attempts > 0);
  assert.equal(db.prepare('SELECT sent_at FROM email_outbox WHERE photo_id = ?').get(p.id).sent_at, null);
  const queue = (await request('/api/admin/queue', { cookie: adminCookie })).data.photos;
  assert.equal(queue[0].author.email, 'author@example.test');
  assert.equal((await request(`/api/admin/photos/${p.id}/approve`, { cookie: userCookie, method: 'POST', body: {} })).status, 403);
  const controller = new AbortController();
  const events = await fetch(origin + '/api/events', { signal: controller.signal });
  const reader = events.body.getReader(); await reader.read();
  assert.equal((await request(`/api/admin/photos/${p.id}/approve`, { cookie: adminCookie, method: 'POST', body: {} })).status, 200);
  const event = await reader.read(); assert.match(Buffer.from(event.value).toString(), /event: photos/); controller.abort();
  const publicPhoto = (await request('/api/photos')).data.photos[0];
  assert.equal(publicPhoto.id, p.id); assert.equal(publicPhoto.author.email, undefined);
  assert.equal((await request(p.src)).status, 200);
});

test('batch review is atomic; rejection reason is visible to the owner', async () => {
  const a = (await upload('Foto A')).data.photo, b = (await upload('Foto B')).data.photo;
  let r = await request('/api/admin/review-batch', { cookie: adminCookie, method: 'POST', body: { ids: [a.id, 999999], action: 'reject' } });
  assert.equal(r.status, 409);
  assert.equal(db.prepare('SELECT status FROM photos WHERE id = ?').get(a.id).status, 'pending');
  r = await request('/api/admin/review-batch', { cookie: adminCookie, method: 'POST', body: { ids: [a.id, b.id], action: 'reject', reason: 'Resolução baixa' } });
  assert.equal(r.status, 200); assert.equal(r.data.count, 2);
  const mine = (await request(`/api/photos/${a.id}`, { cookie: userCookie })).data.photo;
  assert.equal(mine.status, 'rejected'); assert.equal(mine.rejectReason, 'Resolução baixa');
  assert.equal((await request(a.src)).status, 404);
  const stats = (await request('/api/admin/stats', { cookie: adminCookie })).data;
  assert.deepEqual(stats, { pending: 0, approved: 1, rejected: 2, users: 2 });
});

test('queued mail is retried with the requested recipient, subject and review link', async () => {
  await eventually(() => db.prepare('SELECT COUNT(*) AS n FROM email_outbox WHERE attempts = 0').get().n === 0);
  rejectMail = false;
  db.prepare('UPDATE email_outbox SET next_attempt_at = 0 WHERE sent_at IS NULL').run();
  await upload('Disparar envio');
  await eventually(() => db.prepare('SELECT COUNT(*) AS n FROM email_outbox WHERE sent_at IS NULL').get().n === 0);
  assert.equal(messages.length, 5);
  const message = messages[0].replace(/=\r\n/g, '').replace(/=([A-F0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  assert.match(message, /To: innovateiv\.crtf@gmail\.com/);
  const subject = messages[0].match(/Subject: ([\s\S]*?)\r\n[^ \t]/)[1].replace(/\r\n[ \t]+/g, '');
  const decoded = subject.replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_, encoding, data) => encoding.toUpperCase() === 'B' ? Buffer.from(data, 'base64').toString() : Buffer.from(data.replace(/_/g, ' ').replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'));
  assert.equal(decoded, '[Lume] Nova foto pendente de aprovação!');
  assert.match(message, /author@example\.test/); assert.match(message, /Luz de Maputo/);
  assert.match(message, /Natureza/); assert.ok(message.includes(origin + '/admin'));
});


test('author receives individual and batch approval emails without duplicate confirmations', async () => {
  const previousConfirmation = messages.find((message) => /To: author@example\.test/.test(message));
  assert.ok(previousConfirmation, 'Individual approval must notify the author');
  assert.ok(previousConfirmation.replace(/=\r\n/g, '').includes(origin + '/foto/1'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE photo_id = 1 AND kind = 'approval'").get().n, 1);
  await request('/api/admin/photos/1/approve', { cookie: adminCookie, method: 'POST', body: {} });
  await request('/api/admin/photos/1/reject', { cookie: adminCookie, method: 'POST', body: {} });
  await request('/api/admin/photos/1/approve', { cookie: adminCookie, method: 'POST', body: {} });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE photo_id = 1 AND kind = 'approval'").get().n, 1);
  const a = (await upload('Aprovação em lote A')).data.photo;
  const b = (await upload('Aprovação em lote B')).data.photo;
  const beforeCount = db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'approval'").get().n;
  const failed = await request('/api/admin/review-batch', { cookie: adminCookie, method: 'POST', body: { ids: [a.id, 999999], action: 'approve' } });
  assert.equal(failed.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'approval'").get().n, beforeCount);
  const success = await request('/api/admin/review-batch', { cookie: adminCookie, method: 'POST', body: { ids: [a.id, b.id], action: 'approve' } });
  assert.equal(success.status, 200);
  await eventually(() => db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'approval' AND sent_at IS NOT NULL").get().n === beforeCount + 2);
  for (const id of [a.id, b.id]) {
    const confirmation = messages.find((message) => /To: author@example\.test/.test(message) && message.replace(/=\r\n/g, '').includes(origin + '/foto/' + id));
    assert.ok(confirmation, `Missing approval email for photo ${id}`);
    const subject = confirmation.match(/Subject: ([\s\S]*?)\r\n[^ \t]/)[1].replace(/\r\n[ \t]+/g, '');
    const decoded = subject.replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi, (_, encoding, data) => encoding.toUpperCase() === 'B' ? Buffer.from(data, 'base64').toString() : Buffer.from(data.replace(/_/g, ' ').replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'));
    assert.equal(decoded, '[Lume] A tua fotografia foi aprovada!');
  }
});


test('followers receive publication email only after explicit opt-in', async () => {
  const registered = await request('/api/auth/register', { method: 'POST', body: { username: 'follower', displayName: 'Follower', email: 'follower@example.test', password: 'test-follower-password' } });
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  await request('/api/users/fotografo/follow', { cookie, method: 'POST', body: { notifyEmail: true } });
  const photo = (await upload('Novidade para seguidores')).data.photo;
  await request(`/api/admin/photos/${photo.id}/approve`, { cookie: adminCookie, method: 'POST', body: {} });
  await eventually(() => messages.some((message) => /To: follower@example\.test/.test(message)));
  const notification = db.prepare('SELECT * FROM follower_notifications WHERE photo_id = ?').get(photo.id);
  assert.ok(notification.emailed_at);
  const mail = messages.find((message) => /To: follower@example\.test/.test(message));
  assert.ok(mail.replace(/=\r\n/g, '').includes(origin + '/foto/' + photo.id));
});
