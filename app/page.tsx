'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,CloudDownload,FolderArchive,Hash,Image as ImageIcon,LoaderCircle,LockKeyhole,LogOut,Pause,ShieldCheck} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Progress} from '@/components/ui/progress';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {zip} from '@/lib/zip';
type Choice={id:string,name:string};
type Media={id:string,message:string,channel:string,name:string,size:number,type:string,date:string};
type Saved={key:string,name:string,size:number,savedAt:string};
const KEY='fleury.discord.session';
const size=(n:number)=> n>=1e9?(n/1e9).toFixed(2)+' Go':n>=1e6?(n/1e6).toFixed(1)+' Mo':Math.round(n/1e3)+' ko';
const stopError=()=>new DOMException('Transfert en pause','AbortError');

export default function Home(){
 const token=useRef(''),stop=useRef(false),controller=useRef<AbortController|null>(null),scanCursor=useRef<string|null>(null),mediaRef=useRef<Media[]>([]),saveIndex=useRef(0),zipIndex=useRef(0),zipPart=useRef(0),downloadURL=useRef('');
 const [input,setInput]=useState(''),[user,setUser]=useState<Choice|null>(null),[guilds,setGuilds]=useState<Choice[]>([]),[channels,setChannels]=useState<Choice[]>([]),[guild,setGuild]=useState(''),[channel,setChannel]=useState(''),[manual,setManual]=useState(''),[items,setItems]=useState<Media[]>([]),[count,setCount]=useState(0),[scanned,setScanned]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[savedCount,setSavedCount]=useState(0),[ready,setReady]=useState<{url:string,name:string}|null>(null),[zipCount,setZipCount]=useState(0),[saved,setSaved]=useState<Saved[]>([]),[libraryCursor,setLibraryCursor]=useState<string|null>(null),[libraryLoaded,setLibraryLoaded]=useState(false),[visible,setVisible]=useState(30);
 const active=!!busy;
 useEffect(()=>{try{token.current=sessionStorage.getItem(KEY)||'';if(token.current)setMessage('Une session est mémorisée dans cet onglet. Clique sur « Reprendre la session ».');}catch{}return()=>{controller.current?.abort();if(downloadURL.current)URL.revokeObjectURL(downloadURL.current);};},[]);
 async function wait(ms:number){const end=Date.now()+ms;while(Date.now()<end){if(stop.current)throw stopError();await new Promise(r=>setTimeout(r,Math.min(250,end-Date.now())));}}
 async function request(body:Record<string,unknown>,binary=false):Promise<any>{
  for(let attempt=0;attempt<6;attempt++){
   if(stop.current)throw stopError();
   const ac=new AbortController();controller.current=ac;
   const r=await fetch('/api/discord',{method:'POST',headers:{'Content-Type':'application/json',...(token.current&&!['library','stored'].includes(String(body.action))?{'x-discord-token':token.current}:{})},body:JSON.stringify(body),cache:'no-store',signal:ac.signal});
   if(r.ok)return binary?r.blob():r.json();
   const data=await r.json().catch(()=>({error:'Le serveur est indisponible.'})) as {error?:string;retryAfter?:number};
   if(r.status===429 && attempt<5){setMessage(`Pause demandée par Discord (${Math.ceil(data.retryAfter||5)} s)…`);await wait((data.retryAfter||5)*1000+250);continue;}
   if(r.status===401 && !['library','stored'].includes(String(body.action))){token.current='';try{sessionStorage.removeItem(KEY);}catch{}setUser(null);}
   throw new Error(data.error||'La requête a échoué.');
  }
 }
 async function task(label:string,fn:()=>Promise<void>){if(busy)return;setBusy(label);setError('');stop.current=false;try{await fn();}catch(e){if(e instanceof DOMException && e.name==='AbortError')setMessage('En pause. Tu peux reprendre depuis cette page.');else setError(e instanceof Error?e.message:'Une erreur est survenue.');}finally{setBusy('');controller.current=null;}}
 function pause(){stop.current=true;controller.current?.abort();}
 function discardReady(){if(downloadURL.current)URL.revokeObjectURL(downloadURL.current);downloadURL.current='';setReady(null);}
 function reset(){mediaRef.current=[];scanCursor.current=null;saveIndex.current=0;zipIndex.current=0;zipPart.current=0;setItems([]);setCount(0);setScanned(false);setSavedCount(0);setZipCount(0);setVisible(30);discardReady();setError('');setMessage('');}
 async function connect(){await task('Connexion',async()=>{
  const value=input.trim()||token.current;if(!value)throw new Error('Colle ton jeton Discord pour continuer.');token.current=value;setInput('');
  const me=await request({action:'me'});setUser(me);
  try{sessionStorage.setItem(KEY,value);}catch{setMessage('Le navigateur bloque le stockage de session : le jeton restera uniquement en mémoire.');}
  const list:Choice[]=[];let after:string|null=null;do{const p=await request({action:'guilds',after});list.push(...p.items);after=p.after;if(after)await wait(400);}while(after);
  setGuilds(list);setMessage(`Connecté en tant que ${me.name}. Choisis un serveur.`);
 });}
 function logout(){pause();token.current='';setInput('');try{sessionStorage.removeItem(KEY);}catch{}setUser(null);setGuilds([]);setChannels([]);setGuild('');setChannel('');setManual('');reset();}
 async function chooseGuild(value:string){setGuild(value);setChannel('');setChannels([]);reset();await task('Chargement des salons',async()=>{setChannels(await request({action:'channels',guild:value}));});}
 async function scan(){await task('Lecture de l’historique',async()=>{
  let cursor=scanCursor.current;let done=false;const known=new Set(mediaRef.current.map(x=>x.id));
  do{const page=await request({action:'messages',channel,before:cursor});if(stop.current)throw stopError();
   const added=page.items.filter((x:Media)=>!known.has(x.id));for(const x of added)known.add(x.id);mediaRef.current=[...mediaRef.current,...added];setItems(mediaRef.current);setCount(n=>n+page.count);
   if(page.before===cursor && page.count>0)throw new Error('Discord a renvoyé la même page. Réessaie plus tard.');
   cursor=page.before;scanCursor.current=cursor;done=page.done;setMessage(`${mediaRef.current.length} médias trouvés. Lecture de l’historique…`);if(!done)await wait(400);
  }while(!done);
  setScanned(true);setMessage(mediaRef.current.length?`Historique parcouru : ${mediaRef.current.length} médias disponibles.`:'Aucune pièce jointe photo, vidéo ou audio dans ce salon.');
 });}
 async function saveAll(){await task('Sauvegarde sur le site',async()=>{
  for(let i=saveIndex.current;i<mediaRef.current.length;i++){const m=mediaRef.current[i];setMessage(`Sauvegarde ${i+1}/${mediaRef.current.length} : ${m.name}`);await request({action:'save',channel:m.channel,message:m.message,id:m.id});saveIndex.current=i+1;setSavedCount(i+1);await wait(400);}
  setLibraryLoaded(false);setMessage('Tous les médias trouvés sont sauvegardés sur le site. Les doublons ont été ignorés.');
 });}
 function prepare(blob:Blob,name:string){discardReady();const url=URL.createObjectURL(blob);downloadURL.current=url;setReady({url,name});}
 async function makeArchive(){await task('Préparation du téléchargement',async()=>{
  const all=mediaRef.current,start=zipIndex.current,files:{name:string,data:Uint8Array}[]=[];let total=0,i=start;
  // iPhone uses a single downloadable Blob; large media are offered separately, never zipped.
  while(i<all.length){const m=all[i];if(files.length && (total+m.size>32*1024*1024||files.length>=150))break;
   setMessage(`Préparation ${i+1}/${all.length} : ${m.name}`);
   const blob:Blob=await request({action:'file',channel:m.channel,message:m.message,id:m.id},true);
   if(stop.current)throw stopError();
   if(m.size>32*1024*1024 && !files.length){prepare(blob,m.name);i++;break;}
   files.push({name:`${m.message}_${m.id}_${m.name}`,data:new Uint8Array(await blob.arrayBuffer())});total+=blob.size;i++;if(i<all.length)await wait(400);
  }
  if(files.length){zipPart.current++;prepare(zip(files),`Fleury-${channel}-${String(zipPart.current).padStart(3,'0')}.zip`);}
  zipIndex.current=i;setZipCount(i);setMessage(`Téléchargement prêt. Enregistre-le avant de préparer le suivant (${i}/${all.length} médias préparés).`);
 });}
 async function library(more=false){await task('Chargement des sauvegardes',async()=>{const p=await request({action:'library',cursor:more?libraryCursor:null});setSaved(old=>more?[...old,...p.items]:p.items);setLibraryCursor(p.cursor);setLibraryLoaded(true);});}
 async function stored(m:Saved){await task('Préparation du fichier',async()=>{prepare(await request({action:'stored',key:m.key},true),m.name);setMessage('Ton fichier est prêt à être enregistré.');});}
 const total=items.reduce((n,m)=>n+m.size,0);
 return <main>
  <header className="topbar"><a className="brand" href="/" aria-label="Fleury accueil"><span className="brand-icon"><FolderArchive size={23}/></span>fleury<span className="brand-label">MÉDIAS DISCORD</span></a><span className="private"><LockKeyhole size={14}/> Espace privé</span></header>
  <div className="workspace">
   <div className="heading"><div><p className="eyebrow">TES MÉDIAS, AU MÊME ENDROIT</p><h1>Du salon à tes fichiers.</h1><p className="intro">Récupère les photos, vidéos et audios de tes salons Discord.</p></div><span className="heading-icon"><CloudDownload size={38} strokeWidth={1.3}/></span></div>
   <div className="layout"><aside className="connection panel"><div className="section-number">01 <span>COMPTE DISCORD</span></div><h2>{user?'Compte connecté':'Lier ton compte'}</h2>
    {user?<><div className="account"><span className="avatar">{user.name.slice(0,2).toUpperCase()}</span><div><strong>{user.name}</strong><small>Session de cet onglet</small></div></div><button className="button secondary" disabled={active} onClick={logout}><LogOut size={17}/>Déconnecter et effacer le jeton</button></>:<form onSubmit={e=>{e.preventDefault();void connect();}}><label htmlFor="token">Ton jeton Discord</label><input id="token" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Colle ton jeton ici" value={input} onChange={e=>setInput(e.target.value)} disabled={active}/><button className="button primary" type="submit" disabled={active}>{busy==='Connexion'?<LoaderCircle className="spin" size={18}/>:<LockKeyhole size={17}/>} {input?'Connecter mon compte':'Reprendre la session / connecter'}</button></form>}
    <div className="session-note"><ShieldCheck size={18}/><p>Jeton conservé dans cet onglet uniquement. Il transite par le serveur sans être enregistré. La déconnexion l’efface.</p></div>
    <p className="risk">L’automatisation d’un compte personnel est interdite par Discord et peut entraîner sa fermeture.</p>
   </aside>
   <section className="main-panel panel"><Tabs defaultValue="discord"><TabsList className="tab-bar"><TabsTrigger value="discord">Depuis Discord</TabsTrigger><TabsTrigger value="saved">Sur le site</TabsTrigger></TabsList>
    <TabsContent value="discord"><div className="section-number">02 <span>SOURCE DES MÉDIAS</span></div><h2>Choisis où chercher.</h2><div className="selectors"><div><label>Serveur</label><Select disabled={!user||active} value={guild} onValueChange={v=>void chooseGuild(v)}><SelectTrigger aria-label="Serveur"><SelectValue placeholder="Choisir un serveur"/></SelectTrigger><SelectContent>{guilds.map(g=><SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div><div><label>Salon</label><Select disabled={!guild||active} value={channels.some(x=>x.id===channel)?channel:''} onValueChange={v=>{setChannel(v);reset();}}><SelectTrigger aria-label="Salon"><SelectValue placeholder="Choisir un salon"/></SelectTrigger><SelectContent>{channels.map(c=><SelectItem key={c.id} value={c.id}># {c.name}</SelectItem>)}</SelectContent></Select></div></div>
    <details className="manual"><summary>Un fil ou un salon manque dans la liste ?</summary><p>Colle son identifiant Discord. Les fils et publications de forums doivent être parcourus séparément.</p><div className="manual-row"><input aria-label="Identifiant du salon ou fil" inputMode="numeric" placeholder="Identifiant du salon ou du fil" value={manual} disabled={!user||active} onChange={e=>setManual(e.target.value)}/><button className="button secondary" disabled={!user||active||!/^\d{16,22}$/.test(manual)} onClick={()=>{setChannel(manual);reset();}}>Utiliser</button></div></details>
    {channel && !channels.some(c=>c.id===channel)&&<p className="muted">Salon ou fil : {channel}</p>}
    <button className="button primary scan" disabled={!user||!channel||active||scanned} onClick={()=>void scan()}><Hash size={18}/>{scanned?'Historique parcouru':count?'Reprendre la recherche':'Rechercher tous les médias'}</button>
    <div className="metrics"><div><strong>{items.length.toLocaleString('fr-FR')}</strong><span>médias trouvés</span></div><div><strong>{size(total)}</strong><span>volume estimé</span></div><div><strong>{count.toLocaleString('fr-FR')}</strong><span>messages parcourus</span></div></div>
    <div className="section-number">03 <span>DESTINATION</span></div><div className="destinations"><article><ArrowDownToLine size={23}/><h3>Sur mon appareil</h3><p>ZIP d’environ 32 Mo maximum. Les gros fichiers sont proposés séparément.</p><button className="button secondary" disabled={active||!items.length||zipCount>=items.length} onClick={()=>void makeArchive()}>{zipCount?'Préparer le téléchargement suivant':'Préparer le premier téléchargement'}</button><small>{zipCount}/{items.length} médias préparés</small></article><article><CloudDownload size={23}/><h3>Sur le site</h3><p>Sauvegarde privée et durable. Les fichiers déjà présents sont ignorés.</p><button className="button secondary" disabled={active||!items.length||savedCount>=items.length} onClick={()=>void saveAll()}>{savedCount?'Reprendre la sauvegarde':'Sauvegarder tous les médias'}</button><small>{savedCount}/{items.length} médias sauvegardés</small></article></div>
    {!!items.length&&<div className="media-list"><h3>Médias trouvés <span>{scanned?'Inventaire terminé':'Inventaire partiel'}</span></h3>{items.slice(0,visible).map(m=><div className="media-row" key={m.id}><ImageIcon size={18}/><span title={m.name}>{m.name}</span><small>{size(m.size)}</small></div>)}{visible<items.length&&<button className="text-button" onClick={()=>setVisible(n=>n+50)}>Afficher davantage</button>}</div>}
    {!items.length&&<div className="empty"><FolderArchive size={27}/><p>{user?'Sélectionne un salon pour commencer.':'Connecte ton compte pour retrouver tes médias.'}</p></div>}
    </TabsContent>
    <TabsContent value="saved"><div className="section-number">MES FICHIERS <span>SAUVEGARDE PRIVÉE</span></div><h2>Conservés sur le site.</h2><p className="muted">Tes sauvegardes restent accessibles après la déconnexion de Discord.</p><button className="button secondary" disabled={active} onClick={()=>void library()}>Charger les sauvegardes</button>{libraryLoaded&&!saved.length&&<div className="empty"><FolderArchive/><p>Aucun média sauvegardé pour le moment.</p></div>}{saved.map(m=><div className="media-row stored" key={m.key}><FolderArchive size={18}/><span>{m.name}<small>{size(m.size)}</small></span><button aria-label={'Télécharger '+m.name} className="icon-button" disabled={active} onClick={()=>void stored(m)}><ArrowDownToLine size={19}/></button></div>)}{libraryCursor&&<button className="text-button" disabled={active} onClick={()=>void library(true)}>Charger la suite</button>}</TabsContent>
   </Tabs></section></div>
   {(active||message||error||ready)&&<section className="status panel" aria-live="polite">{active&&<div className="status-heading"><span><LoaderCircle className="spin" size={18}/>{busy}</span><button className="button secondary compact" onClick={pause}><Pause size={16}/>Pause</button></div>}{active&&<Progress aria-label={busy} value={busy==='Sauvegarde sur le site'&&items.length?savedCount/items.length*100:undefined}/>}<p>{message}</p>{error&&<p className="error" role="alert">{error}</p>}{ready&&<a className="button primary download" href={ready.url} download={ready.name}><ArrowDownToLine size={18}/>Enregistrer {ready.name}</a>}</section>}
   <footer><span><LockKeyhole size={13}/> Ton espace, tes sauvegardes.</span><p>Garde cette page ouverte pendant les transferts. La recherche reprend tant que l’onglet n’est pas rechargé. Pièces jointes uniquement ; liens externes et messages supprimés exclus.</p></footer>
  </div>
 </main>;
}
