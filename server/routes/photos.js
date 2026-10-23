import { persistentLimit } from '../security.js';
import { engagementScore, featuredPhoto } from '../engagement.js';
import { Router } from 'express';
import multer from 'multer';
import { imageSize } from 'image-size';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, PHOTO_SELECT, tx } from '../db.js';
import { queueUploadEmail, flushMailQueue } from '../mail.js';
import { photosChanged, engagementChanged } from '../events.js';
import { requireUser } from '../auth.js';
import { PROVINCE_IDS } from '../provinces.js';
import { HttpError, shapePhoto, text } from '../util.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(import.meta.dirname, '..', '..', 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 2, fields: 20, fieldSize: 4096, parts: 22 },
});

const router = Router();
let activeUploads=0;
function uploadSlot(req,res,next) {
  if(activeUploads>=2)return res.status(429).set('Retry-After','5').json({error:'Há outros envios a decorrer. Tenta novamente dentro de alguns segundos.'});
  if(Number(req.headers['content-length'])>13*1024*1024)return res.status(413).json({error:'O envio excede 13 MB.'});
  activeUploads++;
  let released=false;
  const release=()=>{if(!released){released=true;activeUploads--;}};
  res.once('finish',release);res.once('close',release);
  next();
}

/* ---------- Feed "Descobrir" (apenas aprovadas, mistura estável por seed) ---------- */
router.get('/', (req, res) => {
  const limit = Math.max(1, Math.min(Math.trunc(Number(req.query.limit)) || 24, 60));
  const page = Math.max(Number(req.query.page) || 0, 0);
  const seed = Number(req.query.seed) || 1;
  const province = req.query.province;
  const where = ["p.status = 'approved'"];
  const params = [];
  if (province) {
    if (!PROVINCE_IDS.has(province)) throw new HttpError(400, 'Província inválida.');
    where.push('p.province = ?');
    params.push(province);
  }
  for (const [query, column] of [['category', 'category'], ['mood', 'mood']]) {
    if (req.query[query]) { where.push(`p.${column} = ?`); params.push(text(req.query[query], { max: 60 })); }
  }
  if (req.query.following === '1') {
    if (!req.user) throw new HttpError(401, 'Entra para ver quem segues.');
    where.push('p.user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?)');
    params.push(req.user.id);
  }
  if (req.query.author) { where.push('u.username = ?'); params.push(text(req.query.author, { max: 60 })); }
  const order = req.query.sort === 'popular' ? `${engagementScore()} DESC, p.created_at DESC, p.id DESC`
    : req.query.sort === 'recent' ? 'p.created_at DESC, p.id DESC' : 'mix(p.id, ?)';
  const rows = db.prepare(`${PHOTO_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, ...(req.query.sort === 'popular' || req.query.sort === 'recent' ? [] : [seed]), limit + 1, page * limit);
  res.json({
    photos: rows.slice(0, limit).map((r) => shapePhoto(r, req.user)),
    hasMore: rows.length > limit,
  });
});

// Contagem por província (para o mapa)
router.get('/stats', (_req, res) => {
  const rows = db.prepare("SELECT province, COUNT(*) AS n FROM photos WHERE status = 'approved' GROUP BY province").all();
  res.json(Object.fromEntries(rows.map((r) => [r.province, r.n])));
});

/* ---------- Foto da Semana ---------- */
router.get('/featured', (req, res) => {
  const { row, ...meta } = featuredPhoto();
  res.json({ photo: shapePhoto(row, req.user), ...meta });
});

router.get('/map-preview', (req, res) => {
  const rows = db.prepare(`SELECT province, COUNT(*) AS total, (SELECT p2.id FROM photos p2
    WHERE p2.province=p.province AND p2.status='approved' ORDER BY p2.created_at DESC,p2.id DESC LIMIT 1) AS photo_id
    FROM photos p WHERE status='approved' GROUP BY province`).all();
  res.json({ provinces: Object.fromEntries(rows.map(r => [r.province, { total:r.total,
    photo:shapePhoto(db.prepare(`${PHOTO_SELECT} WHERE p.id=?`).get(r.photo_id), req.user) }])) });
});

router.get('/:id/related', (req, res) => {
  const photo = db.prepare("SELECT id,user_id,province FROM photos WHERE id=? AND status='approved'").get(Number(req.params.id));
  if (!photo) throw new HttpError(404, 'Fotografia não encontrada.');
  let rows = db.prepare(`${PHOTO_SELECT} WHERE p.status='approved' AND p.user_id=? AND p.id!=? ORDER BY p.created_at DESC,p.id DESC LIMIT 4`).all(photo.user_id,photo.id);
  let label = 'Do mesmo fotógrafo';
  if (!rows.length && photo.province) {
    rows = db.prepare(`${PHOTO_SELECT} WHERE p.status='approved' AND p.province=? AND p.id!=? ORDER BY p.created_at DESC,p.id DESC LIMIT 4`).all(photo.province,photo.id);
    label = 'Mais desta província';
  }
  res.json({ label, photos: rows.map(r=>shapePhoto(r,req.user)) });
});

router.post('/:id/view', (req,res) => {
  const id = approvedPhoto(req.params.id);
  let token = req.headers.cookie?.match(/(?:^|;\s*)lume_viewer=([a-f0-9]{48})(?:;|$)/)?.[1];
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('lume_viewer',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:30*864e5,path:'/'});
  }
  const key = crypto.createHash('sha256').update(req.user ? `user:${req.user.id}` : token).digest('hex');
  db.prepare("INSERT OR IGNORE INTO photo_views(photo_id,viewer_key,viewed_day) VALUES(?,?,date('now'))").run(id,key);
  res.json({ok:true});
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`${PHOTO_SELECT} WHERE p.id = ?`).get(Number(req.params.id));
  const canSee = row && (row.status === 'approved' || req.user?.role === 'admin' || req.user?.username === row.username);
  if (!canSee) throw new HttpError(404, 'Fotografia não encontrada.');
  res.json({ photo: shapePhoto(row, req.user) });
});

/* ---------- Envio (fica na fila de moderação) ---------- */
function saveImage(file) {
  let info;
  try {
    info = imageSize(file.buffer);
  } catch {
    throw new HttpError(400, 'O ficheiro não é uma imagem válida.');
  }
  const ext = ALLOWED[info.type];
  if (!ext) throw new HttpError(400, 'Formato não suportado. Usa JPG, PNG ou WebP.');
  if (!info.width || !info.height || info.width * info.height > 40_000_000) throw new HttpError(400,'A imagem excede o limite de 40 megapixels.');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  // Orientação EXIF 5–8 = imagem rodada 90°
  const rotated = info.orientation >= 5;
  return { url: `/media/${name}`, width: rotated ? info.height : info.width, height: rotated ? info.width : info.height };
}

router.post(
  '/',
  requireUser,
  persistentLimit({scope:'upload',windowMs:24*3600e3,max:20,key:req=>req.user.id}),
  (req,res,next)=>{
    const used=db.prepare('SELECT COALESCE(SUM(byte_size),0) AS size FROM photos WHERE user_id=?').get(req.user.id).size;
    if(used>=500*1024*1024)return res.status(413).json({error:'Atingiste o limite de armazenamento de 500 MB.'});
    next();
  },
  uploadSlot,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]),
  (req, res) => {
    const image = req.files?.image?.[0];
    const used=db.prepare('SELECT COALESCE(SUM(byte_size),0) AS size FROM photos WHERE user_id=?').get(req.user.id).size;
    const bytes=(image?.size || 0)+(req.files?.thumb?.[0]?.size || 0);
    if(used+bytes>500*1024*1024)throw new HttpError(413,'Atingiste o limite de armazenamento de 500 MB.');
    if (!image) throw new HttpError(400, 'Escolhe uma fotografia.');

    const title = text(req.body.title, { max: 90, required: true, label: 'Título' });
    const province = text(req.body.province, { required: true, label: 'Província' });
    if (!PROVINCE_IDS.has(province)) throw new HttpError(400, 'Província inválida.');
    const city = text(req.body.city, { max: 80, required: true, label: 'Cidade / localidade' });
    const category = text(req.body.category || 'Geral', { max: 60, required: true, label: 'Categoria' });
    const behindNote = text(req.body.behindNote, { max: 1200, label: 'Por trás da fotografia' });
    const mood = text(req.body.mood, { max: 60, label: 'Ambiente' });
    if (mood && !['Pôr do sol','Noite','Vida urbana','Serenidade','Preto e branco'].includes(mood)) throw new HttpError(400, 'Ambiente inválido.');
    const description = text(req.body.description, { max: 600, label: 'Descrição' });
    const camera = text(req.body.camera, { max: 80, label: 'Câmara' });
    const lens = text(req.body.lens, { max: 80, label: 'Objectiva' });
    const phone = text(req.body.phone, { max: 80, label: 'Telemóvel' });

    let full, thumb, row;
    try {
      full = saveImage(image);
      const thumbFile = req.files?.thumb?.[0];
      thumb = thumbFile ? saveImage(thumbFile) : full;
      row = tx(() => {
        const { lastInsertRowid } = db.prepare(`
          INSERT INTO photos (user_id, title, category, description, province, city, camera, lens, phone, src, thumb, width, height, behind_note, mood)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(req.user.id, title, category, description, province, city, camera, lens, phone, full.url, thumb.url, full.width, full.height, behindNote, mood);
        db.prepare('UPDATE photos SET byte_size=? WHERE id=?').run(bytes,lastInsertRowid);
        queueUploadEmail(Number(lastInsertRowid), req.user, { title, category });
        return db.prepare(`${PHOTO_SELECT} WHERE p.id = ?`).get(lastInsertRowid);
      });
    } catch (err) {
      deletePhotoFiles({ src: full?.url, thumb: thumb?.url });
      throw err;
    }
    photosChanged();
    void flushMailQueue();
    res.status(201).json({ photo: shapePhoto(row, req.user) });
  },
);

export function deletePhotoFiles(row) {
  for (const url of new Set([row.src, row.thumb])) {
    if (url?.startsWith('/media/')) {
      try { unlinkSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { /* já removido */ }
    }
  }
}

router.patch('/:id/story', requireUser, (req, res) => {
  const photo = db.prepare('SELECT user_id FROM photos WHERE id = ?').get(Number(req.params.id));
  if (!photo || photo.user_id !== req.user.id) throw new HttpError(404, 'Fotografia não encontrada.');
  const behindNote = text(req.body.behindNote, { max: 1200, label: 'Por trás da fotografia' });
  db.prepare('UPDATE photos SET behind_note = ? WHERE id = ?').run(behindNote, Number(req.params.id));
  photosChanged();
  res.json({ ok: true });
});

router.delete('/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(req.params.id));
  if (!row || (row.user_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Fotografia não encontrada.');
  db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
  deletePhotoFiles(row);
  photosChanged();
  res.json({ ok: true });
});

/* ---------- "Inspirou-me" ---------- */
function approvedPhoto(id) {
  const row = db.prepare("SELECT id FROM photos WHERE id = ? AND status = 'approved'").get(Number(id));
  if (!row) throw new HttpError(404, 'Fotografia não encontrada.');
  return row.id;
}

const inspiredCount = (id) => db.prepare('SELECT COUNT(*) AS n FROM inspired WHERE photo_id = ?').get(id).n;

router.post('/:id/inspired', requireUser, (req, res) => {
  const id = approvedPhoto(req.params.id);
  db.prepare('INSERT OR IGNORE INTO inspired (user_id, photo_id) VALUES (?, ?)').run(req.user.id, id);
  engagementChanged(id);
  res.json({ inspired: true, inspiredCount: inspiredCount(id) });
});

router.delete('/:id/inspired', requireUser, (req, res) => {
  const id = approvedPhoto(req.params.id);
  db.prepare('DELETE FROM inspired WHERE user_id = ? AND photo_id = ?').run(req.user.id, id);
  engagementChanged(id);
  res.json({ inspired: false, inspiredCount: inspiredCount(id) });
});

export default router;
