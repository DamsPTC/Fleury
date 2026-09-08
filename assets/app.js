import { zip } from './zip.js';
import { saveQueue } from './save-queue.js';
const $ = id => document.getElementById(id);
const SESSION = 'fleury.discord.session';
const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
const bytes = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' Go' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.round(n / 1e3) + ' ko';
if ($('workspace')) {
    const tokenHelp = $('token-help');
    $('open-token-help').addEventListener('click', () => tokenHelp.showModal());
    $('close-token-help').addEventListener('click', () => tokenHelp.close());
    $('copy-token-code').addEventListener('click', async () => {
        const code = $('token-help-code');
        try {
            await navigator.clipboard.writeText(code.value);
            $('token-copy-status').textContent = 'Code copié. Colle-le dans la console de Discord Web.';
        } catch {
            code.focus(); code.select(); code.setSelectionRange(0, code.value.length);
            $('token-copy-status').textContent = 'Copie automatique indisponible. Maintiens le texte sélectionné puis choisis Copier.';
        }
    });
    let token = '', user = null, busy = false, stopped = false, controller = null;
    let channel = '', before = null, done = false, items = [], messages = 0, shown = 30;
    const failures = new Map(), successes = new Set();
    let libraryPage=1, libraryPages=1, libraryItems=[], libraryLoaded=false;
    const selectedLibrary=new Map();
    let saveIndex = 0, zipIndex = 0, zipPart = 0, objectURL = '';
    try { token = sessionStorage.getItem(SESSION) || ''; } catch { /* Memory-only fallback. */ }
    function note(text) { $('status').hidden = false; $('message').textContent = text; }
    function clearToken() { token = ''; $('token').value = ''; try { sessionStorage.removeItem(SESSION); } catch {} }
    function clearReady() { if (objectURL) URL.revokeObjectURL(objectURL); objectURL = ''; $('download-ready').replaceChildren(); }
    function controls() {
        $('connect').disabled = busy;
        $('token').disabled = busy;
        $('disconnect').disabled = busy;
        $('lock-site').disabled = busy;
        $('guild').disabled = busy || !user;
        $('channel').disabled = busy || !user || !$('guild').value;
        $('manual').disabled = busy || !user;
        $('use-manual').disabled = busy || !user;
        $('scan').disabled = busy || !user || !channel || done;
        $('save').disabled = busy || !user || !items.length || saveIndex >= items.length;
        $('prepare').disabled = busy || !user || !items.length || zipIndex >= items.length;
        $('load-library').disabled = busy;
        $('more-library').disabled = busy || libraryPage>=libraryPages;
        $('previous-library').disabled=busy||libraryPage<=1;
        for(const id of ['go-library','library-guild','library-channel','library-query','library-sort','library-limit','library-page','select-page','download-filtered','clear-selection'])$(id).disabled=busy;
        $('download-selection').disabled=busy||!selectedLibrary.size;
        $('connect-form').hidden = !!user;
        $('account').hidden = !user;
        $('connection-title').textContent = user ? 'Compte connecté' : 'Lier ton compte';
        $('account-name').textContent = user?.name || '';
        $('activity').hidden = !busy;
        $('progress').hidden = !busy;
        $('scan').textContent = done ? 'Historique parcouru' : messages ? 'Reprendre la recherche' : 'Rechercher tous les médias';
        $('prepared-count').textContent = `${zipIndex}/${items.length} médias préparés`;
        $('saved-count').textContent = `${successes.size}/${items.length} sauvegardés · ${failures.size} en échec · ${saveIndex}/${items.length} traités`;
        $('retry-failed').hidden = !failures.size;
        $('retry-failed').disabled = busy || !user;
        $('prepare').textContent = zipIndex ? 'Préparer le lot suivant' : 'Préparer le téléchargement';
        $('save').textContent = saveIndex ? 'Reprendre la sauvegarde' : 'Sauvegarder tous les médias';
    }
    function pause() { stopped = true; controller?.abort(); }
    async function wait(ms) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (stopped) throw new DOMException('Pause', 'AbortError');
            await new Promise(r => setTimeout(r, Math.max(1, Math.min(250, end - Date.now()))));
        }
    }
    async function request(body, binary = false) {
        for (let attempt = 0; attempt < 6; attempt++) {
            if (stopped) throw new DOMException('Pause', 'AbortError');
            controller = new AbortController();
            const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
            if (!['library', 'library_batches', 'stored', 'logout'].includes(body.action)) headers['X-Discord-Token'] = token;
            const res = await fetch('api.php', { method: 'POST', headers, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body), signal: controller.signal });
            if (res.ok) return binary ? res.blob() : res.json();
            const data = await res.json().catch(() => ({ error: 'Réponse illisible du serveur. Vérifie le déploiement Hostinger.' }));
            if (res.status === 429 && attempt < 5) { note(`Pause demandée par le serveur (${Math.ceil(data.retryAfter || 5)} s)…`); await wait((data.retryAfter || 5) * 1000 + 250); continue; }
            if (res.status === 401 && /jeton/i.test(data.error || '')) { clearToken(); user = null; }
            const error = new Error(data.error || 'La requête a échoué.'); error.status = res.status; throw error;
        }
    }
    async function run(label, fn) {
        if (busy) return;
        busy = true; stopped = false; $('error').textContent = ''; $('activity-label').textContent = label; $('status').hidden = false; $('progress').removeAttribute('value'); controls();
        try { await fn(); }
        catch (e) { if (e.name === 'AbortError') note('En pause. Tu peux reprendre depuis cette page.'); else $('error').textContent = e.message || 'Une erreur est survenue.'; }
        finally { busy = false; controller = null; controls(); }
    }
    function selectOptions(node, values, label) {
        node.replaceChildren(new Option(label, ''));
        for (const x of values) node.add(new Option(x.name, x.id));
    }
    function reset() {
        before = null; done = false; items = []; messages = 0; shown = 30; saveIndex = 0; zipIndex = 0; zipPart = 0;
        failures.clear(); successes.clear(); renderFailures();
        clearReady(); $('message').textContent = ''; $('error').textContent = ''; inventory(); controls();
    }
    function inventory() {
        $('media-count').textContent = items.length.toLocaleString('fr-FR');
        $('media-size').textContent = bytes(items.reduce((n, x) => n + x.size, 0));
        $('message-count').textContent = messages.toLocaleString('fr-FR');
        $('empty').hidden = items.length > 0;
        $('empty').textContent = done ? 'Aucune pièce jointe photo, vidéo ou audio trouvée.' : 'Sélectionne un salon pour parcourir son historique.';
        $('media-rows').replaceChildren();
        const fragment = document.createDocumentFragment();
        for (const m of items.slice(0, shown)) {
            const row = document.createElement('div'); row.className = 'media-row';
            const name = document.createElement('span'); name.textContent = m.name; name.title = m.name;
            const size = document.createElement('small'); size.textContent = bytes(m.size);
            row.append(name, size); fragment.append(row);
        }
        $('media-rows').append(fragment); $('more-media').hidden = shown >= items.length;
        controls();
    }
    function fileForm(key, name) {
        const form = document.createElement('form'); form.method = 'post'; form.action = 'download.php'; form.target = '_blank'; form.rel = 'noopener';
        for (const [n, value] of [['csrf', csrf], ['key', key]]) { const input = document.createElement('input'); input.type = 'hidden'; input.name = n; input.value = value; form.append(input); }
        const button = document.createElement('button'); button.type = 'submit'; button.className = 'button secondary'; button.textContent = 'Télécharger'; button.setAttribute('aria-label', 'Télécharger ' + name); form.append(button);
        return form;
    }
    function readyBlob(blob, name) {
        clearReady(); objectURL = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = objectURL; link.download = name; link.className = 'button primary download'; link.textContent = 'Enregistrer ' + name; $('download-ready').append(link);
    }
    function renderFailures() {
        $('failure-rows').replaceChildren();
        $('failures').hidden = !failures.size;
        for(const {item,error} of failures.values()) {
            const row=document.createElement('p'); row.className='error';
            row.textContent=item.name+' — '+error; $('failure-rows').append(row);
        }
    }
    async function saveOne(m) {
        let result;
        do {
            for(let attempt=0;attempt<3;attempt++) {
                note(`Sauvegarde : ${m.name} — ${attempt ? 'nouvelle tentative '+(attempt+1)+'/3' : 'transfert en cours…'}`);
                try {
                    result=await request({action:'save',channel:m.channel,message:m.message,id:m.id,chunkBytes:[4194304,1048576,524288][attempt]});
                    break;
                } catch(e) {
                    if(e.name==='AbortError'||[401,403,404,429,507].includes(e.status)||attempt===2)throw e;
                    note(`${m.name} — interruption temporaire, nouvel essai dans ${attempt+1} s…`);
                    await wait((attempt+1)*1000);
                }
            }
            note(`${m.name} — ${bytes(result.offset)} / ${bytes(result.total)}`);
            $('progress').value = result.total ? result.offset / result.total * 100 : 100;
            if (!result.saved) await wait(400);
        } while (!result.saved);
    }
    async function batch(retryOnly=false) {
        const list=retryOnly ? [...failures.values()].map(x=>x.item) : items;
        await saveQueue({items:list,start:retryOnly?0:saveIndex,save:saveOne,
            onSuccess:m=>{successes.add(m.id);failures.delete(m.id);},
            onFailure:(m,e)=>{failures.set(m.id,{item:m,error:e.message});},
            onAdvance:i=>{if(!retryOnly)saveIndex=i;renderFailures();controls();}
        });
        note(failures.size ? `Parcours terminé : ${successes.size} sauvegardés, ${failures.size} fichiers à réessayer ci-dessous.` : `Tous les médias trouvés sont sauvegardés (${successes.size}).`);
    }
    $('connect-form').addEventListener('submit', e => {
        e.preventDefault(); void run('Connexion à Discord', async () => {
            token = $('token').value.trim() || token; $('token').value = '';
            if (!token) throw new Error('Colle ton jeton Discord pour continuer.');
            user = await request({ action: 'me' });
            try { sessionStorage.setItem(SESSION, token); } catch { note('Le jeton reste en mémoire : ce navigateur refuse le stockage de session.'); }
            let after = null; const list = [];
            do { const p = await request({ action: 'guilds', after }); list.push(...p.items); after = p.after; if (after) await wait(400); } while (after);
            selectOptions($('guild'), list, 'Choisir un serveur');
            note(`Connecté en tant que ${user.name}. Choisis un serveur.`);
        });
    });
    $('disconnect').addEventListener('click', () => { clearToken(); user = null; channel = ''; selectOptions($('guild'), [], 'Choisir un serveur'); selectOptions($('channel'), [], 'Choisir un salon'); reset(); note('Jeton effacé de cet onglet.'); });
    $('lock-site').addEventListener('click', () => void run('Verrouillage du site', async () => { clearToken(); await request({ action: 'logout' }); location.reload(); }));
    $('guild').addEventListener('change', () => {
        const guild = $('guild').value; channel = ''; selectOptions($('channel'), [], 'Choisir un salon'); reset();
        if (guild) void run('Chargement des salons', async () => { const p = await request({ action: 'channels', guild }); selectOptions($('channel'), p.items, 'Choisir un salon'); });
    });
    $('channel').addEventListener('change', () => { channel = $('channel').value; $('manual-choice').textContent = ''; reset(); });
    $('use-manual').addEventListener('click', () => {
        const id = $('manual').value.trim();
        if (!/^\d{16,22}$/.test(id)) { $('status').hidden = false; $('error').textContent = 'Renseigne un identifiant Discord valide.'; return; }
        channel = id; $('channel').value = ''; reset(); $('manual-choice').textContent = 'Salon ou fil sélectionné : ' + id;
    });
    $('scan').addEventListener('click', () => void run('Lecture de l’historique', async () => {
        const known = new Set(items.map(m => m.id));
        do {
            const page = await request({ action: 'messages', channel, before });
            if (stopped) throw new DOMException('Pause', 'AbortError');
            if (page.before === before && page.count) throw new Error('Discord a renvoyé la même page. Réessaie plus tard.');
            for (const m of page.items) if (!known.has(m.id)) { known.add(m.id); items.push(m); }
            before = page.before; done = page.done; messages += page.count; inventory(); note(`${items.length} médias trouvés. Lecture de l’historique…`);
            if (!done) await wait(400);
        } while (!done);
        note(`Historique parcouru : ${items.length} médias trouvés.`);
    }));
    $('save').addEventListener('click', () => void run('Sauvegarde sur Hostinger', () => batch()));
    $('retry-failed').addEventListener('click', () => void run('Nouvel essai des fichiers en échec', () => batch(true)));
    $('prepare').addEventListener('click', () => void run('Préparation du téléchargement', async () => {
        let i = zipIndex, total = 0; const files = [];
        while (i < items.length) {
            const m = items[i];
            if (files.length && (total + m.size > 32 * 1024 * 1024 || files.length >= 150)) break;
            if (m.size > 32 * 1024 * 1024) {
                note('Préparation du gros fichier sur le site avant son téléchargement…');
                await saveOne(m); clearReady(); $('download-ready').append(fileForm(`${m.channel}_${m.message}_${m.id}`, m.name)); i++; break;
            }
            note(`Préparation ${i + 1}/${items.length} : ${m.name}`);
            let blob;
            try { blob=await request({ action:'file',channel:m.channel,message:m.message,id:m.id },true); }
            catch(e) {
                if(e.status!==413)throw e;
                m.size=32*1024*1024+1;
                if(files.length)break;
                await saveOne(m);clearReady();$('download-ready').append(fileForm(`${m.channel}_${m.message}_${m.id}`,m.name));i++;break;
            }
            m.size=blob.size;
            if(files.length && total+blob.size>32*1024*1024)break;
            if (stopped) throw new DOMException('Pause', 'AbortError');
            files.push({ name: `${m.message}_${m.id}_${m.name}`, data: new Uint8Array(await blob.arrayBuffer()) }); total += blob.size; i++;
            if (i < items.length) await wait(400);
        }
        if (files.length) { zipPart++; readyBlob(zip(files), `Fleury-${channel}-${String(zipPart).padStart(3, '0')}.zip`); }
        zipIndex = i; note(`Téléchargement prêt (${i}/${items.length} médias préparés). Enregistre-le avant de préparer le suivant.`);
    }));
    function libraryFilters() {
        return {guild:$('library-guild').value,channel:$('library-channel').value,query:$('library-query').value,sort:$('library-sort').value,limit:Number($('library-limit').value)};
    }
    function updateSelection() {
        $('download-selection').textContent=`Lots de la sélection (${selectedLibrary.size})`;
        $('download-selection').disabled=busy||!selectedLibrary.size;
        for(const box of $('library-rows').querySelectorAll('input[type="checkbox"]'))box.checked=selectedLibrary.has(box.value);
    }
    function archiveForm(keys,label) {
        const form=fileForm(keys[0],label);
        const input=form.querySelector('input[name="key"]');input.name='keys';input.value=JSON.stringify(keys);
        const button=form.querySelector('button');button.textContent=label;button.setAttribute('aria-label',label);return form;
    }
    function renderBatches(batches) {
        $('library-batches').replaceChildren();
        const intro=document.createElement('p');intro.textContent=batches.length ? `${batches.length} lot(s) prêt(s). Appuie sur chaque bouton pour l’enregistrer dans Fichiers.` : 'Aucun fichier dans ces résultats.';$('library-batches').append(intro);
        for(const [i,b] of batches.entries()) {
            if(b.key){const row=document.createElement('div');const name=document.createElement('p');name.textContent=b.name+' · '+bytes(b.size);row.append(name,fileForm(b.key,b.name));$('library-batches').append(row);}
            else $('library-batches').append(archiveForm(b.keys,`Télécharger le lot ${i+1} · ${b.keys.length} fichiers · ${bytes(b.size)}`));
        }
    }
    function selectionBatches() {
        const batches=[];let keys=[],size=0;
        for(const m of selectedLibrary.values()) {
            if(keys.length&&(keys.length>=100||size+m.size>1073741824)){batches.push({keys,size});keys=[];size=0;}
            if(m.size>1073741824){batches.push({key:m.key,name:m.name,size:m.size});continue;}
            keys.push(m.key);size+=m.size;
        }
        if(keys.length)batches.push({keys,size});renderBatches(batches);
    }
    async function library(pageNumber=1) {
        await run('Chargement des sauvegardes', async () => {
            const page=await request({action:'library',...libraryFilters(),page:pageNumber});
            libraryPage=page.page;libraryPages=page.pages;libraryItems=page.items;libraryLoaded=true;
            for(const [id,values,label] of [['library-guild',page.guilds,'Tous les serveurs'],['library-channel',page.channels,'Tous les salons']]) {
                const value=$(id).value;selectOptions($(id),values,label);if([...$(id).options].some(x=>x.value===value))$(id).value=value;
            }
            $('library-rows').replaceChildren();
            for(const m of page.items) {
                const card=document.createElement('article');card.className='library-card';
                const label=document.createElement('label');label.className='library-choice';
                const box=document.createElement('input');box.type='checkbox';box.value=m.key;box.checked=selectedLibrary.has(m.key);box.addEventListener('change',()=>{if(box.checked)selectedLibrary.set(m.key,m);else selectedLibrary.delete(m.key);updateSelection();});
                const name=document.createElement('span');name.textContent=m.name;label.append(box,name);
                const source=document.createElement('p');source.className='muted';source.textContent=`${m.guildName||'Serveur non renseigné'} / #${m.channelName||m.channelId}`;
                const preview=document.createElement('div');preview.className='library-preview';
                if(m.previewType) {
                    const kind=m.previewType.split('/')[0];const media=document.createElement(kind==='image'?'img':kind);media.src='media.php?key='+encodeURIComponent(m.key);
                    if(kind==='image'){media.alt=m.name;media.loading='lazy';media.decoding='async';}
                    else{media.controls=true;media.preload='metadata';media.setAttribute('playsinline','');media.setAttribute('aria-label',m.name);}
                    media.addEventListener('error',()=>{const p=document.createElement('p');p.textContent='Aperçu indisponible dans ce navigateur. Le téléchargement reste disponible.';preview.replaceChildren(p);},{once:true});preview.append(media);
                }else preview.textContent='Ce format ne permet pas d’aperçu dans le navigateur.';
                const size=document.createElement('small');size.textContent=bytes(m.size);
                card.append(label,preview,source,size,fileForm(m.key,m.name));$('library-rows').append(card);
            }
            const first=page.total?(page.page-1)*Number($('library-limit').value)+1:0;
            $('library-summary').textContent=`${first}–${first?first+page.items.length-1:0} sur ${page.total} médias · ${page.allTotal} sauvegardés au total`;
            if(!page.items.length){const p=document.createElement('p');p.textContent='Aucun média ne correspond à ces filtres.';$('library-rows').append(p);}
            $('library-page').value=page.page;$('library-page').max=page.pages;$('library-pages').textContent='/ '+page.pages;$('more-library').hidden=page.page>=page.pages;
            updateSelection();
        });
    }
    function switchTab(saved) {
        for (const [id, selected] of [['saved', saved], ['discord', !saved]]) { $(id + '-tab').setAttribute('aria-selected', String(selected)); $(id + '-tab').tabIndex = selected ? 0 : -1; $(id + '-panel').hidden = !selected; }
    }
    $('saved-tab').addEventListener('click', () => {switchTab(true);if(!libraryLoaded&&!busy)void library();}); $('discord-tab').addEventListener('click', () => switchTab(false));
    for (const id of ['saved', 'discord']) $(id + '-tab').addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const target = e.key === 'Home' ? 'discord' : e.key === 'End' ? 'saved' : id === 'saved' ? 'discord' : 'saved'; switchTab(target === 'saved'); $(target + '-tab').focus(); } });
    $('load-library').addEventListener('click', () => void library(libraryPage));
    $('more-library').addEventListener('click', () => void library(libraryPage+1));
    $('previous-library').addEventListener('click',()=>void library(libraryPage-1));
    $('go-library').addEventListener('click',()=>void library(Math.max(1,Number($('library-page').value)||1)));
    $('library-filters').addEventListener('submit',e=>{e.preventDefault();if(!busy){$('library-batches').replaceChildren();void library(1);}});
    for(const id of ['library-guild','library-channel','library-sort','library-limit'])$(id).addEventListener('change',()=>{if(id==='library-guild')$('library-channel').value='';$('library-batches').replaceChildren();void library(1);});
    $('select-page').addEventListener('click',()=>{for(const m of libraryItems)selectedLibrary.set(m.key,m);updateSelection();});
    $('clear-selection').addEventListener('click',()=>{selectedLibrary.clear();updateSelection();$('library-batches').replaceChildren();});
    $('download-selection').addEventListener('click',selectionBatches);
    $('download-filtered').addEventListener('click',()=>void run('Préparation des lots',async()=>{const result=await request({action:'library_batches',...libraryFilters()});renderBatches(result.batches);}));
    $('more-media').addEventListener('click', () => { shown += 50; inventory(); });
    $('pause').addEventListener('click', pause);
    window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
    if (token) note('Une session Discord est mémorisée dans cet onglet. Clique sur « Connecter / reprendre ma session ».');
    controls();
}
