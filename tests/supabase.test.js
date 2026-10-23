import{test}from'node:test';import assert from'node:assert/strict';
import{readFileSync,existsSync}from'node:fs';import{spawnSync}from'node:child_process';
import{translate}from'../supabase/runtime/sql.js';import{createPageGateway}from'../deploy/page-gateway.mjs';
test('Supabase SQL keeps bound parameters, quoted literals and protected schema boundaries',()=>{
 assert.equal(translate("SELECT * FROM users WHERE email=? AND bio='FROM users? O''Neil'"),"SELECT * FROM lume.users WHERE email=$1 AND bio='FROM users? O''Neil'");
 assert.match(translate('INSERT OR IGNORE INTO inspired(user_id,photo_id) VALUES(?,?)'),/^INSERT INTO lume.inspired.*\$1,\$2.*ON CONFLICT DO NOTHING$/);
 assert.match(translate("SELECT mix(p.id,?) FROM photos p WHERE created_at>datetime('now','-7 days')"),/lume.mix.*FROM lume.photos.*lume.datetime/);
 assert.match(translate('INSERT INTO request_limits(key,bucket,hits) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET hits=hits+1 RETURNING hits'),/SET hits=request_limits.hits\+1/);
});
function response(){return{status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body||'';}};}
test('Vercel page gateway checks admin session before exposing its private HTML',async()=>{
 const original=globalThis.fetch;
 try {
  const gateway=createPageGateway({backendOrigin:'https://example.supabase.co/functions/v1/lume-api',adminHTML:'PRIVATE ADMIN HTML'});
  for(const user of [null,{role:'user'},{role:'admin'}]){
   globalThis.fetch=async()=>Response.json({user});
   const res=response();await gateway({url:'/admin',headers:{host:'frontend.example',cookie:'sid=test'}},res);
   assert.equal(res.status,user?.role==='admin'?200:302);
   assert.equal(res.body.includes('PRIVATE ADMIN HTML'),user?.role==='admin');
   assert.equal(res.headers['Cache-Control'],'private, no-store');
  }
 }finally{globalThis.fetch=original;}
});
test('Vercel shared-photo metadata never forwards an authenticated cookie to reveal private photos',async()=>{
 const original=globalThis.fetch;
 try {
  let options;
  globalThis.fetch=async(_url,opts)=>{options=opts;return new Response('',{status:404});};
  const gateway=createPageGateway({backendOrigin:'https://example.supabase.co/functions/v1/lume-api',adminHTML:''});const res=response();
  await gateway({url:'/foto/123',headers:{host:'frontend.example',cookie:'sid=private'}},res);
  assert.equal(options.headers?.Cookie,undefined);assert.equal(res.status,302);assert.equal(res.headers.Location,'/descobrir');
 }finally{globalThis.fetch=original;}
});
test('Supabase frontend build wires API, private admin gateway and public page shells',()=>{
 const built=spawnSync(process.execPath,['scripts/build-vercel.js'],{env:{...process.env,BACKEND_ORIGIN:'https://example.supabase.co/functions/v1/lume-api'},encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const config=JSON.parse(readFileSync('.vercel/output/config.json','utf8'));
 assert.ok(config.routes.some(route=>route.src==='/api/(.*)'&&route.dest==='https://example.supabase.co/functions/v1/lume-api/api/$1'));
 assert.ok(config.routes.some(route=>route.src.startsWith('/(admin|')&&route.dest==='/page-gateway'));
 assert.ok(config.routes.some(route=>route.src==='/@(.*)'&&route.dest==='/perfil.html'));
 assert.ok(existsSync('.vercel/output/functions/page-gateway.func/.vc-config.json'));
 assert.equal(existsSync('.vercel/output/static/admin.html'),false);
 assert.equal(existsSync('.vercel/output/static/server'),false);
});
