import type { Message, Channel } from '@/lib/discord';
import { env } from 'cloudflare:workers';
import { discord, snowflake, mediaURL, isMedia, cleanName, RequestError } from '@/lib/discord';

export const dynamic = 'force-dynamic';
const secureHeaders = {'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'};
const json = (data: unknown, status = 200) => Response.json(data, {status, headers:secureHeaders});
// The Sites dispatcher supplies authenticated identity and enforces owner-only access.
// Do not expose this application behind a proxy that trusts client-supplied identity headers.
export async function POST(req: Request) {
  try {
    const owner = req.headers.get('oai-authenticated-user-id');
    if (!owner) throw new RequestError(401, 'Ouvre le site privé avec ton compte ChatGPT.');
    const origin = req.headers.get('origin');
    if (req.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(req.url).origin)) throw new RequestError(403,'Origine refusée.');
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new RequestError(415,'Requête invalide.');
    const raw = await req.text();
    if (raw.length > 8192) throw new RequestError(413,'Requête trop volumineuse.');
    const b = JSON.parse(raw);
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));
    const prefix = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('') + '/';
    // R2 is private. Owner prefix is derived on the server, never supplied by the client.
    const bucket = env.BUCKET;
    if (b.action === 'library') {
      if (!bucket) throw new RequestError(503,'Le stockage est indisponible.');
      const page = await bucket.list({prefix, limit:100, cursor: typeof b.cursor === 'string' ? b.cursor : undefined, include:['customMetadata']});
      return json({items:page.objects.map((o: any)=>({key:o.key.slice(prefix.length),size:o.size,name:o.customMetadata?.name || o.key.split('/').pop(),savedAt:o.uploaded})), cursor:page.truncated ? page.cursor : null});
    }
    if (b.action === 'stored') {
      if (!bucket || typeof b.key !== 'string' || !/^\d{16,22}\/\d{16,22}\/\d{16,22}$/.test(b.key)) throw new RequestError(400,'Archive invalide.');
      const object = await bucket.get(prefix + b.key);
      if (!object) throw new RequestError(404,'Fichier introuvable.');
      return new Response(object.body,{headers:{...secureHeaders,'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':"attachment; filename*=UTF-8''" + encodeURIComponent(cleanName(object.customMetadata?.name || 'media'))}});
    }
    const token = req.headers.get('x-discord-token')?.trim();
    if (!token || token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) throw new RequestError(401,'Renseigne un jeton valide.');
    if (b.action === 'me') { const u = await discord<{id:string;global_name?:string;username:string}>(token,'/users/@me'); return json({id:u.id,name:u.global_name || u.username}); }
    if (b.action === 'guilds') {
      const after = b.after ? '&after=' + snowflake(b.after) : '';
      const g = await discord<{id:string;name:string}[]>(token,'/users/@me/guilds?limit=200'+after);
      return json({items:g.map((x:any)=>({id:x.id,name:x.name})),after:g.length===200?g[g.length-1].id:null});
    }
    if (b.action === 'channels') {
      const g = snowflake(b.guild);
      const channels = await discord<Channel[]>(token,`/guilds/${g}/channels`);
      // Listing may include inaccessible channels; actual history fetch always checks Discord permissions.
      return json(channels.filter((c:any)=>[0,5,10,11,12].includes(c.type)).sort((a:any,b:any)=>(a.position||0)-(b.position||0)).map((c:any)=>({id:c.id,name:c.name})));
    }
    if (b.action === 'messages') {
      const c = snowflake(b.channel);
      const before = b.before ? '&before=' + snowflake(b.before) : '';
      const messages = await discord<Message[]>(token,`/channels/${c}/messages?limit=100${before}`);
      return json({count:messages.length,before:messages.length ? messages[messages.length-1].id : null,done:messages.length < 100,items:messages.flatMap((m:any)=>(m.attachments || []).filter(isMedia).map((a:any)=>({id:a.id,message:m.id,channel:c,name:cleanName(a.filename || 'media'),size:a.size,type:a.content_type || '',date:m.timestamp})))});
    }
    if (b.action === 'file' || b.action === 'save') {
      const channel = snowflake(b.channel), message = snowflake(b.message), id = snowflake(b.id);
      const m = await discord<Message>(token,`/channels/${channel}/messages/${message}`);
      const a = m.attachments?.find((x:any)=>x.id===id && isMedia(x));
      if (!a) throw new RequestError(404,'Ce média est absent ou a été supprimé.');
      const key = `${prefix}${channel}/${message}/${id}`;
      if (b.action === 'save') {
        if (!bucket) throw new RequestError(503,'Le stockage est indisponible.');
        if (await bucket.head(key)) return json({saved:true,existing:true});
      }
      const source = await fetch(mediaURL(a.url),{redirect:'error',signal:AbortSignal.timeout(60000)});
      if (!source.ok || !source.body) throw new RequestError(502,'Le média est momentanément indisponible.');
      if (b.action === 'save') {
        await bucket.put(key,source.body,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{name:cleanName(a.filename || 'media')}});
        return json({saved:true,existing:false});
      }
      return new Response(source.body,{headers:{...secureHeaders,'Content-Type':'application/octet-stream',...(source.headers.has('content-length') ? {'Content-Length':source.headers.get('content-length')!}:{}),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(cleanName(a.filename || 'media'))}});
    }
    throw new RequestError(400,'Action inconnue.');
  } catch(e) {
    if(e instanceof RequestError) return json({error:e.message,retryAfter:e.retryAfter},e.status);
    // Never log request headers, body, tokens, upstream replies or exception strings.
    return json({error:'La requête a échoué. Vérifie ta connexion puis réessaie.'},502);
  }
}
