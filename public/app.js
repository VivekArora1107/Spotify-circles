/* ════════════════════════════════════════════════════════════════
   Circles — frontend (talks to the real backend + Spotify)
════════════════════════════════════════════════════════════════ */
const REACTS = ['❤️','🔥','😂','😮','🫶'];
const GRADS = [
  'linear-gradient(135deg,#f472b6,#7c3aed)','linear-gradient(135deg,#22d3ee,#1e3a8a)',
  'linear-gradient(135deg,#fb923c,#7f1d1d)','linear-gradient(135deg,#a3e635,#14532d)',
  'linear-gradient(135deg,#e879f9,#4c1d95)','linear-gradient(135deg,#facc15,#78350f)',
  'linear-gradient(135deg,#60a5fa,#065f46)','linear-gradient(135deg,#f87171,#18181b)'
];
let ME = null;
let state = { view:'home', circleFilter:'all', openCircle:null };
let nowPlaying = null;

/* ── tiny utils ─────────────────────────────────────────────── */
const viewEl = () => document.getElementById('view');
const esc = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
function gradFor(id){ let h=0; for(const c of (id||'')) h=(h*31+c.charCodeAt(0))%GRADS.length; return GRADS[h]; }
function timeAgo(ms){
  const s=Math.floor((Date.now()-ms)/1000);
  if(s<60)return 'now'; const m=Math.floor(s/60); if(m<60)return m+'m';
  const h=Math.floor(m/60); if(h<24)return h+'h'; const d=Math.floor(h/24);
  if(d<7)return d+'d'; return Math.floor(d/7)+'w';
}
async function api(method, path, body){
  const res = await fetch('/api'+path, {
    method, headers: body?{'Content-Type':'application/json'}:undefined,
    body: body?JSON.stringify(body):undefined
  });
  if(res.status===401){ showLogin(); throw new Error('unauth'); }
  if(!res.ok){ let e=null; try{e=await res.json();}catch{} throw new Error(e?.detail||e?.error||('http_'+res.status)); }
  if(res.status===204) return null;
  return res.json();
}

/* ── view builders ──────────────────────────────────────────── */
function avatarHTML(u,size=36){
  if(!u) return `<div class="avatar" style="width:${size}px;height:${size}px;background:#444"></div>`;
  if(u.avatar) return `<div class="avatar" style="width:${size}px;height:${size}px;background-image:url('${u.avatar}')"></div>`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${u.color||'#444'};font-size:${size*0.38}px">${esc(initials(u.name))}</div>`;
}
function artHTML(t,size=54,r=9){
  const bg = t&&t.art ? `background-image:url('${t.art}')` : `background:${gradFor(t&&t.id)}`;
  return `<div class="art" style="width:${size}px;height:${size}px;border-radius:${r}px;${bg}"></div>`;
}

/* ── boot / auth ────────────────────────────────────────────── */
async function boot(){
  // surface OAuth errors
  const params = new URLSearchParams(location.search);
  if(params.get('error')){
    document.getElementById('login-err').textContent = 'Sign-in failed: '+params.get('error')+'. Check your Spotify app settings & .env.';
    history.replaceState({},'','/');
  }
  try{
    ME = await fetch('/api/me').then(r=>r.ok?r.json():null);
  }catch{ ME=null; }
  if(ME){ showMain(); } else { showLogin(); }
}
function showLogin(){
  document.getElementById('login').classList.remove('hidden');
  document.getElementById('main').classList.add('hidden');
}
function showMain(){
  document.getElementById('login').classList.add('hidden');
  document.getElementById('main').classList.remove('hidden');
  wireChrome();
  go('home');
  pollNowPlaying();
  refreshBadge();
  setInterval(pollNowPlaying, 20000);
  setInterval(refreshBadge, 30000);
}
function wireChrome(){
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>go(t.dataset.tab));
  document.getElementById('fab').onclick=()=>openComposer();
  document.getElementById('now-share').onclick=()=> nowPlaying && openComposer(nowPlaying);
  document.getElementById('now-toggle').onclick=()=>{ if(player) player.togglePlay(); };
  // bring up the in-app Spotify player
  window.onSDKReady = maybeInitPlayer;
  maybeInitPlayer();
}

/* ── navigation ─────────────────────────────────────────────── */
function go(v){
  state.view=v; state.openCircle=null;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===v));
  document.getElementById('scroll').scrollTop=0;
  render();
}
function spinner(){ viewEl().innerHTML='<div class="spinner"></div>'; }
async function render(){
  spinner();
  try{
    if(state.openCircle){ return renderCircleDetail(state.openCircle); }
    switch(state.view){
      case 'home': return renderHome();
      case 'circles': return renderCircles();
      case 'search': return renderSearch();
      case 'library': return renderLibrary();
      case 'notifs': return renderNotifs();
    }
  }catch(e){ if(String(e.message)!=='unauth') viewEl().innerHTML=`<div class="empty">Something went wrong.<br><span style="font-size:12px">${esc(String(e.message))}</span></div>`; }
}

function topbar(title, brand=false){
  return `<div class="topbar">
    ${brand?`<div class="brand"><svg class="venn" width="30" height="22" viewBox="0 0 84 64"><circle cx="30" cy="32" r="22" stroke-width="4"/><circle cx="54" cy="32" r="22" stroke-width="4"/></svg>Circles</div>`
           :`<h2>${esc(title)}</h2>`}
    <button class="icon-btn" onclick="go('notifs')">
      <span class="dot ${unread?'':'hidden'}" id="bell-dot"></span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
    </button>
  </div>`;
}

/* ── badge ──────────────────────────────────────────────────── */
let unread=false;
async function refreshBadge(){
  try{ const {count}=await api('GET','/notifications/unread'); unread=count>0;
    document.getElementById('nav-badge')?.classList.toggle('hidden', !unread);
    document.getElementById('bell-dot')?.classList.toggle('hidden', !unread);
  }catch{}
}

/* ════════════════════════════════════════════════════════════════
   HOME
════════════════════════════════════════════════════════════════ */
let circlesCache = [];
async function renderHome(){
  circlesCache = await api('GET','/circles');
  const chips = [{id:'all',name:'All',emoji:'✨'},{id:'public',name:'Public',emoji:'🌐'},...circlesCache]
    .map(c=>`<button class="chip ${state.circleFilter===c.id?'active':''}" onclick="setFilter('${c.id}')"><span>${c.emoji||''}</span>${esc(c.name)}</button>`).join('');
  const posts = await api('GET','/feed?circle='+encodeURIComponent(state.circleFilter));
  const body = posts.length ? `<div class="feed">${posts.map(postCard).join('')}</div>`
    : `<div class="empty">Nothing here yet.<br>Tap ＋ to share the first track.</div>`;
  viewEl().innerHTML = topbar('',true)+`<div class="chips">${chips}</div>`+body;
}
function setFilter(id){ state.circleFilter=id; render(); }

function postCard(p){
  const keys = Object.keys(p.reactions).filter(k=>p.reactions[k].length);
  const pills = keys.map(k=>`<button class="react-pill ${k===p.myReaction?'mine':''}" onclick="react('${p.id}','${k}')">${k}<span class="n">${p.reactions[k].length}</span></button>`).join('');
  const replies = p.replies.length?`<div class="replies">${p.replies.map(r=>`<div class="reply">${avatarHTML(r.user,26)}<div class="rb"><b>${esc(r.user.name)}</b> ${esc(r.text)}</div></div>`).join('')}</div>`:'';
  return `<div class="post" id="post-${p.id}">
    <div class="post-head">${avatarHTML(p.author,40)}
      <div class="post-meta"><div class="who">${esc(p.author.name)}</div>
        <div class="sub">@${esc(p.author.handle)} · ${timeAgo(p.created_at)}<span class="badge-circle">${p.circle.emoji||'🌐'} ${esc(p.circle.name)}</span></div>
      </div></div>
    ${p.caption?`<p class="caption">${esc(p.caption)}</p>`:''}
    <div class="track" onclick='playInApp(${JSON.stringify(p.track).replace(/'/g,"&#39;")})'>
      ${artHTML(p.track,54,9)}
      <div class="ti"><div class="t">${esc(p.track.title)}</div><div class="a">${esc(p.track.artist)}</div></div>
      <div class="play-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
    </div>
    <div class="react-row">${pills}
      <button class="react-add" onclick="openTray(event,'${p.id}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 14s1 1.5 3 1.5S15 14 15 14M9 9h.01M15 9h.01"/></svg></button>
      <div class="react-act">
        <button class="act-btn" onclick="document.getElementById('reply-${p.id}').focus()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-11.7 7.7L3 21l1.8-6.3A8.4 8.4 0 1121 11.5z"/></svg>${p.replies.length||''}</button>
        <button class="act-btn" onclick="copyShare('${esc(p.track.url||'')}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg></button>
      </div>
    </div>
    ${replies}
    <div class="reply-input">${avatarHTML(ME,26)}
      <input id="reply-${p.id}" placeholder="Add a reply…" onkeydown="if(event.key==='Enter')addReply('${p.id}',this.value)">
      <button class="reply-send" onclick="addReply('${p.id}',document.getElementById('reply-${p.id}').value)">Send</button>
    </div>
  </div>`;
}

async function react(pid, emoji){ closeTray(); try{ await api('POST',`/posts/${pid}/react`,{emoji}); render(); }catch(e){ toast('Could not react'); } }
async function addReply(pid, text){ text=(text||'').trim(); if(!text)return; try{ await api('POST',`/posts/${pid}/reply`,{text}); render(); toast('Reply added'); }catch(e){ toast('Could not reply'); } }
function copyShare(url){ if(url){ navigator.clipboard?.writeText(url).catch(()=>{}); toast('Link copied'); } else toast('No link'); }

/* react tray */
function openTray(ev,pid){ ev.stopPropagation(); closeTray();
  const r=ev.currentTarget.getBoundingClientRect();
  const t=document.createElement('div'); t.className='tray'; t.id='tray';
  t.innerHTML=REACTS.map(e=>`<button onclick="react('${pid}','${e}')">${e}</button>`).join('');
  document.getElementById('overlay').appendChild(t);
  t.style.top=Math.max(8,r.top-56)+'px';
  t.style.left=Math.min(r.left-10, window.innerWidth-220)+'px';
  setTimeout(()=>document.addEventListener('click',closeTray,{once:true}),0);
}
function closeTray(){ document.getElementById('tray')?.remove(); }

/* ════════════════════════════════════════════════════════════════
   CIRCLES
════════════════════════════════════════════════════════════════ */
async function renderCircles(){
  const list = await api('GET','/circles');
  const cards = list.map(c=>{
    const others=c.members.filter(m=>m.id!==ME.id).slice(0,4);
    return `<div class="circle-card" onclick="openCircle('${c.id}')">
      <div class="circle-cover" style="background:${c.cover||gradFor(c.id)}">${c.emoji||'🎵'}</div>
      <div class="ci"><div class="t">${esc(c.name)} <span style="font-size:12px;color:var(--dim)">🔒</span></div>
        <div class="s">${c.members.length} members · ${c.shares} share${c.shares!==1?'s':''}</div></div>
      <div class="stack">${others.map(m=>avatarHTML(m,28)).join('')}</div>
    </div>`;
  }).join('');
  viewEl().innerHTML = topbar('Circles') +
    `<div style="padding:0 14px"><button class="circle-card" style="justify-content:center;color:var(--accent);font-weight:700;margin:0 0 14px;width:100%" onclick="openCreate()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> New Circle</button></div>` +
    (list.length?cards:`<div class="empty">No circles yet.<br>Create one and invite a few friends.</div>`);
}
function openCircle(id){ state.openCircle=id; document.getElementById('scroll').scrollTop=0; render(); }
async function renderCircleDetail(id){
  const c = await api('GET','/circles/'+id);
  const back = `<div class="topbar"><button class="icon-btn" onclick="state.openCircle=null;render()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><h2 style="font-size:19px">${esc(c.name)}</h2><div style="width:40px"></div></div>`;
  const header = `<div style="padding:6px 18px 14px;display:flex;align-items:center;gap:14px">
    <div class="circle-cover" style="width:64px;height:64px;font-size:30px;background:${c.cover||gradFor(c.id)}">${c.emoji||'🎵'}</div>
    <div><div style="font-size:20px;font-weight:800">${esc(c.name)}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:3px">Private circle · ${c.members.length} members</div>
      <div class="stack" style="margin-top:8px">${c.members.map(m=>avatarHTML(m,26)).join('')}</div></div></div>`;
  const body = c.posts.length?`<div class="feed">${c.posts.map(postCard).join('')}</div>`:`<div class="empty">No shares in ${esc(c.name)} yet.</div>`;
  viewEl().innerHTML = back+header+body;
}

/* create circle */
let nc = { name:'', emoji:'🎵', members:[] };
async function openCreate(){
  nc = { name:'', emoji:'🎵', members:[] };
  const people = await api('GET','/users');
  const emojis=['🎵','🎧','🔊','☕','🌙','🔥','✨','🎸','🪩','🎤'];
  const peopleHTML = people.length? people.map(f=>`<div class="pick" data-mem="${f.id}" onclick="toggleMember('${f.id}')">
      ${avatarHTML(f,40)}<div class="ti" style="flex:1"><div class="t" style="font-size:14px;font-weight:600">${esc(f.name)}</div><div class="a" style="font-size:12px;color:var(--muted)">@${esc(f.handle)}</div></div>
      <div class="check" data-check="${f.id}"></div></div>`).join('')
    : `<div style="color:var(--dim);font-size:13px;padding:8px 2px">No one else has joined yet — you can invite people once they sign in.</div>`;
  openSheet(`<h3>New Circle</h3><p class="hint">A private space to share music with a few people.</p>
    <div class="field-label">Name</div>
    <input class="text-field" id="nc-name" placeholder="e.g. Roadtrip Crew" oninput="nc.name=this.value">
    <div class="field-label">Icon</div>
    <div class="chips" style="padding:0 0 16px">${emojis.map(e=>`<button class="chip" data-emoji="${e}" style="font-size:18px;${e===nc.emoji?'background:var(--accent);color:var(--accent-text)':''}" onclick="pickEmoji('${e}')">${e}</button>`).join('')}</div>
    <div class="field-label">Invite friends</div>
    <div style="max-height:210px;overflow-y:auto;margin-bottom:14px">${peopleHTML}</div>
    <button class="btn-primary" onclick="createCircle()">Create Circle</button>`);
}
function pickEmoji(e){ nc.emoji=e; document.querySelectorAll('[data-emoji]').forEach(b=>{const on=b.dataset.emoji===e;b.style.background=on?'var(--accent)':'';b.style.color=on?'var(--accent-text)':'';}); }
function toggleMember(id){
  const i=nc.members.indexOf(id); if(i>-1)nc.members.splice(i,1); else nc.members.push(id);
  const on=nc.members.includes(id);
  document.querySelector(`[data-mem="${id}"]`).classList.toggle('sel',on);
  document.querySelector(`[data-check="${id}"]`).innerHTML = on?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>':'';
}
async function createCircle(){
  if(!nc.name.trim()){ toast('Give your circle a name'); return; }
  try{ await api('POST','/circles',{name:nc.name.trim(),emoji:nc.emoji,memberIds:nc.members}); closeSheet(); go('circles'); toast('Circle created'); }
  catch(e){ toast('Could not create circle'); }
}

/* ════════════════════════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════════════════════════ */
let searchTimer=null, lastQuery='';
async function renderSearch(){
  viewEl().innerHTML = topbar('Search') +
    `<div class="searchbar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="search-input" placeholder="Songs, artists, people…" value="${esc(lastQuery)}" oninput="onSearch(this.value)"></div>
    <div id="search-results"></div>`;
  doSearch(lastQuery);
  const inp=document.getElementById('search-input'); if(inp&&lastQuery){ inp.focus(); inp.setSelectionRange(lastQuery.length,lastQuery.length); }
}
function onSearch(v){ lastQuery=v; clearTimeout(searchTimer); searchTimer=setTimeout(()=>doSearch(v),300); }
function trackRow(s){
  const j = JSON.stringify(s).replace(/'/g,"&#39;");
  return `<div class="row" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0" onclick='playInApp(${j})'>
        ${artHTML(s,48,9)}
        <div class="ti"><div class="t">${esc(s.title)}</div><div class="s">${esc(s.artist)}${s.album?' · '+esc(s.album):''}</div></div>
      </div>
      <button class="react-add" onclick='event.stopPropagation();openComposer(${j})' title="Share"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>`;
}
function fmtFollowers(n){ return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n); }
async function doSearch(q){
  const host=document.getElementById('search-results'); if(!host)return;
  q=(q||'').trim();
  let tracks=[], artists=[], people=[];
  try{
    if(q){
      const [sp, ppl] = await Promise.all([
        api('GET','/spotify/search?q='+encodeURIComponent(q)),
        api('GET','/users?q='+encodeURIComponent(q))
      ]);
      tracks = sp.tracks||[]; artists = sp.artists||[]; people = ppl;
    } else {
      tracks = await api('GET','/spotify/top-tracks').catch(()=>[]);
      people = await api('GET','/users');
    }
  }catch(e){ host.innerHTML=`<div class="empty">Search unavailable.<br><span style="font-size:12px">${esc(String(e.message))}</span></div>`; return; }

  const tHTML = tracks.map(trackRow).join('');
  const aHTML = artists.map(a=>`<div class="row" onclick='openArtist(${JSON.stringify(a.id)},${JSON.stringify(a.name).replace(/'/g,"&#39;")})' style="cursor:pointer">
      <div class="avatar" style="width:48px;height:48px;${a.image?`background-image:url('${a.image}')`:`background:${gradFor(a.id)}`}"></div>
      <div class="ti"><div class="t">${esc(a.name)}</div><div class="s">Artist${a.followers?' · '+fmtFollowers(a.followers)+' followers':''}</div></div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>`).join('');
  const pHTML = people.map(f=>`<div class="row">${avatarHTML(f,44)}
      <div class="ti"><div class="t">${esc(f.name)}</div><div class="s">@${esc(f.handle)}</div></div>
      <button class="btn-pill ${f.following?'ghost':''}" id="follow-${f.id}" onclick="toggleFollow('${f.id}')">${f.following?'Following':'Follow'}</button>
    </div>`).join('');

  host.innerHTML =
    `<div class="sec-title">${q?'Songs':'Your top tracks'}</div>${tHTML||'<div class="empty" style="padding:24px">No songs found.</div>'}`+
    (aHTML?`<div class="sec-title">Artists</div>${aHTML}`:'')+
    (pHTML?`<div class="sec-title">People on Circles</div>${pHTML}`:'');
}

// Tap an artist → show their top tracks (each shareable)
async function openArtist(id, name){
  const host=document.getElementById('search-results'); if(!host)return;
  host.innerHTML='<div class="spinner"></div>';
  let tracks=[];
  try{ tracks = await api('GET',`/spotify/artist/${id}/top`); }
  catch(e){ host.innerHTML=`<div class="empty">Couldn't load tracks.<br><span style="font-size:12px">${esc(String(e.message))}</span></div>`; return; }
  host.innerHTML =
    `<div class="row" onclick="doSearch(lastQuery)" style="cursor:pointer;color:var(--accent);font-weight:700">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Back to results</div>
     <div class="sec-title">Top songs · ${esc(name)}</div>`+
    (tracks.length? tracks.map(trackRow).join('') : `<div class="empty" style="padding:24px">No tracks available.</div>`);
}
async function toggleFollow(id){
  try{ const {following}=await api('POST',`/users/${id}/follow`); const b=document.getElementById('follow-'+id);
    b.textContent=following?'Following':'Follow'; b.classList.toggle('ghost',following); }catch{ toast('Could not update'); }
}

/* ════════════════════════════════════════════════════════════════
   LIBRARY / PROFILE
════════════════════════════════════════════════════════════════ */
async function renderLibrary(){
  const [me, top, mine] = await Promise.all([
    api('GET','/me'),
    api('GET','/spotify/top-tracks').catch(()=>[]),
    api('GET','/users/'+ME.id).catch(()=>({posts:[]}))
  ]);
  ME = {...ME, ...me};
  const topHTML = top.length? top.map((s,i)=>{const j=JSON.stringify(s).replace(/'/g,"&#39;");return `<div class="row" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0" onclick='playInApp(${j})'>
        <div style="width:22px;text-align:center;font-weight:800;color:var(--dim);font-size:14px">${i+1}</div>
        ${artHTML(s,46,9)}<div class="ti"><div class="t">${esc(s.title)}</div><div class="s">${esc(s.artist)}</div></div>
      </div>
      <button class="react-add" onclick='event.stopPropagation();openComposer(${j})'><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>`;}).join('') : `<div class="empty" style="padding:24px">Play something on Spotify and your top tracks will show here.</div>`;
  const shares = (mine.posts||[]);
  const shareHTML = shares.length? shares.map(p=>`<div class="row">${artHTML(p.track,46,9)}
      <div class="ti"><div class="t">${esc(p.track.title)}</div><div class="s">${p.circle.emoji||'🌐'} ${esc(p.circle.name)} · ${timeAgo(p.created_at)}</div></div></div>`).join('')
    : `<div class="empty" style="padding:24px">You haven't shared anything yet.</div>`;
  viewEl().innerHTML = topbar('Library') +
    `<div class="prof-head">${avatarHTML(ME,84)}
      <div class="name">${esc(ME.name)}</div><div class="handle">@${esc(ME.handle)}</div>
      <div class="bio" id="bio-text">${esc(ME.bio)|| '<span style="color:var(--dim)">Add a music bio…</span>'}</div>
      <button class="btn-pill ghost" style="margin-top:12px" onclick="editBio()">Edit bio</button>
      <div class="prof-stats">
        <div class="st"><div class="num">${me.stats.circles}</div><div class="lbl">Circles</div></div>
        <div class="st"><div class="num">${me.stats.following}</div><div class="lbl">Following</div></div>
        <div class="st"><div class="num">${me.stats.shares}</div><div class="lbl">Shares</div></div>
      </div>
      <button class="btn-pill ghost" style="margin-top:4px" onclick="logout()">Log out</button>
    </div>
    <div class="auto-card">
      <div class="ac-text"><div class="ac-t">Daily auto-share 🎧</div>
        <div class="ac-s">Automatically post your #1 top track to Public once a day.</div></div>
      <button class="switch ${me.autoShare?'on':''}" id="auto-switch" onclick="toggleAutoShare()"><span class="knob"></span></button>
    </div>
    <div style="padding:0 18px 4px"><button class="btn-pill ghost" style="width:100%;padding:12px" onclick="shareTopNow()">Share today's top track now</button></div>
    <div class="sec-title">Top songs this month</div>${topHTML}
    <div class="sec-title">Your recent shares</div>${shareHTML}`;
}
async function toggleAutoShare(){
  const sw=document.getElementById('auto-switch'); const on=!sw.classList.contains('on');
  sw.classList.toggle('on',on);
  try{ await api('PATCH','/me',{autoShare:on}); toast(on?'Auto-share on':'Auto-share off'); }
  catch{ sw.classList.toggle('on',!on); toast('Could not update'); }
}
async function shareTopNow(){
  toast('Checking your top track…');
  try{
    const r=await api('POST','/auto-share/run');
    if(r.posted){ toast('Shared: '+r.posted.title); go('home'); }
    else if(r.skipped==='no_top_track'){ toast('No top track yet — listen on Spotify a while first'); }
    else if(r.skipped==='same_track'){ toast('That track is already your latest share'); }
    else { toast('Nothing to share right now'); }
  }catch(e){ toast('Could not share top track'); }
}
function editBio(){
  openSheet(`<h3>Music bio</h3><textarea class="composer-caption" id="bio-input" maxlength="240" placeholder="What do you listen to?">${esc(ME.bio)}</textarea>
    <button class="btn-primary" onclick="saveBio()">Save</button>`);
}
async function saveBio(){ const v=document.getElementById('bio-input').value; try{ await api('PATCH','/me',{bio:v}); ME.bio=v; closeSheet(); render(); toast('Bio updated'); }catch{ toast('Could not save'); } }
async function logout(){ closeSheet(); await fetch('/auth/logout',{method:'POST'}); ME=null; showLogin(); }

/* ════════════════════════════════════════════════════════════════
   NOTIFICATIONS
════════════════════════════════════════════════════════════════ */
async function renderNotifs(){
  const items = await api('GET','/notifications');
  unread=false; refreshBadge();
  const back=`<div class="topbar"><button class="icon-btn" onclick="go('home')"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><h2 style="font-size:20px">Activity</h2><div style="width:40px"></div></div>`;
  const rows = items.length? items.map(n=>`<div class="row">${avatarHTML(n.actor,40)}
      <div class="ti"><div class="t" style="font-weight:600"><b>${esc(n.actor.name)}</b> ${esc(n.text)}</div><div class="s">${timeAgo(n.created_at)}</div></div></div>`).join('')
    : `<div class="empty">No activity yet.</div>`;
  viewEl().innerHTML = back+rows;
}

/* ════════════════════════════════════════════════════════════════
   NOW PLAYING  +  in-app Spotify Web Playback SDK (Premium)
════════════════════════════════════════════════════════════════ */
let player=null, deviceId=null, sdkPlaying=false, playerPaused=true;

function maybeInitPlayer(){
  if(player || !window.__sdkReady || !ME || typeof Spotify==='undefined') return;
  player = new Spotify.Player({
    name: 'Circles Web Player',
    volume: 0.7,
    getOAuthToken: cb => { fetch('/api/spotify/token').then(r=>r.json()).then(d=>cb(d.token)).catch(()=>{}); }
  });
  player.addListener('ready', ({device_id})=>{ deviceId=device_id; });
  player.addListener('not_ready', ()=>{ deviceId=null; });
  player.addListener('player_state_changed', state=>{
    if(!state || !state.track_window || !state.track_window.current_track){ return; }
    const t=state.track_window.current_track;
    sdkPlaying = true; playerPaused = state.paused;
    nowPlaying = { id:t.id, title:t.name, artist:(t.artists||[]).map(a=>a.name).join(', '), art:(t.album.images&&t.album.images[0]&&t.album.images[0].url)||'', url:'' };
    updateNowBar(nowPlaying, state.paused);
  });
  player.addListener('account_error', ()=>toast('In-app playback needs Spotify Premium'));
  player.addListener('authentication_error', ()=>toast('Reconnect Spotify to enable playback'));
  player.addListener('initialization_error', ({message})=>console.error('player init:',message));
  player.connect();
}

function updateNowBar(track, paused){
  const bar=document.getElementById('nowbar'); if(!bar)return;
  bar.classList.remove('hidden');
  const a=document.getElementById('now-art');
  a.style.backgroundImage=track.art?`url('${track.art}')`:''; if(!track.art)a.style.background=gradFor(track.id);
  document.getElementById('now-t').textContent=track.title;
  document.getElementById('now-a').textContent=track.artist;
  const toggle=document.getElementById('now-toggle');
  toggle.innerHTML = paused
    ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
    : '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
}

// Tap a track anywhere → play the full song in-app (Premium).
async function playInApp(track){
  if(!track || !track.id) return;
  if(typeof Spotify==='undefined'){ toast('Player not ready yet'); return; }
  if(!player){ maybeInitPlayer(); }
  if(!deviceId){ toast('Starting player… tap again in a second'); return; }
  try{
    await api('PUT','/spotify/play',{ uri:`spotify:track:${track.id}`, deviceId });
    nowPlaying = track; updateNowBar(track, false);
    toast('▶ '+track.title);
  }catch(e){ toast('Couldn’t play — '+(String(e.message).includes('Premium')?'Premium required':'reconnect Spotify')); }
}

async function pollNowPlaying(){
  if(sdkPlaying) return;           // the in-app player is driving the bar
  try{
    const {track}=await api('GET','/spotify/now-playing');
    const bar=document.getElementById('nowbar');
    if(track){ nowPlaying=track; updateNowBar(track, true); }
    else if(!sdkPlaying){ bar.classList.add('hidden'); }
  }catch{ /* not playing / token */ }
}

/* ════════════════════════════════════════════════════════════════
   COMPOSER
════════════════════════════════════════════════════════════════ */
let composer = { track:null, target:'public' };
async function openComposer(prefill){
  composer = { track: prefill || nowPlaying || null, target:'public' };
  const circles = circlesCache.length?circlesCache:await api('GET','/circles');
  const targets = `<button class="on" data-id="public" onclick="pickTarget('public')"><span style="font-size:18px">🌐</span>Public<span class="d">Everyone</span></button>`+
    circles.map(c=>`<button data-id="${c.id}" onclick="pickTarget('${c.id}')"><span style="font-size:18px">${c.emoji||'🎵'}</span>${esc(c.name)}<span class="d">${c.members.length} ppl</span></button>`).join('');
  openSheet(`<h3>Share a track</h3><p class="hint">Search Spotify, or use what's playing, then pick who sees it.</p>
    <div class="field-label">Who can see this</div>
    <div class="seg" id="seg-targets">${targets}</div>
    <div class="field-label">Track</div>
    <div class="searchbar" style="margin:0 0 10px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="comp-search" placeholder="Search Spotify…" oninput="compSearch(this.value)"></div>
    <div id="comp-picked"></div>
    <div id="comp-results" style="max-height:230px;overflow-y:auto;margin-bottom:14px"></div>
    <textarea class="composer-caption" id="comp-cap" placeholder="Say something about it… (optional)"></textarea>
    <button class="btn-primary" id="comp-go" onclick="submitShare()">Share</button>`);
  renderPicked();
  // seed results with now-playing/top
  const seed = await api('GET','/spotify/top-tracks').catch(()=>[]);
  fillCompResults(nowPlaying?[nowPlaying,...seed.filter(t=>t.id!==nowPlaying.id)]:seed);
}
function pickTarget(id){ composer.target=id; document.querySelectorAll('#seg-targets button').forEach(b=>b.classList.toggle('on',b.dataset.id===id)); }
let compTimer=null;
function compSearch(q){ clearTimeout(compTimer); compTimer=setTimeout(async()=>{
  q=q.trim(); if(!q){ const seed=await api('GET','/spotify/top-tracks').catch(()=>[]); return fillCompResults(seed); }
  try{ const r=await api('GET','/spotify/search?q='+encodeURIComponent(q)); fillCompResults(r.tracks||[]); }catch{ fillCompResults([]); }
},300); }
function fillCompResults(tracks){
  const host=document.getElementById('comp-results'); if(!host)return;
  host.innerHTML = tracks.length? tracks.map(s=>`<div class="pick" onclick='compPick(${JSON.stringify(s).replace(/'/g,"&#39;")})'>
      ${artHTML(s,44,9)}<div class="ti" style="flex:1"><div class="t" style="font-size:14px;font-weight:700">${esc(s.title)}</div><div class="a" style="font-size:12.5px;color:var(--muted)">${esc(s.artist)}</div></div>
      <div class="check">${composer.track&&composer.track.id===s.id?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>':''}</div></div>`).join('')
    : `<div style="color:var(--dim);font-size:13px;padding:8px 2px">No results.</div>`;
}
function compPick(t){ composer.track=t; renderPicked(); const q=document.getElementById('comp-search'); fillCompResults([t]); }
function renderPicked(){
  const host=document.getElementById('comp-picked'); if(!host)return;
  host.innerHTML = composer.track? `<div class="pick sel" style="margin-bottom:10px">${artHTML(composer.track,44,9)}
    <div class="ti" style="flex:1"><div class="t" style="font-size:14px;font-weight:700">${esc(composer.track.title)}</div><div class="a" style="font-size:12.5px;color:var(--muted)">${esc(composer.track.artist)}</div></div>
    <div class="check"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div></div>`:'';
}
async function submitShare(){
  if(!composer.track){ toast('Pick a track first'); return; }
  const cap=document.getElementById('comp-cap').value.trim();
  document.getElementById('comp-go').disabled=true;
  try{
    await api('POST','/posts',{track:composer.track, caption:cap, target:composer.target});
    closeSheet();
    state.view='home'; state.circleFilter='all';
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='home'));
    render(); document.getElementById('scroll').scrollTop=0;
    toast('Shared');
  }catch(e){ document.getElementById('comp-go').disabled=false; toast('Could not share'); }
}

/* ── sheet / toast ──────────────────────────────────────────── */
function openSheet(html){ document.getElementById('overlay').innerHTML=`<div class="scrim" onclick="closeSheet()"></div><div class="sheet" onclick="event.stopPropagation()"><div class="grip"></div>${html}</div>`; }
function closeSheet(){ document.getElementById('overlay').innerHTML=''; }
let toastT;
function toast(msg){ const h=document.getElementById('toast-host'); h.innerHTML=`<div class="toast">${esc(msg)}</div>`; clearTimeout(toastT); toastT=setTimeout(()=>h.innerHTML='',1800); }

boot();
