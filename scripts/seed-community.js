import { db, tx } from '../server/db.js';

const result = tx(() => {
  const michael = db.prepare("SELECT id FROM users WHERE username = 'michael.james.khosa'").get();
  const admin = db.prepare("SELECT id FROM users WHERE email = 'innovateiv.crtf@gmail.com'").get();
  if (!michael && !admin) return 'Cria uma conta ou importa primeiro as fotografias de Michael.';
  const owner = admin?.id || michael.id;
  const add = (kind, userId, title, intro, payload) => {
    if (!db.prepare('SELECT id FROM community_items WHERE kind = ? AND title = ?').get(kind,title)) {
      db.prepare("INSERT INTO community_items (kind,user_id,title,intro,payload,status) VALUES (?,?,?,?,?,'published')")
        .run(kind,userId,title,intro,JSON.stringify(payload));
    }
  };
  if (michael) {
    const order = ['20260305_134616','20260403_171435','20251005_143842','img_1714','20260322_174313','20260501_173236','img_1190','img_3406'];
    const frames = order.map((key) => db.prepare("SELECT id,title FROM photos WHERE user_id = ? AND status = 'approved' AND src = ?").get(michael.id,`/photos/michael-james-khosa/${key}.jpg`))
      .filter(Boolean).map((photo) => ({ photoId: photo.id, caption: photo.title }));
    if (frames.length >= 5) add('story',michael.id,'Maputo, do dia ao luar',
      'Uma selecção editorial das fotografias de Michael James Khosa. A arquitectura, a vida junto à água e as mudanças de luz ligam estes olhares sobre Maputo.',{ frames });
    add('spotlight',owner,'O olhar de Michael James Khosa',
      'Conhece as fotografias de Maputo partilhadas por Michael James Khosa e acompanha as suas próximas publicações.',{ username:'michael.james.khosa' });
    for (const [key,mood] of [['img_3406','Noite'],['20260322_174313','Pôr do sol'],['20260501_173236','Pôr do sol'],['img_1190','Pôr do sol'],['img_1714','Serenidade'],['20260305_134616','Vida urbana'],['20260403_171435','Vida urbana']]) {
      db.prepare("UPDATE photos SET mood = ? WHERE user_id = ? AND src = ? AND mood = ''").run(mood,michael.id,`/photos/michael-james-khosa/${key}.jpg`);
    }
  }
  return 'História e fotógrafo em destaque preparados. Nenhum evento fictício foi criado.';
});
console.log(result);
db.close();
