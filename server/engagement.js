import { db, PHOTO_SELECT } from './db.js';

// Independent counts avoid multiplying likes, saves and views through SQL joins.
export const engagementScore = (since = "datetime('now', '-7 days')") => `(
  (SELECT COUNT(*) FROM inspired i WHERE i.photo_id=p.id AND i.created_at >= ${since}) +
  (SELECT COUNT(*) FROM collection_items ci WHERE ci.photo_id=p.id AND ci.added_at >= ${since}) +
  (SELECT COUNT(*) FROM photo_views v WHERE v.photo_id=p.id AND v.viewed_at >= ${since})
)`;

export function weekStart(now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0,10);
}

export function featuredPhoto(now = new Date()) {
  const at = now.toISOString();
  const manual = db.prepare(`SELECT f.*, p.status FROM featured f JOIN photos p ON p.id=f.photo_id
    ORDER BY f.featured_at DESC, f.id DESC LIMIT 1`).get();
  if (manual?.status === 'approved' && Date.parse(manual.featured_at.replace(' ', 'T') + (manual.featured_at.includes('Z') ? '' : 'Z')) + 7*864e5 > now.getTime()) {
    return { row: db.prepare(`${PHOTO_SELECT} WHERE p.id=?`).get(manual.photo_id), note: manual.note, featuredAt: manual.featured_at, source: 'manual' };
  }
  const week = weekStart(now);
  let selected = db.prepare(`SELECT w.photo_id FROM weekly_featured w JOIN photos p ON p.id=w.photo_id WHERE w.week_start=? AND p.status='approved'`).get(week);
  if (!selected) {
    const since = new Date(now.getTime()-7*864e5).toISOString().replace('T',' ').slice(0,19);
    const winner = db.prepare(`SELECT p.id, ${engagementScore('?')} AS score FROM photos p WHERE p.status='approved'
      ORDER BY score DESC, p.created_at DESC, p.id DESC LIMIT 1`).get(since,since,since);
    if (winner) {
      db.prepare(`INSERT INTO weekly_featured(week_start,photo_id,score,selected_at) VALUES(?,?,?,?)
        ON CONFLICT(week_start) DO UPDATE SET photo_id=excluded.photo_id,score=excluded.score,selected_at=excluded.selected_at`).run(week,winner.id,winner.score,at);
      selected = {photo_id:winner.id};
    }
  }
  return { row: selected ? db.prepare(`${PHOTO_SELECT} WHERE p.id=?`).get(selected.photo_id) : null, note: '', featuredAt: week, source: 'automatic' };
}
