const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function createPageGateway({backendOrigin,adminHTML}) {
 return async(req,res)=>{
  const url=new URL(req.url,'https://'+(req.headers.host || 'localhost'));
  const send=(status,headers,body='')=>{res.writeHead(status,{'Cache-Control':'private, no-store',...headers});res.end(body);};
  try {
   if(/^\/(admin|admin\.html|bastidores|bastidores\.html)\/?$/.test(url.pathname)) {
    const response=await fetch(backendOrigin+'/api/auth/me',{headers:{Cookie:req.headers.cookie || ''},signal:AbortSignal.timeout(15000)});
    if(!response.ok)return send(503,{'Content-Type':'text/plain; charset=utf-8'},'Não foi possível verificar a sessão. Tenta novamente.');
    const {user}=await response.json();
    if(!user)return send(302,{Location:'/entrar?next='+encodeURIComponent(url.pathname+url.search)+'&notice=admin-login'});
    if(user.role!=='admin')return send(302,{Location:'/?error=access-denied'});
    return send(200,{'Content-Type':'text/html; charset=utf-8'},adminHTML);
   }
   const id=url.pathname.match(/^\/foto\/(\d+)\/?$/)?.[1];
   if(id){
    const response=await fetch(backendOrigin+'/api/photos/'+id,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)return send(302,{Location:'/descobrir'});
    const {photo}=await response.json();const target='/descobrir?foto='+Number(photo.id);
    const image=new URL(photo.src,url.origin).href;
    return send(200,{'Content-Type':'text/html; charset=utf-8'},`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escape(photo.title)} — LUME</title><meta property="og:title" content="${escape(photo.title)}"><meta property="og:description" content="${escape(photo.author.displayName)} · ${escape(photo.city)}"><meta property="og:image" content="${escape(image)}"><meta property="og:url" content="${escape(url.href)}"><meta property="og:type" content="article"><meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0; url=${target}"></head><body><a href="${target}">Abrir fotografia</a></body></html>`);
   }
   return send(404,{'Content-Type':'text/plain'},'Não encontrado.');
  }catch{return send(503,{'Content-Type':'text/plain; charset=utf-8'},'O serviço está temporariamente indisponível. Tenta novamente.');}
 };
}
