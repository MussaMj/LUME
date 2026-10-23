import {frontendReady} from './_server/config.js';
import {timingSafeEqual} from 'node:crypto';
import {flushMailQueue} from './_server/mail.js';
import {Buffer} from 'node:buffer';
import express from 'npm:express@5.2.1';
import process from 'node:process';
import {db} from './_server/db.js';
import {loadUser,sameOrigin} from './_server/auth.js';
import {securityHeaders,persistentLimit,requestLogging} from './_server/security.js';
import {errorHandler} from './_server/util.js';
import {readImage} from './_server/storage.js';
import authRoutes from './_server/routes/auth.js';
import photoRoutes from './_server/routes/photos.js';
import collectionRoutes from './_server/routes/collections.js';
import communityRoutes from './_server/routes/community.js';
import adminRoutes from './_server/routes/admin.js';
import {users,me} from './_server/routes/users.js';
async function reportError(err,req,res,next){
 try{await db.prepare('INSERT INTO lume.runtime_errors(path,message,code) VALUES(?,?,?)').run(req.path,String(err.message).slice(0,1000),String(err.code || err.name));}catch{}
 errorHandler(err,req,res,next);
}
const app=express();
app.disable('x-powered-by');app.set('trust proxy',1);
app.use((req,res,next)=>{req.url=req.url.replace(/^\/lume-api(?=\/|$)/,'') || '/';next();});
app.use(securityHeaders);app.use('/media',(_req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Origin');next();});app.use(requestLogging);app.use(express.json({limit:'100kb'}));app.use(loadUser);
app.get('/api/health',async(_req,res)=>{await db.prepare('SELECT 1 AS ok').get();res.set('Cache-Control','no-store').json({status:'ok',backend:'supabase',emailConfigured:!!(process.env.SMTP_HOST&&process.env.MAIL_FROM),frontendConfigured:frontendReady()});});
app.post('/api/_jobs/mail',(req,res)=>{
 const expected=process.env.LUME_JOB_TOKEN || '',provided=String(req.headers['x-lume-job-token'] || '');
 if(!expected || provided.length!==expected.length || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(403).json({error:'Acesso Negado'});
 EdgeRuntime.waitUntil(flushMailQueue());res.set('Cache-Control','no-store').json({accepted:true});
});
const api=express.Router();api.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});api.use(sameOrigin);
api.use(persistentLimit({scope:'api',windowMs:60000,max:300}));
api.use('/auth',(req,res,next)=>{
 if(req.method==='POST' && ['/register','/request-reset','/request-verification'].includes(req.path) && !frontendReady())return res.status(503).json({error:'Falta configurar o URL do site e o envio de e-mails antes de abrir os registos.'});
 next();
});
api.get('/events',async(req,res)=>{
 res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no'});res.flushHeaders();
 let cursor=Number(req.headers['last-event-id']) || (await db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM realtime_events').get()).id;
 res.write(`retry: 1500\nevent: ready\nid: ${cursor}\ndata: {}\n\n`);
 let closed=false;req.on('close',()=>{closed=true;});
 for(let i=0;i<12&&!closed;i++) {
  await new Promise(resolve=>setTimeout(resolve,3000));if(closed)break;
  const events=await db.prepare('SELECT id,kind,payload FROM realtime_events WHERE id>? ORDER BY id LIMIT 100').all(cursor);
  for(const event of events){res.write(`id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event.payload)}\n\n`);cursor=event.id;}
  if(!events.length)res.write(': keepalive\n\n');
 }
 if(!closed)res.end();
});
api.get('/provinces',async(_req,res)=>{const {PROVINCES}=await import('./_server/provinces.js');res.json({provinces:PROVINCES});});
api.use('/auth',authRoutes);api.use('/photos',photoRoutes);api.use('/collections',collectionRoutes);api.use('/community',communityRoutes);api.use('/admin',adminRoutes);api.use('/users',users);api.use('/me',me);
api.use((_req,res)=>res.status(404).json({error:'Não encontrado.'}));api.use(reportError);app.use('/api',api);
app.get('/media/:name',async(req,res)=>{
 const url='/media/'+req.params.name;
 const photo=await db.prepare('SELECT user_id,status FROM photos WHERE src=? OR thumb=? LIMIT 1').get(url,url);
 if(!photo || !(photo.status==='approved'||req.user?.id===photo.user_id||req.user?.role==='admin'))return res.status(404).end();
 const file=await readImage(req.params.name);res.set({'Cache-Control':'private, no-store','Content-Type':file.type||'application/octet-stream'}).send(Buffer.from(await file.arrayBuffer()));
});
app.use(reportError);
app.listen(3000);
