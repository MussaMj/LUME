import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('legacy outbox migration preserves deliveries and allows an approval for the same photo', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'lume-migration-'));
  const moduleUrl = new URL('../server/db.js', import.meta.url).href;
  const env = { ...process.env, DB_PATH: path.join(temp, 'legacy.db') };
  const run = (code) => execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    run(`
      const { db } = await import(${JSON.stringify(moduleUrl)});
      db.exec("INSERT INTO users (username, display_name, email, password_hash) VALUES ('author', 'Author', 'author@example.test', 'unused')");
      db.exec("INSERT INTO photos (user_id, title, province, city, src, thumb, width, height) VALUES (1, 'Photo', 'maputo-cidade', 'Maputo', '/media/test.png', '/media/test.png', 1, 1)");
      db.exec('DROP TABLE email_outbox');
      db.exec('CREATE TABLE email_outbox (id INTEGER PRIMARY KEY, photo_id INTEGER NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, sent_at TEXT)');
      db.prepare('INSERT INTO email_outbox VALUES (?, ?, ?, ?, ?, ?)').run(7, 1, '{"title":"Photo"}', 3, 12345, '2026-10-14 10:00:00');
      db.close();
    `);
    const result = JSON.parse(run(`
      const { db } = await import(${JSON.stringify(moduleUrl)});
      const old = db.prepare('SELECT * FROM email_outbox WHERE id = 7').get();
      db.prepare("INSERT INTO email_outbox (photo_id, kind, payload) VALUES (1, 'approval', '{}')").run();
      console.log(JSON.stringify({ old, count: db.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n }));
      db.close();
    `));
    assert.deepEqual(result.old, { id: 7, photo_id: 1, kind: 'upload', payload: '{"title":"Photo"}', attempts: 3, next_attempt_at: 12345, sent_at: '2026-10-14 10:00:00' });
    assert.equal(result.count, 2);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
