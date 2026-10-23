import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
function configurationError(message) {
  console.error(`[Lume] ${message}\nConfigura BACKEND_ORIGIN nas variáveis de ambiente do projecto Vercel e faz um novo deploy.\nUsa o URL HTTPS real do servidor Express, não localhost, um IP da rede local ou o próprio frontend. Consulta DEPLOYMENT.md.`);
  process.exit(1);
}
const backendValue=process.env.BACKEND_ORIGIN?.trim();
if(!backendValue)configurationError('Falta a variável BACKEND_ORIGIN. O frontend precisa de um backend persistente para contas, uploads e SQLite.');
let backend;
try { backend=new URL(backendValue); }
catch { configurationError('BACKEND_ORIGIN não contém um URL válido.'); }
if(backend.protocol!=='https:' || backend.username || backend.password || backend.pathname!=='/' || backend.search || backend.hash)configurationError('BACKEND_ORIGIN deve ser uma origem HTTPS sem credenciais, caminho, query ou fragmento.');
if(['localhost','127.0.0.1','::1','[::1]'].includes(backend.hostname) || backend.hostname.endsWith('.localhost'))configurationError('BACKEND_ORIGIN aponta para um servidor local, inacessível à Vercel.');
if([process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).includes(backend.host))configurationError('BACKEND_ORIGIN aponta para este frontend e provocaria um ciclo de pedidos.');
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
