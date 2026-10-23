import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './db.js';
export function createBackup(directory=process.env.BACKUP_DIR) {
  if(!directory)throw new Error('Define BACKUP_DIR.');
  const root=path.resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});
  const destination=path.join(root,`lume-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
  mkdirSync(destination,{mode:0o700});mkdirSync(path.join(destination,'uploads'),{mode:0o700});
  try {
    const database=path.join(destination,'database.sqlite');
    db.prepare('VACUUM INTO ?').run(database);chmodSync(database,0o600);
    const hashes={};
    const record=file=>{hashes[path.relative(destination,file)]=crypto.createHash('sha256').update(readFileSync(file)).digest('hex');};
    record(database);
    // All operations remain synchronous: requests cannot delete referenced files mid-snapshot in this single-process deployment.
    const media=new Set(db.prepare('SELECT src,thumb FROM photos').all().flatMap(p=>[p.src,p.thumb]).filter(src=>src.startsWith('/media/')).map(src=>path.basename(src)));
    for(const name of media){const target=path.join(destination,'uploads',name);copyFileSync(path.join(process.env.UPLOAD_DIR || path.resolve('uploads'),name),target);chmodSync(target,0o600);record(target);}
    writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),hashes},null,2),{mode:0o600});
    return destination;
  } catch(err){rmSync(destination,{recursive:true,force:true});throw err;}
}
export function startBackups() {
  if(!process.env.BACKUP_DIR)return;
  const run=()=>{try{createBackup();
    const root=path.resolve(process.env.BACKUP_DIR);
    const copies=readdirSync(root).filter(name=>/^lume-\d{4}-/.test(name)).sort().reverse();
    for(const name of copies.slice(7))rmSync(path.join(root,name),{recursive:true,force:true});
    console.log('[backup] Snapshot concluído.');}catch{console.error('[backup] FALHA: verifica o volume e o espaço disponível.');}};
  // Keep seven daily snapshots. Copy these to encrypted off-host storage as described in DEPLOYMENT.md.
  run();
  const timer=setInterval(run,24*3600e3);timer.unref();return timer;
}
