import path from 'node:path';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { db,tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
const catalog=JSON.parse(readFileSync(new URL('../public/data/launch-catalog.json',import.meta.url),'utf8'));
let added=0;
tx(()=>{
 for(const p of catalog){
  if(db.prepare('SELECT id FROM photos WHERE src=?').get(p.src))continue;
  let user=db.prepare('SELECT id,email FROM users WHERE username=?').get(p.author.username);
  if(user && !user.email.endsWith('@lume.invalid'))throw new Error('O catálogo não pode atribuir fotos novas a uma conta real sem revisão: '+p.author.username);
  if(!user){
   const {lastInsertRowid}=db.prepare('INSERT INTO users(username,display_name,email,password_hash,bio,instagram,behance) VALUES(?,?,?,?,?,?,?)').run(p.author.username,p.author.displayName,`catalog-${crypto.randomBytes(16).toString('hex')}@lume.invalid`,hashPassword(crypto.randomBytes(48).toString('hex')),p.author.bio,p.author.instagram,p.author.behance);
   user={id:lastInsertRowid};
  }
  for(const src of new Set([p.src,p.thumb]))if(src.startsWith('/media/')) {
    const directory=process.env.UPLOAD_DIR || path.resolve('uploads');mkdirSync(directory,{recursive:true});
    copyFileSync(new URL('../server/catalog-media/'+path.basename(src),import.meta.url),path.join(directory,path.basename(src)));
  }
  db.prepare(`INSERT INTO photos(user_id,title,description,category,province,city,behind_note,mood,camera,lens,phone,src,thumb,width,height,status,credit_name,credit_url,source_url,reviewed_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,datetime('now'))`).run(user.id,p.title,p.description,p.category,p.province,p.city,p.behindNote,p.mood,p.camera,p.lens,p.phone,p.src,p.thumb,p.width,p.height,p.creditName,p.creditUrl,p.sourceUrl);
  added++;
 }
});console.log(`${added} fotografias adicionadas. Os perfis editoriais não têm credenciais de acesso publicadas.`);db.close();
