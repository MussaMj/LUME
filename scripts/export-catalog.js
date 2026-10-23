// Public content only. Never export account credentials, emails, sessions or private collections.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const database=new DatabaseSync(process.env.DB_PATH || path.resolve('data/3maine.db'),{readOnly:true});
const rows=database.prepare(`SELECT p.*,u.username,u.display_name,u.bio,u.instagram,u.behance FROM photos p JOIN users u ON u.id=p.user_id WHERE p.status='approved' ORDER BY p.id`).all();
const catalog=rows.map(p=>{
 const asset=src=>{
  if(src.startsWith('/media/')){
   const directory=path.resolve('server/catalog-media');mkdirSync(directory,{recursive:true});
   copyFileSync(path.join(process.env.UPLOAD_DIR || path.resolve('uploads'),path.basename(src)),path.join(directory,path.basename(src)));
   return src;
  }
  if(!src.startsWith('/photos/') && !src.startsWith('https://images.unsplash.com/'))throw new Error('Origem de imagem não autorizada no catálogo.');
  return src;
 };
 return {author:{username:p.username,displayName:p.display_name,bio:p.bio,instagram:p.instagram,behance:p.behance},
  title:p.title,description:p.description,category:p.category,province:p.province,city:p.city,behindNote:p.behind_note,mood:p.mood,
  camera:p.camera,lens:p.lens,phone:p.phone,src:asset(p.src),thumb:asset(p.thumb),width:p.width,height:p.height,
  creditName:p.credit_name,creditUrl:p.credit_url,sourceUrl:p.source_url};
});
writeFileSync('public/data/launch-catalog.json',JSON.stringify(catalog,null,2)+'\n');database.close();console.log(`${catalog.length} fotografias públicas exportadas, sem dados de autenticação.`);
