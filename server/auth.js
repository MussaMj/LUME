import { allowedOrigins, verifyEmails } from './config.js';
import crypto from 'node:crypto';
import { db } from './db.js';

export const ADMIN_EMAIL = 'innovateiv.crtf@gmail.com';
export const roleForEmail = (email) => String(email).trim().toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';

const SESSION_DAYS = 30;
const COOKIE = 'sid';
const isProd = process.env.NODE_ENV === 'production';

/* ---------- Palavras-passe (scrypt) ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/* ---------- Sessões ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) { try { return decodeURIComponent(v.join('=')); } catch { return null; } }
  }
  return null;
}

// Coloca req.user (ou null) em todos os pedidos
export function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.email, u.bio, u.instagram, u.behance, u.role, u.verified_at, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`).get(sha256(token));
    if (row && new Date(row.expires_at) > new Date()) {
      delete row.expires_at;
      row.role = roleForEmail(row.email);
      req.user = row;
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Precisas de entrar na tua conta.' });
  if (verifyEmails && !req.user.verified_at) return res.status(403).json({ error: 'Confirma o teu e-mail antes de continuar.', code: 'EMAIL_UNVERIFIED' });
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso Negado' });
  next();
}

/* ---------- Protecção CSRF: pedidos que alteram dados têm de vir do próprio site ---------- */
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return res.status(403).json({ error: 'Origem em falta.' });
  try {
    const candidate = new URL(origin).origin;
    const configured = allowedOrigins();
    if (configured.size ? !configured.has(candidate) : new URL(origin).host !== req.headers.host) throw new Error();
  } catch {
    return res.status(403).json({ error: 'Origem inválida.' });
  }
  next();
}

/* ---------- Limite simples de tentativas (memória) ---------- */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > max) {
      return res.status(429).json({ error: 'Demasiadas tentativas. Tenta novamente daqui a pouco.' });
    }
    next();
  };
}

export function cleanupSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}
