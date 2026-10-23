import { db } from './db.js';
import { EventEmitter } from 'node:events';

// Only invalidation signals are public; private photo/user data stays in guarded APIs.
export const photoEvents = new EventEmitter();
photoEvents.setMaxListeners(0);
export const photosChanged = () => photoEvents.emit('change');

export function engagementChanged(photoId) {
  const photo = db.prepare("SELECT id FROM photos WHERE id=? AND status='approved'").get(photoId);
  if (!photo) return;
  const inspiredCount = db.prepare('SELECT COUNT(*) AS n FROM inspired WHERE photo_id=?').get(photoId).n;
  const savedCount = db.prepare('SELECT COUNT(*) AS n FROM collection_items WHERE photo_id=?').get(photoId).n;
  photoEvents.emit('engagement',{photoId,inspiredCount,savedCount});
}
