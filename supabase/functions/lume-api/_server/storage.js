import {createClient} from 'npm:@supabase/supabase-js@2';
const storage=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('lume-uploads');
export async function storeImage(name,buffer,contentType) {
 const {error}=await storage.upload(name,buffer,{contentType,upsert:false});
 if(error)throw error;
}
export async function removeImages(names) {
 if(!names.length)return;
 const {error}=await storage.remove(names);if(error)throw error;
}
export async function readImage(name) {
 const {data,error}=await storage.download(name);if(error)throw error;return data;
}
