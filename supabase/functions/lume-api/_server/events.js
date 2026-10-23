import{db}from'./db.js';
export async function photosChanged(){await db.prepare("INSERT INTO realtime_events(kind,payload) VALUES('photos','{}')").run();}
export async function engagementChanged(photoId){
 if(!await db.prepare("SELECT id FROM photos WHERE id=? AND status='approved'").get(photoId))return;
 const inspiredCount=(await db.prepare('SELECT COUNT(*) AS n FROM inspired WHERE photo_id=?').get(photoId)).n;
 const savedCount=(await db.prepare('SELECT COUNT(*) AS n FROM collection_items WHERE photo_id=?').get(photoId)).n;
 await db.prepare("INSERT INTO realtime_events(kind,payload) VALUES('engagement',?::jsonb)").run(JSON.stringify({photoId,inspiredCount,savedCount}));
}
