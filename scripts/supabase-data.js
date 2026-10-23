// One-time private migration. The generated SQL is deliberately ignored by Git.
import{DatabaseSync}from'node:sqlite';import fs from'node:fs';
const db=new DatabaseSync(process.env.DB_PATH || 'data/3maine.db',{readOnly:true});
const skip=new Set(['sessions','request_limits','account_tokens','account_mail','weekly_featured']);
const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(t=>t.name).filter(name=>!skip.has(name));
const literal=value=>value==null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
let sql='BEGIN;\nSET search_path TO lume,extensions,public;\n';const counts={};
for(const name of tables){
 const rows=db.prepare('SELECT * FROM "'+name+'"').all();counts[name]=rows.length;
 for(const row of rows){
  if(name==='users' && row.email==='innovateiv.crtf@gmail.com')row.verified_at ||= row.created_at;
  const keys=Object.keys(row);sql+=`INSERT INTO "${name}"(${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map(k=>literal(row[k])).join(',')}) ON CONFLICT DO NOTHING;\n`;
 }
 if(db.prepare('PRAGMA table_info("'+name+'")').all().some(c=>c.name==='id' && c.pk===1))sql+=`SELECT setval(pg_get_serial_sequence('lume.${name}','id'),COALESCE((SELECT MAX(id) FROM "${name}"),1),(SELECT COUNT(*)>0 FROM "${name}"));\n`;
}
sql+='COMMIT;\n';fs.writeFileSync('.env.supabase-data.sql',sql,{mode:0o600});db.close();console.log({privateMigrationPrepared:true,counts});
