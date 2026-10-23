import { db } from './db.js';
import { provinceName } from './provinces.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Texto limpo com limite de tamanho
export function text(value, { max = 200, required = false, label = 'Campo' } = {}) {
  const v = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (required && !v) throw new HttpError(400, `${label} é obrigatório.`);
  if (v.length > max) throw new HttpError(400, `${label} é demasiado longo (máx. ${max}).`);
  return v;
}

// Aceita "@nome", "nome" ou URL completo e devolve um URL seguro
export function socialUrl(value, host) {
  let v = text(value, { max: 200, label: 'Link' });
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) {
    const url = new URL(v);
    if (!url.hostname.endsWith(host)) throw new HttpError(400, `O link tem de ser do ${host}.`);
    return url.toString();
  }
  v = v.replace(/^@/, '');
  if (!/^[\w.-]{1,60}$/.test(v)) throw new HttpError(400, 'Nome de utilizador inválido.');
  return `https://www.${host}/${v}`;
}

export function shapePhoto(row, viewer) {
  if (!row) return null;
  const photo = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: row.category === 'Arquitetura' ? 'Arquitectura' : row.category,
    behindNote: row.behind_note,
    mood: row.mood,
    province: row.province,
    provinceName: provinceName(row.province),
    city: row.city,
    gear: { camera: row.camera, lens: row.lens, phone: row.phone },
    src: row.src,
    thumb: /^\/photos\/[^?]+-thumb\.jpg$/.test(row.thumb) ? row.thumb.replace(/\.jpg$/, '.webp') : row.thumb,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    inspiredCount: row.inspired_count ?? 0,
    savedCount: row.saved_count ?? 0,
    credit: row.credit_name ? { name: row.credit_name, url: row.credit_url, sourceUrl: row.source_url } : null,
    author: {
      username: row.username,
      displayName: row.display_name,
      instagram: row.instagram,
      behance: row.behance,
    },
  };
  if (viewer?.role === 'admin') photo.author.email = row.author_email;
  if (viewer) {
    photo.inspired = row.viewer_inspired !== undefined ? !!row.viewer_inspired : !!db
      .prepare('SELECT 1 FROM inspired WHERE user_id = ? AND photo_id = ?')
      .get(viewer.id, row.id);
  }
  if (viewer && (viewer.username === row.username || viewer.role === 'admin')) {
    photo.status = row.status;
    photo.rejectReason = row.reject_reason;
  }
  return photo;
}

export function shapePhotos(rows, viewer) {
  if (!viewer || !rows.length) return rows.map(row => shapePhoto(row, viewer));
  const likes = db.prepare('SELECT photo_id FROM inspired WHERE user_id=? AND photo_id IN (' + rows.map(() => '?').join(',') + ')').all(viewer.id, ...rows.map(row => row.id));
  const ids = new Set(likes.map(row => row.photo_id));
  return rows.map(row => shapePhoto({...row, viewer_inspired: ids.has(row.id)}, viewer));
}

export const publicUser = (u) => u && {
  username: u.username,
  displayName: u.display_name,
  bio: u.bio,
  instagram: u.instagram,
  behance: u.behance,
  role: u.role,
  ...(u.email ? { email: u.email } : {}),
};

// Express 5 já encaminha erros de funções async; isto só uniformiza a resposta
export function errorHandler(err, _req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ficheiro demasiado grande (máx. 6 MB por imagem).' });
  const status = err.code?.startsWith('LIMIT_') ? 400 : err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno.' : err.message });
}
