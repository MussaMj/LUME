import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
const temp=mkdtempSync(path.join(tmpdir(),'lume-production-'));
process.env.DB_PATH=path.join(temp,'db');process.env.UPLOAD_DIR=path.join(temp,'uploads');
const {db}=await import('../server/db.js');
const {createBackup}=await import('../server/backups.js');
let child,origin,cookie;
async function request(route,{method='POST',body,cookie:session=cookie}={}){
 const response=await fetch(origin+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
function token(kind){const row=db.prepare('SELECT payload FROM account_mail WHERE kind=? ORDER BY id DESC LIMIT 1').get(kind);return new URL(JSON.parse(row.payload).url).hash.slice(kind.length+2);}
before(async()=>{
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));origin=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),APP_URL:origin,SMTP_HOST:'',REQUIRE_EMAIL_VERIFICATION:'true',BETA_EMAILS:'invited@example.test'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}
 throw new Error('Server did not start');
});
after(async()=>{if(child?.exitCode===null){child.kill();await once(child,'exit');}db.close();rmSync(temp,{recursive:true,force:true});});

test('private beta registration requires an invitation and verified email before login',async()=>{
 const body={username:'invited',displayName:'Invited',email:'invited@example.test',password:'initial-test-password'};
 assert.equal((await request('/api/auth/register',{body:{...body,email:'outside@example.test'}})).status,403);
 const registered=await request('/api/auth/register',{body});assert.equal(registered.status,201);assert.equal(registered.data.verificationRequired,true);assert.equal(registered.cookie,undefined);
 assert.equal((await request('/api/auth/login',{body:{login:'invited',password:body.password}})).status,403);
 const verification=token('verify');assert.equal(verification.length,64);
 assert.equal((await request('/api/auth/verify-email',{body:{token:'invalid'}})).status,400);
 assert.equal((await request('/api/auth/verify-email',{body:{token:verification}})).status,200);
 assert.equal((await request('/api/auth/verify-email',{body:{token:verification}})).status,400);
 const login=await request('/api/auth/login',{body:{login:'invited',password:body.password}});assert.equal(login.status,200);cookie=login.cookie;
});

test('password recovery is generic, one-use and invalidates existing sessions',async()=>{
 const unknown=await request('/api/auth/request-reset',{body:{email:'unknown@example.test'}});
 const known=await request('/api/auth/request-reset',{body:{email:'invited@example.test'}});
 assert.deepEqual(known.data,unknown.data);
 const reset=token('reset');
 assert.equal((await request('/api/auth/reset-password',{body:{token:reset,password:'short'}})).status,400);
 assert.equal((await request('/api/auth/reset-password',{body:{token:reset,password:'new-test-password-123'}})).status,200);
 assert.equal((await request('/api/auth/me',{method:'GET'})).data.user,null);
 assert.equal((await request('/api/auth/reset-password',{body:{token:reset,password:'new-test-password-123'}})).status,400);
 const login=await request('/api/auth/login',{body:{login:'invited',password:'new-test-password-123'}});assert.equal(login.status,200);cookie=login.cookie;
});

test('health, security headers, malformed cookies and strict request origins',async()=>{
 const health=await request('/api/health',{method:'GET',cookie:'sid=%E0%A4%A'});
 assert.equal(health.status,200);assert.equal(health.headers.get('x-frame-options'),'DENY');assert.match(health.headers.get('content-security-policy'),/object-src 'none'/);
 const invalid=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:'https://untrusted.example'}});assert.equal(invalid.status,403);
});

test('uploads have daily quotas and byte storage limits before buffering',async()=>{
 const user=db.prepare("SELECT id FROM users WHERE username='invited'").get();
 const expires=Date.now()+3600000;
 const crypto=await import('node:crypto');
 const key=crypto.createHash('sha256').update(`upload:${user.id}`).digest('hex');
 db.prepare('INSERT INTO request_limits(key,bucket,hits,expires_at) VALUES(?,?,20,?)').run(key,Math.floor(Date.now()/(24*3600e3)),expires);
 const limited=await request('/api/photos',{body:{}});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
 db.prepare('DELETE FROM request_limits WHERE key=?').run(key);
 db.prepare("INSERT INTO photos(user_id,title,province,city,src,thumb,width,height,byte_size) VALUES(?,'Quota','sofala','Beira','/quota.jpg','/quota.jpg',1,1,?)").run(user.id,500*1024*1024);
 assert.equal((await request('/api/photos',{body:{}})).status,413);
});

test('backup has a consistent SQLite snapshot and a verifiable integrity manifest',()=>{
 const destination=createBackup(path.join(temp,'backups'));
 assert.ok(existsSync(path.join(destination,'database.sqlite')));
 const checked=spawnSync(process.execPath,['scripts/verify-backup.js',destination],{encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/Snapshot íntegro/);
 const manifest=JSON.parse(readFileSync(path.join(destination,'manifest.json'),'utf8'));assert.ok(manifest.hashes['database.sqlite']);
});

test('Vercel build refuses missing backend and produces static/proxy routes without private database files',()=>{
 const invalid=spawnSync(process.execPath,['scripts/build-vercel.js'],{env:{...process.env,BACKEND_ORIGIN:''},encoding:'utf8'});assert.notEqual(invalid.status,0);
 const build=spawnSync(process.execPath,['scripts/build-vercel.js'],{env:{...process.env,BACKEND_ORIGIN:'https://backend.example.test'},encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const config=JSON.parse(readFileSync('.vercel/output/config.json','utf8'));assert.equal(config.version,3);
 assert.ok(config.routes.find(r=>r.src==='/api/(.*)'&&r.dest==='https://backend.example.test/api/$1'));
 assert.equal(existsSync('.vercel/output/static/data/3maine.db'),false);
 assert.equal(existsSync('.vercel/output/static/admin.html'),false);
});

test('production configuration fails closed for ephemeral Vercel or incomplete deployment settings',()=>{
 const code="import {validateConfig} from './server/config.js';validateConfig();";
 const run=overrides=>spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,NODE_ENV:'production',APP_URL:'https://lume.example.test',DB_PATH:'/persistent/db',UPLOAD_DIR:'/persistent/uploads',BACKUP_DIR:'/persistent/backups',SMTP_HOST:'smtp.example.test',MAIL_FROM:'Lume <lume@example.test>',BETA_EMAILS:'tester@example.test',...overrides},encoding:'utf8'});
 assert.equal(run({}).status,0);
 assert.notEqual(run({APP_URL:'http://insecure.example.test'}).status,0);
 assert.notEqual(run({BETA_EMAILS:''}).status,0);
 assert.notEqual(run({BETA_EMAILS:' , '}).status,0);
 assert.notEqual(run({DB_PATH:''}).status,0);
 assert.notEqual(run({REQUIRE_EMAIL_VERIFICATION:'false'}).status,0);
 assert.notEqual(run({VERCEL:'1'}).status,0);
});

test('launch catalogue imports public content idempotently without production demo credentials',()=>{
 const run=()=>spawnSync(process.execPath,['scripts/import-catalog.js'],{env:{...process.env,NODE_ENV:'development'},encoding:'utf8'});
 const imported=run();assert.equal(imported.status,0,imported.stderr);
 const count=db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
 assert.ok(count>100);assert.equal(run().status,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,count);
 const accounts=db.prepare("SELECT email,password_hash,verified_at FROM users WHERE email LIKE '%@lume.invalid'").all();
 assert.ok(accounts.length>0);assert.ok(accounts.every(user=>user.password_hash.startsWith('scrypt$')&&!user.verified_at));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email='admin@lume.test'").get().n,0);
});

test('account recovery emails reach SMTP and queued plaintext links are purged after delivery',async()=>{
 const messages=[];
 const smtp=net.createServer(socket=>{
  socket.write('220 localhost ESMTP\r\n');let buffer='',inData=false;
  socket.on('data',chunk=>{
   buffer+=chunk.toString();
   while(true){
    if(inData){const end=buffer.indexOf('\r\n.\r\n');if(end<0)break;messages.push(buffer.slice(0,end));buffer=buffer.slice(end+5);inData=false;socket.write('250 Accepted\r\n');continue;}
    const end=buffer.indexOf('\r\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
    if(/^EHLO|^HELO/i.test(line))socket.write('250 localhost\r\n');
    else if(/^DATA/i.test(line)){inData=true;socket.write('354 Send data\r\n');}
    else if(/^QUIT/i.test(line))socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');
   }
  });
 });
 smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
 process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT=String(smtp.address().port);process.env.SMTP_USER='';process.env.MAIL_FROM='Lume <sender@example.test>';process.env.APP_URL=origin;
 try {
  const {queueAccountEmail}=await import('../server/account-mail.js');
  const {flushMailQueue}=await import('../server/mail.js');
  const user=db.prepare("SELECT id FROM users WHERE username='invited'").get();
  queueAccountEmail(user.id,'reset');
  for(let i=0;i<50;i++){const row=db.prepare("SELECT sent_at,payload FROM account_mail WHERE user_id=? AND kind='reset'").get(user.id);if(row?.sent_at){assert.equal(row.payload,'{}');break;}await new Promise(r=>setTimeout(r,20));}
  assert.equal(messages.length,1);assert.match(messages[0],/Recuperar palavra-passe/);assert.match(messages[0],/entrar#reset/);
  assert.ok(db.prepare("SELECT sent_at FROM account_mail WHERE user_id=? AND kind='reset'").get(user.id).sent_at);
 } finally {await new Promise(resolve=>smtp.close(resolve));}
});
