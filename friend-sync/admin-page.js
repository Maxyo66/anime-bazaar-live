// Private player list for Max (Claude 2026-11-19). Served by worker.js at GET /admin; the data comes from GET /admin/players,
// which needs the ADMIN_KEY secret. The page itself holds no data and no key. Player names are typed by players, so every
// value is escaped before it is shown. Decodes AB1/AB2 share codes the same way save-code.js does.
export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Anime Bazaar admin</title>
<style>
:root{--bg:#160b05;--panel:#24130a;--line:#4a2a15;--text:#f6e6cf;--dim:#c9a885;--gold:#f2c230;--good:#7fd17f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 60px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--dim);margin-bottom:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
input,button,select{font:inherit;color:var(--text);background:#1a0c06;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
button{cursor:pointer;background:#3a1f0e}button.primary{background:var(--gold);color:#241200;border-color:var(--gold);font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.tile b{display:block;font-size:24px;color:var(--gold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tile.nm b{font-size:18px;line-height:33px}.tile span{color:var(--dim);font-size:12px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.bar input[type=search],.bar input[type=password]{flex:1;min-width:180px}.bar label{white-space:nowrap}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:right}th:first-child,td:first-child,th.l,td.l{text-align:left}
th{color:var(--dim);font-weight:600;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--panel)}th.on{color:var(--gold)}
tbody tr{cursor:pointer}tbody tr:hover{background:#2f190c}.rank{color:var(--dim);width:2em}
.muted{color:var(--dim)}.err{color:#ff8a7a}.ok{color:var(--good)}
#detail{margin-top:16px}#detail h2{margin:0 0 4px;font-size:20px}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:12px}
.note{font-size:12px;color:var(--dim);margin-top:14px}
.foot{margin-top:32px;padding-top:14px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}.tabs .sp{flex:1}.tab.on,.dbtn.on{border-color:var(--gold);color:var(--gold)}
.bgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:12px}.bgrid .card{min-width:0;padding:12px}
.bgrid h2{font-size:16px;margin:0 0 8px;color:var(--gold)}.bgrid table{white-space:normal;font-size:13px}.bgrid th{cursor:default;position:static}.bgrid tbody tr{cursor:default}
.bgrid th,.bgrid td{padding:4px 6px}.meter{display:inline-block;height:6px;border-radius:3px;background:var(--line);width:56px;vertical-align:middle;margin-left:6px;overflow:hidden}.meter i{display:block;height:100%}
</style></head><body><div class="wrap">
<h1>Anime Bazaar admin</h1><div class="sub">Private. Players come from the profiles each game uploads for friend updates; balance numbers come from anonymous run summaries.</div>
<div id="login" class="card" hidden>
 <form id="loginForm" class="bar" style="margin:0"><input id="key" type="password" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key">
 <label class="muted"><input id="remember" type="checkbox" checked> Remember on this computer</label><button class="primary">Open</button></form>
 <div id="loginMsg" class="muted" style="margin-top:8px"></div>
</div>
<div id="main" hidden>
 <div class="tabs"><button class="tab on" data-tab="players">Players</button><button class="tab" data-tab="balance">Balance</button><span class="sp"></span><button id="reload">Refresh</button></div>
 <div id="tab-players">
 <div class="tiles" id="tiles"></div>
 <div class="card">
  <div class="bar"><input id="q" type="search" placeholder="Search a player name" aria-label="Search a player name">
   <select id="since" aria-label="Last played"><option value="0">Played any time</option><option value="1">Played in the last 24 hours</option><option value="7">Played in the last 7 days</option><option value="30">Played in the last 30 days</option></select>
   <label class="muted"><input id="hideNew" type="checkbox" checked> Hide players with no runs</label>
  </div>
  <div class="scroll"><table><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></div>
  <div class="note" id="count"></div>
 </div>
 <div id="detail" class="card" hidden></div>
 <div class="note">Each row is one browser profile, so one person on two devices (or after clearing their browser) shows twice. "Last played" is the last time their profile changed, which is usually when they finish a run.
 Titles are runs that reached 10 wins. The "runs finished in the last 24 hours / 7 days" counts come from the anonymous run stats, so they leave out Daily challenges and players who turned stat sharing off; those stats are not linked to these players.</div>
 </div>
 <div id="tab-balance" hidden>
  <div class="bar"><span id="diffs" class="bar" style="margin:0"></span><label class="muted">Runs since <input type="date" id="bsince"></label><button id="bsinceClear">All time</button></div>
  <div id="bout"><p class="muted">Loading…</p></div>
 </div>
 <div class="foot"><button id="logout">Log out</button>
  <span id="logoutAsk" hidden><span class="muted">Log out of this browser? To get back in you'll need the key from your key file.</span> <button id="logoutYes" class="primary">Yes, log out</button> <button id="logoutNo">Cancel</button></span></div>
</div>
</div>
<script>
const HEROES={ainz:['Ainz','💀'],andy:['Andy & Fuuko','🧟'],anya:['Anya','🥜'],deku:['Deku','💚'],denji:['Denji','⚙️'],edward:['Ed','⚗️'],frieren:['Frieren','🔮'],fuuko:['Fuuko','🧤'],gojo:['Gojo','🕶️'],goku:['Goku','🐉'],ichigo:['Ichigo','🌙'],jinwoo:['Jinwoo','👤'],jotaro:['Jotaro','⭐'],juiz:['Juiz','📕'],levi:['Levi','🕊️'],luffy:['Luffy','👒'],maomao:['Maomao','🌿'],misaka:['Misaka','⚡'],naruto:['Naruto','🍥'],ryuko:['Ryuko','✂️'],saitama:['Saitama','🦲'],shinra:['Shinra','🔥'],tanjiro:['Tanjiro','🎴'],vegeta:['Vegeta','👑']};
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hero=id=>{const h=HEROES[id];return h?h[1]+' '+h[0]:String(id||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())};
const KEY='abAdminKey';let key='';try{key=localStorage.getItem(KEY)||''}catch(e){}
let players=[],recent={d1:null,d7:null},sortBy='updated',desc=true,openId=null;

// ---- share codes (same formats as save-code.js) ----
const unb64url=t=>{t=t.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(t+'='.repeat((4-t.length%4)%4)),c=>c.charCodeAt(0))};
async function decode(code){
  code=String(code||'');
  try{
    if(code.startsWith('AB1:'))return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.slice(4)),c=>c.charCodeAt(0))));
    if(!code.startsWith('AB2:'))return null;
    const s=new DecompressionStream('deflate-raw'),w=s.writable.getWriter();w.write(unb64url(code.slice(4))).catch(()=>{});w.close().catch(()=>{});
    return JSON.parse(new TextDecoder().decode(await new Response(s.readable).arrayBuffer()));
  }catch(e){return null}
}
const num=v=>Number.isFinite(+v)&&+v>0?+v:0;
function summarize(row,d){
  d=d&&typeof d==='object'?d:{};const st=d.stats&&typeof d.stats==='object'?d.stats:{},m=d.meta&&typeof d.meta==='object'?d.meta:{};
  const heroes=Object.entries(st.heroes&&typeof st.heroes==='object'?st.heroes:{}).map(([id,r])=>({id,runs:num(r&&r.runs),champs:num(r&&r.champs),hard:num(r&&r.hard),normal:num(r&&r.normal),best:num(r&&r.best),wins:num(r&&r.wins),mastery:num(m.mastery&&m.mastery[id])})).filter(h=>h.runs>0).sort((a,b)=>b.runs-a.runs);
  const sum=k=>heroes.reduce((t,h)=>t+h[k],0),daily=Object.entries(st.daily&&typeof st.daily==='object'?st.daily:{}).map(([day,w])=>({day,wins:num(w)})).sort((a,b)=>a.day<b.day?1:-1);
  const owned=m.owned&&typeof m.owned==='object'?Object.values(m.owned).reduce((t,a)=>t+(Array.isArray(a)?a.length:0),0):0;
  const runs=sum('runs'),champs=sum('champs');
  return {id:row.id,name:typeof d.tag==='string'&&d.tag.trim()?d.tag.trim().slice(0,40):'(no name)',ok:!!d.stats,created:row.created,updated:row.updated,boards:row.boards,
    runs,champs,hard:sum('hard'),normal:sum('normal'),best:heroes.reduce((t,h)=>Math.max(t,h.best),0),wins:sum('wins'),rate:runs?champs/runs:0,avg:runs?sum('wins')/runs:0,
    fav:heroes[0]?heroes[0].id:(d.fav||''),heroes,daily,bestDaily:daily.reduce((t,x)=>Math.max(t,x.wins),0),xp:num(m.xp),ryo:num(m.ryo),
    ach:m.ach&&typeof m.ach==='object'?Object.keys(m.ach).length:0,bosses:Array.isArray(m.bosses)?m.bosses.length:0,owned,friends:num(m.counters&&m.counters.friends),diff:d.diff||''};
}

// ---- data ----
async function load(){
  $('#loginMsg').textContent='Loading…';const out=[];let offset=0;
  for(let i=0;i<40&&offset!=null;i++){
    const r=await fetch('/admin/players?offset='+offset,{headers:{Authorization:'Bearer '+key},cache:'no-store'});
    if(r.status===401){forget('That key did not work.');return}
    if(!r.ok){showLogin('The server answered '+r.status+'. Try again in a minute.');return}
    const d=await r.json();out.push(...d.players);offset=d.next;
  }
  players=await Promise.all(out.map(async row=>summarize(row,await decode(row.code))));
  // Recent run counts come from the anonymous run stats (only runs from games that leave stat sharing on).
  const runsSince=ms=>fetch('/stats?since='+(Date.now()-ms),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d&&d.runs?+d.runs.runs||0:null).catch(()=>null);
  [recent.d1,recent.d7]=await Promise.all([runsSince(864e5),runsSince(7*864e5)]);
  $('#login').hidden=true;$('#main').hidden=false;render();
  if(TAB==='players'){let t='players';try{t=localStorage.getItem('abAdminTab')||t}catch(e){}if(t==='balance')showTab(t)}
}
function showLogin(msg){$('#main').hidden=true;$('#login').hidden=false;$('#loginMsg').textContent=msg||'';$('#key').focus()}
function forget(msg){key='';try{localStorage.removeItem(KEY)}catch(e){}showLogin(msg)}
$('#loginForm').onsubmit=e=>{e.preventDefault();key=$('#key').value.trim();if(!key)return;if($('#remember').checked)try{localStorage.setItem(KEY,key)}catch(e){}$('#key').value='';load().catch(()=>showLogin('Could not reach the server.'))};
const askLogout=on=>{$('#logout').hidden=on;$('#logoutAsk').hidden=!on};
$('#logout').onclick=()=>askLogout(true);$('#logoutNo').onclick=()=>askLogout(false);
$('#logoutYes').onclick=()=>{askLogout(false);forget('Logged out on this computer. Paste the key from your key file to get back in.')};
$('#reload').onclick=()=>{load().catch(()=>showLogin('Could not reach the server.'));if(TAB==='balance')bload()};
let TAB='players';
function showTab(t){TAB=t;for(const b of document.querySelectorAll('.tab'))b.classList.toggle('on',b.dataset.tab===t);$('#tab-players').hidden=t!=='players';$('#tab-balance').hidden=t!=='balance';try{localStorage.setItem('abAdminTab',t)}catch(e){}if(t==='balance')bload()}
for(const b of document.querySelectorAll('.tab'))b.onclick=()=>showTab(b.dataset.tab);

// ---- balance (same numbers as the old stats.html; GET /stats is anonymous totals) ----
const MIN=5,GAME='https://maxyo66.github.io/anime-bazaar-live/index.html';let DIFF='',NAMES=null;
const bpct=(a,b)=>b?Math.round(100*a/b):0;
const meter=p=>'<span class="meter"><i style="width:'+p+'%;background:'+(p>=55?'var(--good)':p<=35?'#ff8a7a':'var(--gold)')+'"></i></span>';
const nm=id=>NAMES&&NAMES[id]||(HEROES[id]?HEROES[id][0]:id);
async function loadNames(){if(NAMES)return;NAMES={};try{const h=await (await fetch(GAME,{cache:'no-store'})).text();
  for(const m of h.matchAll(/\b[IE]\('(?:[a-z0-9_]+',)?'([a-z0-9_]+)',(['"])((?:\\.|(?!\2).)*)\2/g))NAMES[m[1]]=m[3].replace(/\\'/g,"'");
  for(const m of h.matchAll(/\{id:'([a-z0-9_]+)',a:'[a-z0-9_]+',b:'[a-z0-9_]+',(?:loot:true,)?name:"([^"]+)"/g))NAMES[m[1]]=m[2];}catch(e){}}
function btable(rows,cols){return '<table><tr>'+cols.map(c=>'<th class="'+(c[2]||'l')+'">'+c[0]+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+cols.map(c=>'<td class="'+(c[2]||'l')+'">'+c[1](r)+'</td>').join('')+'</tr>').join('')+'</table>'}
function brender(d){
  const R=d.runs||{runs:0,wins:0},since=$('#bsince').value;
  if(!R.runs){$('#bout').innerHTML='<p class="muted">No finished runs reported'+(since?' since '+esc(since):'')+' yet.</p>';return}
  const few=r=>r.runs<MIN?' <span class="muted">(few runs)</span>':'';
  const heroes=(d.heroes||[]).filter(h=>!DIFF||h.diff===DIFF);
  const items=(d.items||[]).map(i=>({...i,wins:+i.wins||0,losses:Math.max(0,(+i.runs||0)-(+i.wins||0)),p:bpct(i.wins,i.runs)}));
  const winning=items.filter(i=>i.wins>0),losing=items.filter(i=>i.losses>0).map(i=>({...i,lp:bpct(i.losses,i.runs)}));
  const foes=(d.foes||[]).filter(f=>f.fights>=MIN&&f.kind!=='pvp').map(f=>({...f,p:bpct(f.won,f.fights)}));
  const pairs=(d.pairs||[]).map(x=>({...x,p:bpct(x.wins,x.runs)}));
  const rate=p=>p+'%'+meter(p),il=i=>esc(nm(i.item))+few(i);
  const card=(t,body,hint)=>'<div class="card"><h2>'+t+'</h2><div class="scroll">'+body+'</div>'+(hint?'<div class="note">'+hint+'</div>':'')+'</div>';
  $('#bout').innerHTML='<div class="tiles">'+[[R.runs,'runs reported'],[bpct(R.wins,R.runs)+'%','of runs won'],[new Set(heroes.map(h=>h.hero)).size,'heroes played'],[pairs.length,'hidden pairs found']].map(([v,l])=>'<div class="card tile"><b>'+v+'</b><span>'+l+'</span></div>').join('')+'</div>'
  +'<div class="bgrid">'
  +card('Heroes',btable(heroes.slice().sort((a,b)=>b.runs-a.runs),[['Hero',h=>esc(nm(h.hero))+few(h)],['Diff',h=>esc(h.diff)],['Runs',h=>h.runs,'n'],['Win rate',h=>rate(bpct(h.wins,h.runs)),'n'],['Avg day',h=>h.avgDay,'n'],['Avg wins',h=>h.avgWins,'n']]))
  +card('Hardest monsters, bosses and trials',btable(foes.sort((a,b)=>a.p-b.p).slice(0,25),[['Foe',f=>esc(f.foe)],['Kind',f=>esc(f.kind)],['Fights',f=>f.fights,'n'],['Players won',f=>rate(f.p),'n']]),'Only foes fought '+MIN+'+ times.')
  +card('Items in winning boards',btable(winning.sort((a,b)=>b.wins-a.wins||b.p-a.p).slice(0,25),[['Item',il],['Winning boards',i=>i.wins,'n'],['Run win rate',i=>rate(i.p),'n']]),'Items on the final board of won runs. Samples under '+MIN+' runs are marked.')
  +card('Items in losing boards',btable(losing.sort((a,b)=>b.losses-a.losses||b.lp-a.lp).slice(0,25),[['Item',il],['Losing boards',i=>i.losses,'n'],['Run loss rate',i=>i.lp+'%','n']]),'Items on the final board of lost runs. Samples under '+MIN+' runs are marked.')
  +card('Most used items',btable(items.slice().sort((a,b)=>b.runs-a.runs).slice(0,25),[['Item',i=>esc(nm(i.item))],['Final boards',i=>i.runs,'n'],['Avg tier',i=>i.avgTier==null?'':i.avgTier,'n']]))
  +card('Hidden pairs players found',btable(pairs.sort((a,b)=>b.runs-a.runs).slice(0,30),[['Pair',x=>esc(nm(x.pair))],['Runs',x=>x.runs,'n'],['Win rate',x=>rate(x.p),'n']]))
  +card('Day lost runs ended',btable((d.endDays||[]).slice().sort((a,b)=>a.day-b.day),[['Day',x=>x.day,'n'],['Runs',x=>x.runs,'n']]))
  +'</div>'}
async function bload(){
  $('#diffs').innerHTML=[['','All'],['casual','Casual'],['normal','Normal'],['hard','Hard']].map(([v,l])=>'<button class="dbtn'+(DIFF===v?' on':'')+'" data-d="'+v+'">'+l+'</button>').join('');
  await loadNames();const since=$('#bsince').value,q=new URLSearchParams();if(DIFF)q.set('diff',DIFF);if(since)q.set('since',since);
  try{const r=await fetch('/stats?'+q,{cache:'no-store'});brender(await r.json())}catch(e){$('#bout').innerHTML='<p class="err">Could not reach the stats server.</p>'}}
$('#diffs').onclick=e=>{const b=e.target.closest('button');if(b){DIFF=b.dataset.d;bload()}};
$('#bsince').onchange=bload;$('#bsinceClear').onclick=()=>{$('#bsince').value='';bload()};

// ---- view ----
const ago=t=>{if(!t)return '–';const s=(Date.now()-t)/1000;if(s<90)return 'just now';if(s<5400)return Math.round(s/60)+' min ago';if(s<129600)return Math.round(s/3600)+' h ago';if(s<86400*60)return Math.round(s/86400)+' days ago';return new Date(t).toLocaleDateString()};
const day=t=>t?new Date(t).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'–';
const pct=v=>Math.round(v*100)+'%';
const COLS=[['name','Player','l',p=>esc(p.name)],['runs','Runs','',p=>p.runs],['champs','Titles','',p=>p.champs],['hard','Hard titles','',p=>p.hard],['rate','Title rate','',p=>p.runs?pct(p.rate):'–'],
 ['best','Best run','',p=>p.best?p.best+' wins':'–'],['wins','Fight wins','',p=>p.wins],['fav','Main hero','l',p=>esc(p.fav?hero(p.fav):'–')],['ach','Achievements','',p=>p.ach],
 ['created','First seen','',p=>day(p.created)],['updated','Last played','',p=>ago(p.updated)]];
function visible(){
  const q=$('#q').value.trim().toLowerCase(),days=+$('#since').value,cut=days?Date.now()-days*864e5:0,hide=$('#hideNew').checked;
  const list=players.filter(p=>(!q||p.name.toLowerCase().includes(q))&&p.updated>=cut&&(!hide||p.runs>0));
  const k=sortBy,dir=desc?-1:1;return list.sort((a,b)=>(typeof a[k]==='string'?a[k].localeCompare(b[k]):a[k]-b[k])*dir||(b.runs-a.runs));
}
function tiles(){
  const now=Date.now(),act=d=>players.filter(p=>p.updated>=now-d*864e5).length,top=(k)=>players.slice().sort((a,b)=>b[k]-a[k])[0];
  const most=top('runs'),best=players.filter(p=>p.runs>=3).sort((a,b)=>b.champs-a.champs||b.rate-a.rate)[0];
  const n=v=>v==null?'–':v;
  const t=[[players.length,'players in total'],[act(1),'players who played in the last 24 hours'],[act(7),'players who played in the last 7 days'],
    [n(recent.d1),'runs finished in the last 24 hours'],[n(recent.d7),'runs finished in the last 7 days'],[players.reduce((s,p)=>s+p.runs,0),'runs finished by all players, ever'],[players.reduce((s,p)=>s+p.champs,0),'titles won by all players, ever'],
    [most&&most.runs?esc(most.name):'–','plays the most'+(most&&most.runs?' ('+most.runs+' runs)':''),1],[best&&best.champs?esc(best.name):'–','most titles'+(best&&best.champs?' ('+best.champs+')':''),1]];
  $('#tiles').innerHTML=t.map(([v,l,nm])=>'<div class="card tile'+(nm?' nm':'')+'"><b title="'+v+'">'+v+'</b><span>'+l+'</span></div>').join('');
}
function render(){
  tiles();
  $('#head').innerHTML='<th class="rank">#</th>'+COLS.map(([k,l,c])=>'<th class="'+c+(k===sortBy?' on':'')+'" data-k="'+k+'">'+l+(k===sortBy?(desc?' ▾':' ▴'):'')+'</th>').join('');
  const list=visible();
  $('#rows').innerHTML=list.map((p,i)=>'<tr data-id="'+esc(p.id)+'"><td class="rank">'+(i+1)+'</td>'+COLS.map(([k,,c,f])=>'<td class="'+c+'">'+f(p)+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="12" class="muted l">No players match.</td></tr>';
  $('#count').textContent='Showing '+list.length+' of '+players.length+' players.';
  if(openId)detail(openId);
}
$('#head').onclick=e=>{const th=e.target.closest('th[data-k]');if(!th)return;const k=th.dataset.k;if(k===sortBy)desc=!desc;else{sortBy=k;desc=!['name','fav'].includes(k)}render()};
$('#rows').onclick=e=>{const tr=e.target.closest('tr[data-id]');if(tr){openId=tr.dataset.id;detail(openId);$('#detail').scrollIntoView({behavior:'smooth',block:'start'})}};
for(const id of ['#q','#since','#hideNew'])$(id).oninput=render;
function detail(id){
  const p=players.find(x=>x.id===id),el=$('#detail');if(!p){el.hidden=true;return}
  const hrows=p.heroes.map(h=>'<tr><td>'+esc(hero(h.id))+'</td><td>'+h.runs+'</td><td>'+h.champs+'</td><td>'+h.hard+'</td><td>'+h.best+'</td><td>'+h.wins+'</td><td>'+h.mastery+'</td></tr>').join('')||'<tr><td colspan="7" class="muted">No finished runs yet.</td></tr>';
  const drows=p.daily.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+x.wins+' wins</td></tr>').join('')||'<tr><td colspan="2" class="muted">No daily challenges in the last 14 days.</td></tr>';
  el.hidden=false;el.innerHTML='<div class="bar" style="justify-content:space-between"><div><h2>'+esc(p.name)+'</h2><div class="muted">First seen '+day(p.created)+' · last played '+ago(p.updated)+(p.diff?' · plays on '+esc(p.diff):'')+'</div></div><button id="closeDetail">Close</button></div>'
   +'<div class="tiles" style="margin-top:12px">'+[[p.runs,'runs'],[p.champs,'titles'],[p.runs?pct(p.rate):'–','title rate'],[p.avg.toFixed(1),'wins per run'],[p.bestDaily||'–','best daily'],[p.ach,'achievements'],[p.bosses,'bosses beaten'],[p.xp,'XP'],[p.ryo,'Ryo'],[p.owned,'cosmetics owned'],[p.boards,'days on the rival board']].map(([v,l])=>'<div class="card tile"><b>'+v+'</b><span>'+l+'</span></div>').join('')+'</div>'
   +'<div class="grid2"><div class="scroll"><table><thead><tr><th class="l">Hero</th><th>Runs</th><th>Titles</th><th>Hard</th><th>Best</th><th>Fight wins</th><th>Mastery XP</th></tr></thead><tbody>'+hrows+'</tbody></table></div>'
   +'<div class="scroll"><table><thead><tr><th class="l">Daily challenge</th><th>Result</th></tr></thead><tbody>'+drows+'</tbody></table></div></div>'
   +(p.ok?'':'<div class="note err">This profile\'s saved code could not be read.</div>');
  $('#closeDetail').onclick=()=>{openId=null;el.hidden=true};
}
if(key)load().catch(()=>showLogin('Could not reach the server.'));else showLogin();
</script></body></html>`;
