import path from 'node:path';
export const production = process.env.NODE_ENV === 'production';
export const verifyEmails = process.env.REQUIRE_EMAIL_VERIFICATION === 'true' || (production && process.env.REQUIRE_EMAIL_VERIFICATION !== 'false');
export function validateConfig() {
  if (process.env.VERCEL) throw new Error('Este backend SQLite requer um servidor persistente. Publica apenas o frontend na Vercel; consulta DEPLOYMENT.md.');
  if (!production) return;
  if (!verifyEmails) throw new Error('A confirmação de e-mail é obrigatória em produção.');
  const url = new URL(process.env.APP_URL || 'invalid');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('APP_URL deve ser a origem HTTPS pública do site.');
  for(const origin of allowedOrigins())if(new URL(origin).protocol!=='https:')throw new Error('As origens adicionais devem usar HTTPS.');
  for (const key of ['DB_PATH','UPLOAD_DIR','BACKUP_DIR']) if (!process.env[key] || !path.isAbsolute(process.env[key])) throw new Error(`${key} deve apontar para o volume persistente.`);
  for (const key of ['SMTP_HOST','MAIL_FROM']) if (!process.env[key]) throw new Error(`${key} é obrigatório em produção.`);
  const invited=(process.env.BETA_EMAILS || '').split(',').map(value=>value.trim()).filter(Boolean);
  if (!invited.length || !invited.every(email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Define BETA_EMAILS para limitar os registos aos convidados desta fase de testes.');
}
export const allowedOrigins = () => new Set([process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS || '').split(',')].filter(Boolean).map(value=>new URL(value).origin));
