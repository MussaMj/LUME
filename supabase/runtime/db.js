import {translate} from './sql.js';
import postgres from 'npm:postgres@3.4.7';
import { AsyncLocalStorage } from 'node:async_hooks';
const connection = Deno.env.get('LUME_DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL');
if (!connection) throw new Error('Database connection is not configured');
const sql = postgres(connection,{max:1,prepare:false,idle_timeout:20,connect_timeout:15,
  types:{bigint:{to:20,from:[20],serialize:String,parse:Number}}});
const transactions = new AsyncLocalStorage();
function query(statement,args) {return (transactions.getStore() || sql).unsafe(statement,args);}
export const db={
  prepare(source) {
    const statement=translate(source);
    return {
      async get(...args){return (await query(statement,args))[0];},
      async all(...args){return [...await query(statement,args)];},
      async run(...args){
        const insert=/^\s*INSERT/i.test(statement)&&! /\bRETURNING\b/i.test(statement);
        const hasId=insert&&!/INSERT\s+INTO\s+(?:lume\.)?(inspired|collection_items|follows|event_rsvps|challenge_entries|photo_views|weekly_featured|sessions|request_limits|account_tokens)\b/i.test(statement);
        const rows=await query(statement+(hasId?' RETURNING id':''),args);
        return {changes:rows.count,lastInsertRowid:rows[0]?.id};
      },
    };
  },
  async exec(statement){await query(translate(statement),[]);},
};
export async function tx(fn) {
  if(transactions.getStore())return await fn();
  // Preserve the SQLite backend's serialised critical sections across Edge workers
  // (moderation batches, RSVP capacity and one-use account tokens).
  return await sql.begin(async transaction=>{
    await transaction.unsafe('SELECT pg_advisory_xact_lock(1280658757)');
    return await transactions.run(transaction,fn);
  });
}

export const PHOTO_SELECT = `
  SELECT p.id, p.title, p.description, p.category, p.behind_note, p.mood, p.province, p.city, p.camera, p.lens, p.phone,
         p.src, p.thumb, p.width, p.height, p.status, p.reject_reason, p.created_at,
         p.credit_name, p.credit_url, p.source_url,
         u.username, u.display_name, u.email AS author_email, u.instagram, u.behance,
         (SELECT COUNT(*) FROM inspired i WHERE i.photo_id = p.id) AS inspired_count,
         (SELECT COUNT(*) FROM collection_items ci WHERE ci.photo_id = p.id) AS saved_count
  FROM photos p JOIN users u ON u.id = p.user_id
`;
