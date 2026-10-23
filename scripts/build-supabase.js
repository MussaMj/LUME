// Compile the existing Express business rules to async PostgreSQL/Storage operations.
// The local SQLite backend remains the source of truth for routing and permissions.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generatorModule from '@babel/generator';
import * as t from '@babel/types';
const traverse=traverseModule.default || traverseModule;
const generate=generatorModule.default || generatorModule;
const root='supabase/functions/lume-api/_server';
fs.mkdirSync(root+'/routes',{recursive:true});
const files=['auth.js','util.js','security.js','engagement.js','mail.js','account-mail.js','provinces.js',...fs.readdirSync('server/routes').map(name=>'routes/'+name)];
const modules=new Map();
for(const name of files){
 let source=fs.readFileSync('server/'+name,'utf8');
 if(name==='mail.js')source="import {frontendReady} from './config.js';\n"+source.replace('function getTransport() {','function getTransport() { if(!frontendReady())return null;').replaceAll('ORDER BY id LIMIT 10','ORDER BY id LIMIT 1').replace('ORDER BY n.id LIMIT 20','ORDER BY n.id LIMIT 1');
 if(name==='util.js')source=source.replace('console.error(err);',"console.error('[lume]', {code:err.code || err.name,message:'Internal request failure'});");
 if(name==='auth.js')source=source.replace("const isProd = process.env.NODE_ENV === 'production';",'const isProd = true;');
 if(name==='routes/photos.js') {
  source=source.replace("import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';", "import { storeImage, removeImages } from '../storage.js';");
  source=source.replace(/export const UPLOAD_DIR[^\n]+\nmkdirSync[^\n]+\n/,"export const UPLOAD_DIR='/tmp/lume';\n");
  source=source.replace('function saveImage(file)', 'async function saveImage(file)').replace('writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);', "await storeImage(name,file.buffer,`image/${ext==='jpg'?'jpeg':ext}`);");
  const a=source.indexOf('export function deletePhotoFiles(row)'),b=source.indexOf("router.patch('/:id/story'",a);
  source=source.slice(0,a)+`export async function deletePhotoFiles(row) { await removeImages([...new Set([row.src,row.thumb])].filter(url=>url?.startsWith('/media/')).map(url=>path.basename(url))); }\n\n`+source.slice(b);
 }
 const ast=parse(source,{sourceType:'module'});
 traverse(ast,{ImportDeclaration(p){
  const value=p.node.source.value;
  if(value==='express')p.node.source.value='npm:express@5.2.1';
  if(value==='multer')p.node.source.value='npm:multer@2.4.0';
  if(value==='image-size')p.node.source.value='npm:image-size@2.0.4';
  if(value==='nodemailer')p.node.source.value='npm:nodemailer@10.1.1';
 }});
 modules.set(name,ast);
}
const asyncNames=new Set(['tx','photosChanged','engagementChanged','storeImage','removeImages','saveImage','deletePhotoFiles']);
function sqlCall(node){
 if(!t.isCallExpression(node)||!t.isMemberExpression(node.callee))return false;
 const object=node.callee.object, method=node.callee.property.name;
 return (t.isIdentifier(object,{name:'db'})&&method==='exec') || (['get','all','run'].includes(method)&&t.isCallExpression(object)&&t.isMemberExpression(object.callee)&&t.isIdentifier(object.callee.object,{name:'db'})&&object.callee.property.name==='prepare');
}
let changed=true,round=0;
while(changed && round++<30){
 changed=false;
 for(const ast of modules.values())traverse(ast,{
  CallExpression:{exit(p){
   const callee=p.node.callee;
   if(sqlCall(p.node)||(t.isIdentifier(callee)&&asyncNames.has(callee.name))){
    if(p.parentPath.isAwaitExpression())return;
    if(p.parentPath.isUnaryExpression({operator:'void'})){
      p.parentPath.replaceWith(t.callExpression(t.memberExpression(t.identifier('EdgeRuntime'),t.identifier('waitUntil')),[p.node]));changed=true;p.skip();return;
    }
    if(p.parentPath.isCallExpression()&&t.isMemberExpression(p.parentPath.node.callee)&&p.parentPath.node.callee.property.name==='waitUntil')return;
    p.replaceWith(t.awaitExpression(p.node));changed=true;p.skip();return;
   }
   if(t.isMemberExpression(callee)&&['map','forEach'].includes(callee.property.name)){
    if(p.parentPath.isCallExpression() && t.isMemberExpression(p.parentPath.node.callee) && t.isIdentifier(p.parentPath.node.callee.object,{name:'Promise'}) && p.parentPath.node.callee.property.name==='all')return;
    const callback=p.node.arguments[0];
    if((t.isFunctionExpression(callback)||t.isArrowFunctionExpression(callback))&&callback.async){
      callee.property=t.identifier('map');
      p.replaceWith(t.awaitExpression(t.callExpression(t.memberExpression(t.identifier('Promise'),t.identifier('all')),[p.node])));changed=true;p.skip();
    }
   }
  }},
  AwaitExpression(p){const fn=p.getFunctionParent();if(fn&&!fn.node.async){fn.node.async=true;changed=true;}},
  Function:{exit(p){if(!p.node.async)return;const name=p.node.id?.name || (p.parentPath.isVariableDeclarator()?p.parentPath.node.id?.name:null);if(name&&!asyncNames.has(name)){asyncNames.add(name);changed=true;}}},
 });
}
if(changed)throw new Error('Async compilation did not converge');
for(const [name,ast]of modules){const code="import process from 'node:process';\nimport { Buffer } from 'node:buffer';\n"+generate(ast,{comments:false}).code;fs.writeFileSync(path.join(root,name),'// Generated by scripts/build-supabase.js; edit server/ sources instead.\n'+code+'\n');}
for(const name of ['db.js','config.js','storage.js','events.js','sql.js'])fs.copyFileSync('supabase/runtime/'+name,root+'/'+name);
console.log(`Supabase API: ${modules.size} módulos Express compilados para PostgreSQL/Storage.`);
