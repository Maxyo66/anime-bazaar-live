/* Optional online ghosts. Local profiles, save codes and active runs remain authoritative. */
(()=>{
 const supported=/^https?:$/.test(location.protocol)&&!location.hostname.endsWith('.github.io'),endpoint='/api/ghost-sync';
 const states=new Map(),reading=new Set(),sending=new Set();let lastKey=null;
 const key=()=> 'animeBazaarOnlineGhosts:'+profileKey();
 const read=k=>store.get(k,{enabled:false,profileId:null,queue:[],friends:[],lastMetadata:''});
 function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{message(k,'This browser could not save the update queue. Your local game is unchanged.');return false}}
 const state=k=>{if(!states.has(k))states.set(k,{signedIn:null,linked:false,lastRead:0,message:'',retryAt:0});return states.get(k)};
 const context=()=>({key:key(),gid:activeProf().gid||'',profile:activeProf()});
 const meta=()=>({tag:myName(),fav:activeProf().fav,stats:normStats(PROFILE)});
 function show(){
  if(SCREEN!=='share')return;
  const panel=document.getElementById('online-sync-panel');if(!panel)return;
  const input=document.getElementById('online-add-code'),value=input?.value||'',focused=document.activeElement===input,start=input?.selectionStart,end=input?.selectionEnd;
  panel.outerHTML=html();const replacement=document.getElementById('online-add-code');if(replacement){replacement.value=value;if(focused){replacement.focus({preventScroll:true});replacement.setSelectionRange(start,end)}}
 }
 function message(k,text){state(k).message=text;if(k===key())show()}
 async function request(body,gid){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{
   const r=await fetch(body?endpoint:endpoint+(gid?'?gid='+encodeURIComponent(gid):''),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   let data;try{data=await r.json()}catch{throw Error('Automatic updates are not available on this game version yet.')}
   if(!r.ok)throw Object.assign(Error(data.error||'Updates are temporarily unavailable.'),{status:r.status});return data;
  }catch(e){if(e.name==='AbortError')throw Error('The connection timed out. Your ghost is queued for the next attempt.');throw e}finally{clearTimeout(timer)}
 }
 async function refresh(force=false){
  if(!supported)return;const ctx=context(),s=state(ctx.key),record=read(ctx.key);if(force)s.retryAt=0;
  if(reading.has(ctx.key)||(!force&&Date.now()-s.lastRead<60000))return;
  reading.add(ctx.key);s.lastRead=Date.now();
  try{
   const data=await request(null,ctx.gid);s.signedIn=true;s.message='';
   s.linked=!!(record.enabled&&data.profile&&record.profileId===data.profile.id);
   if(record.enabled&&!s.linked)s.message='Sign in with the account that linked this game profile to resume its updates.';
   if(s.linked){const current=read(ctx.key);write(ctx.key,{...current,friends:data.friends,code:data.profile.code,updatedAt:data.profile.updatedAt});if(ctx.key===key())pump()}
  }catch(e){s.linked=false;if(e.status===401){s.signedIn=false;s.message=''}else{s.message=e.message}}
  finally{reading.delete(ctx.key);if(ctx.key===key())show()}
 }
 async function pump(){
  if(!supported)return;const ctx=context(),s=state(ctx.key),r=read(ctx.key);
  if(!r.enabled||!s.linked||sending.has(ctx.key)||Date.now()<s.retryAt)return;
  const metadata=meta(),fingerprint=JSON.stringify(metadata),batch=(r.queue||[]).slice(-12);
  if(!batch.length&&fingerprint===r.lastMetadata)return;
  sending.add(ctx.key);let success=false;
  try{
   const result=await request({action:'upload',profileId:r.profileId,boards:batch,...metadata});
   const current=read(ctx.key),accepted=new Set(result.accepted);
   write(ctx.key,{...current,queue:(current.queue||[]).filter(e=>!accepted.has(e.id)),lastMetadata:fingerprint,updatedAt:result.updatedAt});
   s.retryAt=0;s.message='';success=true;
  }catch(e){s.message=e.message;s.retryAt=Date.now()+60000;if(e.status===401||e.status===403)s.linked=false}
  finally{sending.delete(ctx.key);if(ctx.key===key()){show();if(success&&read(ctx.key).queue?.length)setTimeout(pump,0)}}
 }
 function queueBoard(board){
  const k=key(),r=read(k);if(!r.enabled)return;
  const clean=cleanBoard(board);if(!clean)return;
  const entry={id:crypto.randomUUID().replaceAll('-',''),board:{...clean,day:board.day,diff:board.diff}};
  if(write(k,{...r,queue:[...(r.queue||[]),entry].slice(-12)}))pump();
 }
 function friends(){
  const r=read(key());if(!r.enabled)return [];
  return (r.friends||[]).map(f=>({gid:'sync_'+f.id,legacyGid:f.legacyGid,tag:f.tag,fav:f.fav,diff:'normal',stats:normStats(f.stats),meta:normMeta({}),at:f.updatedAt,updatedAt:f.updatedAt,boards:(f.boards||[]).map(b=>{const c=cleanBoard(b);return c?{...c,day:b.day,ownerId:'g:sync_'+f.id}:null}).filter(Boolean)}));
 }
 const age=t=>!t?'Waiting for the first update':Date.now()-t<60000?'Updated just now':'Updated '+Math.max(1,Math.floor((Date.now()-t)/60000))+' min ago';
 function html(){
  if(!supported)return '<section class="velvet" style="padding:18px;margin:12px 0"><h3>Automatic friend updates</h3><p class="small">Automatic friend updates are available on the original playtest. Manual save codes below work here.</p></section>';
  const k=key(),r=read(k),s=state(k),busy=reading.has(k)||sending.has(k);
  let body=s.signedIn===null?'<p class="small">Checking sign-inâ€¦</p>':!s.signedIn?'<p>Sign in once to keep your friendsâ€™ ghosts up to date automatically.</p><a class="primary" href="/signin-with-chatgpt?return_to=%2Fgame.html" target="_top">Sign in with ChatGPT</a>':!r.enabled?'<p>Link this browserâ€™s current game profile to start automatic updates.</p><button class="primary" data-sync="enable">Enable automatic updates</button>':`<p class="small">${r.queue?.length?esc(r.queue.length+' board update(s) waiting to send'):esc(age(r.updatedAt))}</p><label for="online-friend-code">Your friend link code</label><input id="online-friend-code" readonly value="${esc(r.code||'')}" style="width:100%;font:14px monospace;padding:10px;border-radius:8px;border:1px solid var(--brass2);background:#1a0c06;color:var(--text)"><div class="btns"><button data-sync="copy">Copy friend link code</button><button data-sync="refresh" ${busy?'disabled':''}>Refresh updates</button></div><p class="small">One of you adds the otherâ€™s code once. The connection works both ways.</p><label for="online-add-code">Connect a friend</label><input id="online-add-code" placeholder="ABF1:â€¦" autocomplete="off" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brass2);background:#1a0c06;color:var(--text)"><button class="primary" data-sync="connect">Connect friend</button>${(r.friends||[]).length?'<ul style="padding-left:20px">'+r.friends.map(f=>`<li style="margin:12px 0"><b>${esc(f.tag)}</b> Â· ${esc((f.boards||[]).length)} ${(f.boards||[]).length===1?'board':'boards'} Â· ${esc(age(f.updatedAt))} <button data-sync="disconnect" data-friend="${esc(f.id)}">Disconnect</button></li>`).join('')+'</ul>':'<p class="small">No automatic friend connections yet.</p>'}`;
  return `<section id="online-sync-panel" class="velvet" style="padding:18px;margin:14px 0;display:grid;gap:10px"><h3 style="font-size:24px">Automatic friend updates</h3><p class="small">Shares your display name, public play statistics and your last 12 completed-day ghost boards. Your currency, inventory and unfinished run stay in this browser. Save codes remain available below.</p>${body}<p class="small" role="status">${esc(s.message)}</p></section>`;
 }
 async function act(action,element){
  const ctx=context(),r=read(ctx.key),s=state(ctx.key);
  try{
   if(action==='refresh'){await refresh(true);return}
   if(action==='copy'){await navigator.clipboard.writeText(r.code||'');message(ctx.key,'Friend link code copied.');return}
   if(action==='enable'){
    if(r.profileId)throw Error('Sign in with the original linked account to resume this profile.');
    const gid=ensureGid(),boards=store.get(myBoardsKey(),[]).map(b=>{const c=cleanBoard(b);return c?{...c,day:b.day,diff:b.diff}:null}).filter(Boolean);
    const data=await request({action:'enable',gid,boards,...meta()});
    write(ctx.key,{...r,enabled:true,profileId:data.profile.id,code:data.profile.code,friends:data.friends,updatedAt:data.profile.updatedAt,lastMetadata:'',queue:r.queue||[]});
    s.signedIn=true;s.linked=true;s.message='Automatic updates enabled.';show();return;
   }
   if(!r.enabled||!s.linked)throw Error('Sign in with the linked account before changing friends.');
   if(action==='connect'){const code=document.getElementById('online-add-code')?.value||'';await request({action:'connect',profileId:r.profileId,code})}
   else if(action==='disconnect')await request({action:'disconnect',profileId:r.profileId,friendId:element.dataset.friend});
   await refresh(true);
  }catch(e){message(ctx.key,e.message)}
 }
 function tick(){
  const k=key(),r=read(k);if(k!==lastKey){lastKey=k;if(r.enabled||SCREEN==='share')refresh(true)}
  else if(r.enabled||SCREEN==='share')refresh();
  if(r.enabled)pump();
 }
 window.GhostSync={html,friends,queueBoard,refresh,tick};
 document.addEventListener('click',e=>{const button=e.target.closest('[data-sync]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();act(button.dataset.sync,button)},true);
 window.addEventListener('focus',()=>{if(read(key()).enabled)refresh()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&read(key()).enabled)refresh()});
 const originalRender=render;render=function(...args){const value=originalRender(...args);if(!document.hidden)tick();return value};
 tick();
})();
