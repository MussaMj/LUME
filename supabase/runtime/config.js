import process from 'node:process';
export const production=true;
export const verifyEmails=true;
export function validateConfig() {}
export const allowedOrigins=()=>new Set([process.env.APP_URL,...(process.env.ALLOWED_ORIGINS || '').split(',')].map(value=>value?.trim()).filter(Boolean).map(value=>new URL(value).origin));

export function frontendReady() {
 try {const url=new URL(process.env.APP_URL);return url.protocol==='https:' && !url.hostname.endsWith('.supabase.co') && url.pathname==='/' && !url.username && !url.password && !url.search && !url.hash;}catch{return false;}
}
