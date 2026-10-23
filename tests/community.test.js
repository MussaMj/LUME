import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';

const temp = mkdtempSync(path.join(tmpdir(),'lume-community-'));
process.env.DB_PATH = path.join(temp,'db');
const { db } = await import('../server/db.js');
const { hashPassword, ADMIN_EMAIL } = await import('../server/auth.js');
let child, origin, admin, owner, other;
async function request(url,{cookie,method='GET',body}={}) {
  const response = await fetch(origin+url,{ method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined });
  return { status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0] };
}
before(async () => {
  for (const [username,email] of [['curator',ADMIN_EMAIL],['owner','owner@example.test'],['other','other@example.test']]) {
    db.prepare('INSERT INTO users(username,display_name,email,password_hash) VALUES (?,?,?,?)').run(username,username,email,hashPassword('test-password-123'));
  }
  for(let i=1;i<=8;i++) db.prepare("INSERT INTO photos(user_id,title,province,city,src,thumb,width,height,status,category,mood) VALUES(2,?,'maputo-cidade','Maputo',?, ?,1200,900,?, 'Paisagem','Noite')")
    .run('Photo '+i,`/media/${i}.jpg`,`/media/${i}.jpg`,i===8?'pending':'approved');
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));origin=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),UPLOAD_DIR:path.join(temp,'uploads'),SMTP_HOST:''},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/auth/me')).ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
  admin=(await request('/api/auth/login',{method:'POST',body:{login:'curator',password:'test-password-123'}})).cookie;
  owner=(await request('/api/auth/login',{method:'POST',body:{login:'owner',password:'test-password-123'}})).cookie;
  other=(await request('/api/auth/login',{method:'POST',body:{login:'other',password:'test-password-123'}})).cookie;
});
after(async()=>{if(child?.exitCode===null){child.kill();await once(child,'exit');}db.close();rmSync(temp,{recursive:true,force:true});});

test('photo stories require approved owned photos and editorial publication',async()=>{
  const body={kind:'story',title:'Our Maputo',intro:'A sequence of local photographs.',payload:{frames:[1,2,3,4,5].map(photoId=>({photoId,caption:'A moment'}))}};
  assert.equal((await request('/api/community/items',{method:'POST',body})).status,401);
  assert.equal((await request('/api/community/items',{cookie:other,method:'POST',body})).status,400);
  assert.equal((await request('/api/community/items',{cookie:owner,method:'POST',body:{...body,payload:{frames:[1,2,3,4,8].map(photoId=>({photoId}))}}})).status,400);
  const created=await request('/api/community/items',{cookie:owner,method:'POST',body});assert.equal(created.status,201);const id=created.data.item.id;
  assert.equal(created.data.item.status,'pending');assert.equal((await request(`/api/community/items/${id}`)).status,404);
  assert.equal((await request(`/api/community/items/${id}`,{cookie:other,method:'PATCH',body:{status:'published'}})).status,403);
  assert.equal((await request(`/api/community/items/${id}`,{cookie:admin,method:'PATCH',body:{status:'published'}})).status,200);
  const published=await request(`/api/community/items/${id}`);assert.equal(published.data.item.photos.length,5);
  db.prepare("UPDATE photos SET status='rejected' WHERE id=5").run();assert.equal((await request(`/api/community/items/${id}`)).data.item.photos.length,4);
  assert.equal((await request(`/api/community/items/${id}`,{cookie:admin,method:'PATCH',body:{status:'archived'}})).status,200);
  db.prepare("UPDATE photos SET status='approved' WHERE id=5").run();
});

test('public exhibitions require owner opt-in and never expose pending photos',async()=>{
  const created=await request('/api/collections',{cookie:owner,method:'POST',body:{name:'Our Coast'}});const id=created.data.collection.id;
  await request(`/api/collections/${id}/photos`,{cookie:owner,method:'POST',body:{photoId:1}});
  db.prepare('INSERT INTO collection_items(collection_id,photo_id) VALUES (?,8)').run(id);
  assert.equal((await request(`/api/community/exhibitions/${id}`)).status,404);
  assert.equal((await request(`/api/collections/${id}`,{cookie:other,method:'PATCH',body:{isPublic:true}})).status,404);
  await request(`/api/collections/${id}`,{cookie:owner,method:'PATCH',body:{isPublic:true}});
  assert.equal((await request(`/api/community/exhibitions/${id}`)).data.photos.length,1);
  await request(`/api/collections/${id}`,{cookie:owner,method:'PATCH',body:{isPublic:false}});
  assert.equal((await request(`/api/community/exhibitions/${id}`)).status,404);
});

test('following, optional email consent and author-only notes',async()=>{
  assert.equal((await request('/api/users/owner/follow',{cookie:owner,method:'POST',body:{}})).status,400);
  await request('/api/users/owner/follow',{cookie:other,method:'POST',body:{}});
  assert.equal(db.prepare('SELECT notify_email FROM follows').get().notify_email,0);
  assert.equal((await request('/api/photos?following=1')).status,401);
  assert.equal((await request('/api/photos?following=1',{cookie:other})).data.photos.length,7);
  await request('/api/admin/photos/8/approve',{cookie:admin,method:'POST',body:{}});
  const notifications=(await request('/api/community/notifications',{cookie:other})).data.notifications;
  assert.equal(notifications.length,1);assert.equal(notifications[0].photo_id,8);
  assert.equal(db.prepare('SELECT email_requested FROM follower_notifications').get().email_requested,0);
  assert.equal((await request('/api/community/notifications',{cookie:owner})).data.notifications.length,0);
  await request('/api/community/notifications/read',{cookie:other,method:'POST',body:{}});
  assert.ok((await request('/api/community/notifications',{cookie:other})).data.notifications[0].read_at);
  assert.equal((await request('/api/photos/1/story',{cookie:other,method:'PATCH',body:{behindNote:'Fake'}})).status,404);
  await request('/api/photos/1/story',{cookie:owner,method:'PATCH',body:{behindNote:'Waiting for the evening light.'}});
  assert.equal((await request('/api/photos/1')).data.photo.behindNote,'Waiting for the evening light.');
});

test('retired challenges cannot be created or exposed',async()=>{
  assert.equal((await request('/api/community/items',{cookie:admin,method:'POST',body:{kind:'challenge',title:'Old challenge',payload:{}}})).status,400);
  const {lastInsertRowid}=db.prepare("INSERT INTO community_items(kind,user_id,title,status) VALUES('challenge',1,'Legacy','archived')").run();
  assert.equal((await request(`/api/community/items/${lastInsertRowid}`)).status,404);
  assert.ok((await request('/api/community/items?manage=1',{cookie:admin})).data.items.every(item=>item.kind!=='challenge'));
});

test('photo-walk RSVP capacity, cancellation and combined discovery filters',async()=>{
  const body={kind:'event',title:'Photo walk',intro:'Meet for photographs',payload:{date:'2099-01-01T08:00:00+02:00',location:'Confirmed meeting point',capacity:1}};
  const id=(await request('/api/community/items',{cookie:admin,method:'POST',body})).data.item.id;
  assert.equal((await request(`/api/community/items/${id}/participate`,{cookie:owner,method:'POST',body:{}})).status,200);
  assert.equal((await request(`/api/community/items/${id}/participate`,{cookie:owner,method:'POST',body:{}})).status,200);
  assert.equal((await request(`/api/community/items/${id}/participate`,{cookie:other,method:'POST',body:{}})).status,409);
  await request(`/api/community/items/${id}/participate`,{cookie:owner,method:'DELETE',body:{}});
  assert.equal((await request(`/api/community/items/${id}/participate`,{cookie:other,method:'POST',body:{}})).status,200);
  assert.equal((await request('/api/photos?province=maputo-cidade&category=Paisagem&mood=Noite')).data.photos.length,8);
  assert.equal((await request('/api/photos?category=Retrato&mood=Noite')).data.photos.length,0);
});


test('disabling email or unfollowing cancels pending follower deliveries', async () => {
  await request('/api/users/owner/follow',{cookie:other,method:'POST',body:{notifyEmail:true}});
  db.prepare('INSERT INTO follower_notifications(photo_id,user_id,email_requested) VALUES (7,3,1)').run();
  await request('/api/users/owner/follow',{cookie:other,method:'POST',body:{notifyEmail:false}});
  assert.equal(db.prepare('SELECT email_requested FROM follower_notifications WHERE photo_id=7').get().email_requested,0);
  await request('/api/users/owner/follow',{cookie:other,method:'POST',body:{notifyEmail:true}});
  db.prepare('INSERT INTO follower_notifications(photo_id,user_id,email_requested) VALUES (6,3,1)').run();
  await request('/api/users/owner/follow',{cookie:other,method:'DELETE'});
  assert.equal(db.prepare('SELECT email_requested FROM follower_notifications WHERE photo_id=6').get().email_requested,0);
});
