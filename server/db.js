import { validateConfig } from './config.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

validateConfig();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH || path.join(root, 'data', '3maine.db');
mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
chmodSync(dbPath,0o600);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    bio           TEXT NOT NULL DEFAULT '',
    instagram     TEXT NOT NULL DEFAULT '',
    behance       TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  -- Ficha técnica + estado de moderação
  CREATE TABLE IF NOT EXISTS photos (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    province      TEXT NOT NULL,
    city          TEXT NOT NULL,
    camera        TEXT NOT NULL DEFAULT '',
    lens          TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    src           TEXT NOT NULL,
    thumb         TEXT NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at   TEXT,
    reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS photos_status_province ON photos (status, province);
  CREATE INDEX IF NOT EXISTS photos_user ON photos (user_id);

  CREATE TABLE IF NOT EXISTS inspired (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, photo_id)
  );

  CREATE TABLE IF NOT EXISTS collections (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    photo_id      INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    added_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, photo_id)
  );

  -- Foto da Semana: a mais recente é a actual
  CREATE TABLE IF NOT EXISTS featured (
    id          INTEGER PRIMARY KEY,
    photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    note        TEXT NOT NULL DEFAULT '',
    featured_at TEXT NOT NULL DEFAULT (datetime('now')),
    featured_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
`);

db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload', 'approval')),
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  UNIQUE (photo_id, kind)
)`);

// Preserve queued/sent upload notifications while allowing one approval notification per photo.
if (!db.prepare('PRAGMA table_info(email_outbox)').all().some((column) => column.name === 'kind')) {
  tx(() => db.exec(`
    ALTER TABLE email_outbox RENAME TO email_outbox_legacy;
    CREATE TABLE email_outbox (
      id INTEGER PRIMARY KEY,
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload', 'approval')),
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      UNIQUE (photo_id, kind)
    );
    INSERT INTO email_outbox (id, photo_id, payload, attempts, next_attempt_at, sent_at)
      SELECT id, photo_id, payload, attempts, next_attempt_at, sent_at FROM email_outbox_legacy;
    DROP TABLE email_outbox_legacy;
  `));
}

// Ordem pseudo-aleatória estável por "seed" — permite paginar um feed misturado
db.function('mix', { deterministic: true }, (id, seed) => {
  let h = (Number(id) * 2654435761 + Number(seed) * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h;
});

// Crédito externo (ex.: fotografias do Unsplash publicadas pela curadoria)
const photoColumns = new Set(db.prepare('PRAGMA table_info(photos)').all().map((c) => c.name));
if (!photoColumns.has('category')) db.exec("ALTER TABLE photos ADD COLUMN category TEXT NOT NULL DEFAULT 'Geral'");
for (const col of ['credit_name', 'credit_url', 'source_url']) {
  if (!photoColumns.has(col)) db.exec(`ALTER TABLE photos ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Community features extend existing installations without replacing their data.
for (const [table, column, definition] of [
  ['photos', 'behind_note', "TEXT NOT NULL DEFAULT ''"],
  ['photos', 'mood', "TEXT NOT NULL DEFAULT ''"],
  ['collections', 'is_public', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1))'],
]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((field) => field.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS community_items (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('story','challenge','event','spotlight')),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, intro TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS challenge_entries (
    item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(item_id,photo_id)
  );
  CREATE TABLE IF NOT EXISTS event_rsvps (
    item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(item_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notify_email INTEGER NOT NULL DEFAULT 0 CHECK(notify_email IN (0,1)),
    PRIMARY KEY(follower_id,followed_id), CHECK(follower_id != followed_id)
  );
  CREATE TABLE IF NOT EXISTS follower_notifications (
    id INTEGER PRIMARY KEY, photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_requested INTEGER NOT NULL DEFAULT 0, read_at TEXT, emailed_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE(photo_id,user_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS photo_views (
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    viewer_key TEXT NOT NULL, viewed_day TEXT NOT NULL,
    viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(photo_id, viewer_key, viewed_day)
  );
  CREATE INDEX IF NOT EXISTS photo_views_recent ON photo_views(photo_id, viewed_at);
  CREATE INDEX IF NOT EXISTS inspired_recent ON inspired(photo_id, created_at);
  CREATE INDEX IF NOT EXISTS collection_items_recent ON collection_items(photo_id, added_at);
  CREATE TABLE IF NOT EXISTS weekly_featured (
    week_start TEXT PRIMARY KEY, photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0, selected_at TEXT NOT NULL
  );
`);

// Campos públicos de uma fotografia + autor
export const PHOTO_SELECT = `
  SELECT p.id, p.title, p.description, p.category, p.behind_note, p.mood, p.province, p.city, p.camera, p.lens, p.phone,
         p.src, p.thumb, p.width, p.height, p.status, p.reject_reason, p.created_at,
         p.credit_name, p.credit_url, p.source_url,
         u.username, u.display_name, u.email AS author_email, u.instagram, u.behance,
         (SELECT COUNT(*) FROM inspired i WHERE i.photo_id = p.id) AS inspired_count,
         (SELECT COUNT(*) FROM collection_items ci WHERE ci.photo_id = p.id) AS saved_count
  FROM photos p JOIN users u ON u.id = p.user_id
`;

// Retired feature: retain historical records without exposing challenges in the site.
db.prepare("UPDATE community_items SET status = 'archived' WHERE kind = 'challenge' AND status != 'archived'").run();

if (!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='verified_at')) db.exec('ALTER TABLE users ADD COLUMN verified_at TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS request_limits (key TEXT NOT NULL,bucket INTEGER NOT NULL,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(key,bucket));
  CREATE INDEX IF NOT EXISTS request_limits_expiry ON request_limits(expires_at);
  CREATE TABLE IF NOT EXISTS account_tokens (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('verify','reset')),expires_at INTEGER NOT NULL,used_at INTEGER);
  CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(user_id,kind);
  CREATE TABLE IF NOT EXISTS account_mail (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,sent_at TEXT);
`);

if(!db.prepare('PRAGMA table_info(photos)').all().some(c=>c.name==='byte_size'))db.exec('ALTER TABLE photos ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0');
