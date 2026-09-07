export class RequestError extends Error {
  constructor(public status: number, message: string, public retryAfter = 0) { super(message); }
}
export function snowflake(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{16,22}$/.test(value)) throw new RequestError(400, 'Identifiant Discord invalide.');
  return value;
}
export function mediaURL(value: unknown) {
  if (typeof value !== 'string') throw new RequestError(400, 'Média invalide.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.port || url.username || url.password || !url.pathname.startsWith('/attachments/')) throw new RequestError(400, 'Adresse de média non autorisée.');
  return url.href;
}
export async function discord<T = unknown>(token: string, path: string): Promise<T> {
  const res = await fetch('https://discord.com/api/v10' + path, {headers: {Authorization: token, Accept: 'application/json'}, cache:'no-store', redirect:'error', signal: AbortSignal.timeout(25000)});
  if (!res.ok) {
    if (res.status === 429) {
      const data = await res.json().catch(() => ({})) as {retry_after?: number};
      throw new RequestError(429, 'Discord demande une pause. La reprise sera automatique.', Math.min(3600, Math.max(1, Number(data.retry_after) || 5)));
    }
    throw new RequestError(res.status, res.status === 401 ? 'Jeton refusé ou expiré. Reconnecte ton compte.' : res.status === 403 ? 'Discord refuse cet accès. Vérifie tes droits sur ce salon.' : res.status === 404 ? 'Salon, message ou média introuvable.' : 'Discord est indisponible. Réessaie dans un instant.');
  }
  return res.json() as Promise<T>;
}
export function isMedia(a: {content_type?: string; filename?: string}) {
  return /^(image|video|audio)\//.test(a.content_type || '') || /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?|mp4|mov|webm|mkv|avi|m4v|mp3|wav|ogg|m4a|flac|aac)$/i.test(a.filename || '');
}
export function cleanName(s: string) { return s.replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g,'_').slice(0,180) || 'media'; }

export type Attachment = { id: string; filename: string; content_type?: string; size: number; url: string };
export type Message = { id: string; timestamp: string; attachments?: Attachment[] };
export type Channel = { id: string; name: string; type: number; position?: number };
