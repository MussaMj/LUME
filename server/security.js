import crypto from 'node:crypto';
import { db } from './db.js';
import { production } from './config.js';
export function persistentLimit({scope,max,windowMs,key=req=>req.ip}) {
  return (req,res,next)=>{
    const bucket=Math.floor(Date.now()/windowMs), reset=(bucket+1)*windowMs;
    const digest=crypto.createHash('sha256').update(`${scope}:${key(req)}`).digest('hex');
    db.prepare('DELETE FROM request_limits WHERE expires_at < ?').run(Date.now());
    const row=db.prepare(`INSERT INTO request_limits(key,bucket,hits,expires_at) VALUES(?,?,1,?)
      ON CONFLICT(key,bucket) DO UPDATE SET hits=hits+1 RETURNING hits`).get(digest,bucket,reset);
    if(row.hits>max) {res.set('Retry-After',String(Math.max(1,Math.ceil((reset-Date.now())/1000))));return res.status(429).json({error:'Demasiados pedidos. Aguarda um pouco e tenta novamente.'});}
    next();
  };
}
export function securityHeaders(_req,res,next) {
  res.set({
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com https://plus.unsplash.com; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    ...(production?{'Strict-Transport-Security':'max-age=31536000'}:{}),
  });next();
}

export function requestLogging(req,res,next) {
  const id=crypto.randomUUID(), started=performance.now();
  res.set('X-Request-Id',id);
  res.on('finish',()=>{
    if(production && (req.path.startsWith('/api/') || res.statusCode>=400))console.log(JSON.stringify({type:'http',requestId:id,method:req.method,path:req.path,status:res.statusCode,durationMs:Math.round(performance.now()-started)}));
  });next();
}
