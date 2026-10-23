import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const backend=new URL(process.env.BACKEND_ORIGIN || 'invalid');
if(backend.protocol!=='https:' || backend.username || backend.password || backend.pathname!=='/' || backend.search || backend.hash)throw new Error('BACKEND_ORIGIN deve ser a origem HTTPS do backend persistente, sem caminho.');
const origin=backend.origin;
const output=path.resolve('.vercel/output');
rmSync(output,{recursive:true,force:true});mkdirSync(path.join(output,'static'),{recursive:true});
cpSync('public',path.join(output,'static'),{recursive:true,filter:source=>!path.basename(source).startsWith('.')});
const headers={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com https://plus.unsplash.com; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
};
writeFileSync(path.join(output,'config.json'),JSON.stringify({version:3,routes:[
 {src:'/(.*)',headers,continue:true},
 {src:'/api/(.*)',dest:origin+'/api/$1'},
 {src:'/media/(.*)',dest:origin+'/media/$1'},
 {src:'/(admin|admin.html|bastidores|bastidores.html)',dest:origin+'/$1'},
 {src:'/@(.*)',dest:origin+'/@$1'},
 {src:'/(foto|historia|exposicao)/(.*)',dest:origin+'/$1/$2'},
 {handle:'filesystem'},
 {src:'/(entrar|enviar|descobrir|colecoes|comunidade)',dest:'/$1.html'},
 {src:'/(.*)',dest:'/404.html',status:404},
]},null,2));
console.log('Frontend preparado em .vercel/output; API e páginas dinâmicas encaminhadas para o backend.');
