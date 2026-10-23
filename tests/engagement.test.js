import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
const temp=mkdtempSync(path.join(tmpdir(),'lume-engagement-'));
process.env.DB_PATH=path.join(temp,'db');
const {db}=await import('../server/db.js');
const {featuredPhoto,weekStart}=await import('../server/engagement.js');
let child,origin;
before(async()=>{
  db.prepare("INSERT INTO users(username,display_name,email,password_hash) VALUES('author','Author','author@test.invalid','unused')").run();
  db.prepare("INSERT INTO users(username,display_name,email,password_hash) VALUES('other','Other','other@test.invalid','unused')").run();
  for(let i=1;i<=5;i++) db.prepare(`INSERT INTO photos(user_id,title,province,city,src,thumb,width,height,status) VALUES(?,?,'sofala','Beira','/test.jpg','/test.jpg',1200,900,?)`).run(i===4?2:1,`Photo ${i}`,i===5?'pending':'approved');
  db.prepare("INSERT INTO collections(user_id,name) VALUES(1,'Private album')").run();
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));origin=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),UPLOAD_DIR:path.join(temp,'uploads'),SMTP_HOST:''},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/auth/me')).ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
});
after(async()=>{if(child?.exitCode===null){child.kill();await once(child,'exit');}db.close();rmSync(temp,{recursive:true,force:true});});
async function get(url){const r=await fetch(origin+url);assert.equal(r.status,200);return r.json();}

test('popular combines recent likes, saves and daily views, excluding old engagement and pending photos',async()=>{
  db.prepare("INSERT INTO inspired(user_id,photo_id,created_at) VALUES(1,1,datetime('now','-8 days'))").run();
  db.prepare('INSERT INTO inspired(user_id,photo_id) VALUES(1,2)').run();
  db.prepare('INSERT INTO collection_items(collection_id,photo_id) VALUES(1,2)').run();
  db.prepare("INSERT INTO photo_views(photo_id,viewer_key,viewed_day) VALUES(2,'viewer',date('now'))").run();
  db.prepare("INSERT INTO photo_views(photo_id,viewer_key,viewed_day) VALUES(3,'viewer',date('now'))").run();
  const popular=await get('/api/photos?sort=popular&limit=2');
  assert.deepEqual(popular.photos.map(p=>p.id),[2,3]);assert.equal(popular.hasMore,true);
  assert.equal(popular.photos[0].author.email,undefined);
  const next=await get('/api/photos?sort=popular&limit=2&page=1');
  assert.equal(next.photos.length,2);assert.equal(next.hasMore,false);
  assert.equal((await get('/api/photos?limit=-1')).photos.length,1);
});

test('automatic choice stays stable during a week, renews on Monday and replaces moderated winners',()=>{
  const now=new Date();
  db.exec('DELETE FROM weekly_featured; DELETE FROM featured;');
  assert.equal(featuredPhoto(now).row.id,2);
  db.prepare("INSERT INTO inspired(user_id,photo_id) VALUES(2,3)").run();
  for(let i=0;i<5;i++)db.prepare("INSERT INTO photo_views(photo_id,viewer_key,viewed_day) VALUES(3,?,date('now'))").run(`extra-${i}`);
  assert.equal(featuredPhoto(now).row.id,2);
  const next=new Date(weekStart(now)+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+7);
  assert.equal(featuredPhoto(next).row.id,3);
  db.prepare("UPDATE photos SET status='rejected' WHERE id=3").run();
  assert.notEqual(featuredPhoto(next).row.id,3);
  db.prepare("UPDATE photos SET status='approved' WHERE id=3").run();
});

test('manual choice has priority for seven days, with automatic fallback after expiry or rejection',()=>{
  db.exec('DELETE FROM featured;');
  db.prepare("INSERT INTO featured(photo_id,note,featured_by) VALUES(1,'Editorial',1)").run();
  assert.equal(featuredPhoto().row.id,1);assert.equal(featuredPhoto().source,'manual');
  db.prepare("UPDATE featured SET featured_at=datetime('now','-8 days')").run();
  assert.equal(featuredPhoto().source,'automatic');
  db.prepare("UPDATE featured SET featured_at=datetime('now')").run();
  db.prepare("UPDATE photos SET status='rejected' WHERE id=1").run();
  assert.equal(featuredPhoto().source,'automatic');
  db.prepare("UPDATE photos SET status='approved' WHERE id=1").run();
});

test('view cookie deduplicates repeat views and private photos cannot receive public views',async()=>{
  const post=(id,cookie)=>fetch(origin+`/api/photos/${id}/view`,{method:'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})}});
  const before=db.prepare('SELECT COUNT(*) AS n FROM photo_views WHERE photo_id=4').get().n;
  const first=await post(4);assert.equal(first.status,200);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal((await post(4,cookie)).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photo_views WHERE photo_id=4').get().n,before+1);
  assert.equal((await post(5,cookie)).status,404);
});

test('related photos and map previews contain only approved public photos and the latest image',async()=>{
  const related=await get('/api/photos/2/related');assert.equal(related.label,'Do mesmo fotógrafo');
  assert.deepEqual(related.photos.map(p=>p.id),[3,1]);
  assert.equal((await fetch(origin+'/api/photos/5/related')).status,404);
  const map=await get('/api/photos/map-preview');assert.equal(map.provinces.sofala.total,4);assert.equal(map.provinces.sofala.photo.id,4);
  assert.equal(map.provinces.sofala.photo.author.email,undefined);
  const filtered=await get('/api/photos?author=other&sort=recent');assert.deepEqual(filtered.photos.map(p=>p.id),[4]);
});

test('social updates stream only aggregate public counts through SSE',async()=>{
  const {createSession}=await import('../server/auth.js');
  let cookie;
  createSession({cookie:(name,value)=>{cookie=`${name}=${value}`;}},1);
  const controller=new AbortController();
  const response=await fetch(origin+'/api/events',{signal:controller.signal});
  const reader=response.body.getReader();
  try {
    const posted=await fetch(origin+'/api/photos/4/inspired',{method:'POST',headers:{Origin:origin,Cookie:cookie}});
    assert.equal(posted.status,200);
    let buffer='';
    const timeout=setTimeout(()=>controller.abort(),3000);
    try {
      while(!buffer.includes('event: engagement')) {
        const {value,done}=await reader.read();if(done)break;
        buffer+=new TextDecoder().decode(value);
      }
    } finally {clearTimeout(timeout);}
    const dataLine=buffer.split('\n').find(line=>line.startsWith('data: {'));
    assert.deepEqual(JSON.parse(dataLine.slice(6)),{photoId:4,inspiredCount:1,savedCount:0});
  } finally { await reader.cancel().catch(()=>{}); controller.abort(); }
});
