/* A Lương ♡ CaPu | Our Little Universe
 * Demo runs as a standalone HTML file with local-only storage.
 * Production mode uses the authenticated FastAPI server and private SQLite/media APIs.
 */
(() => {
'use strict';
const DEMO = location.protocol === 'file:' || new URLSearchParams(location.search).has('demo');
document.body.classList.toggle('demo-mode', DEMO);
let couple;
const STORE_KEY = 'aluong-capu-universe-preview-v1';
const TABLES = ['albums','media','memories','notes','letters','goals','places','events','gifts'];
const initialPlaylist='ZUQtMSa6lN8\nFN7ALfpGxiI\nQGa6FL98h-c\nT7ksmtaVeOk';
const fallbackSettings = {youtube_playlist:initialPlaylist,youtube_loop:'yes',start_date:'',hero_title:'A Lương ♡ CaPu',hero_caption:'Giữa hàng tỷ người, anh chỉ muốn cùng em viết nên câu chuyện của chúng mình.',theme:'light',cover_media_id:'',hero_left_media_id:'',hero_right_media_id:'',music_media_id:'',avatar_owner_media_id:'',avatar_partner_media_id:''};
let state = {}, currentUser = {id:'demo-owner',display_name:'A Lương',role:'owner',email:'demo@local'}, csrf='', activeAlbum='all', currentModal='', authMode='login', authInvite='', toastTimer, clockTimer, currentSettingsTab='general';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nl = x => esc(x).replace(/\n/g,'<br>');
const short = (s,n=100) => String(s||'').length > n ? String(s).slice(0,n)+'…' : String(s||'');
const uuid = () => crypto.randomUUID ? crypto.randomUUID().replaceAll('-','') : Math.random().toString(36).slice(2)+Date.now().toString(36);
const vietnamZone='Asia/Ho_Chi_Minh';
const vietnamDateTime=new Intl.DateTimeFormat('sv-SE',{timeZone:vietnamZone,dateStyle:'short',timeStyle:'medium'});
const vietnamClockFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:vietnamZone,dateStyle:'full',timeStyle:'medium',hour12:false});
let serverClock=null;
const currentTime=()=>serverClock?new Date(serverClock.epoch+performance.now()-serverClock.received):new Date();
const now=()=>currentTime().toISOString();
const parseDate=s=>new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s)?s+'+07:00':s);
const datefmt = (s,mode='short') => {
 if(!s)return 'Chưa có ngày';
 const d=parseDate(s);
 if(isNaN(d.getTime()))return String(s);
 return new Intl.DateTimeFormat('vi-VN',{timeZone:vietnamZone,day:mode==='short'?'2-digit':'numeric',
   month:mode==='short'?'2-digit':'long',year:'numeric'}).format(d);
};
const isoForDate = s => s ? parseDate(s).toISOString() : '';
const otherRole = () => currentUser.role === 'owner' ? 'partner' : 'owner';
const profileFor = role => state.users?.find(user=>user.role===role) || (role==='partner'?state.pending_partner:undefined);
const person = role => profileFor(role)?.display_name || (role==='owner'?'A Lương':'CaPu');
const itsMine = item => item.created_by === currentUser.id;
const el = (tag, attrs={}, txt='') => {const a=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>a.setAttribute(k,v));a.textContent=txt;return a;};
function emptyState(message, action='', table=''){ return `<div class="empty-state"><span class="empty-symbol">♡</span><p>${esc(message)}</p>${action?`<button data-add="${table}">${esc(action)} ↗</button>`:''}</div>`; }
function alertToast(msg){const box=$('#toast');box.textContent=msg;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),4000);}
function demoInitial(){const result={settings:{...fallbackSettings,start_date:'2025-02-14'},user:currentUser,users:[{id:'demo-owner',display_name:'A Lương',role:'owner'},{id:'demo-partner',display_name:'CaPu',role:'partner'}]};TABLES.forEach(t=>result[t]=[]);result.memories.push({id:'demo-memory',title:'Buổi hẹn đầu tiên',body:'Một tách cà phê và một buổi chiều đi dạo.',event_date:'2025-02-14',created_by:'demo-owner',created_at:'2025-02-14',emoji:'♡'});return result;}
function saveDemo(){if(!DEMO)return;try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch(e){alertToast('Bộ nhớ trình duyệt đã đầy. Hãy xuất dữ liệu hoặc giảm kích thước ảnh.');}}
function loadDemo(){try{const s=JSON.parse(localStorage.getItem(STORE_KEY)||'null');state=s&&s.settings?s:demoInitial();}catch{state=demoInitial();}TABLES.forEach(t=>{if(!Array.isArray(state[t]))state[t]=[];});state.settings={...fallbackSettings,...state.settings};}
async function api(path,opts={}){
  const config={credentials:'same-origin',...opts};
  if(opts.body && !(opts.body instanceof FormData))config.headers={'Content-Type':'application/json','X-CSRF-Token':csrf,...opts.headers};
  else if(opts.method && opts.method!=='GET')config.headers={'X-CSRF-Token':csrf,...opts.headers};
  let res;try{res=await fetch('/api'+path,config);}catch{throw Error('Không kết nối được máy chủ. Hãy kiểm tra server đang chạy.');}
  if(!res.ok){let info;try{info=await res.json();}catch{}const error=Error(typeof info?.detail==='string'?info.detail:`Máy chủ trả về lỗi ${res.status}`);error.status=res.status;throw error;}
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res;
}
let reloadVersion=0, refreshPending=false;
const mayRefresh=()=>document.visibilityState==='visible'&&!$('#app').classList.contains('hidden')&&$('#modal-backdrop').classList.contains('hidden');
async function reload({background=false}={}){
  if(DEMO){saveDemo();renderAll();return;}
  const version=background?reloadVersion:++reloadVersion;
  const snapshot=await api('/data');
  if(version!==reloadVersion)return;
  if(background&&(!mayRefresh()||JSON.stringify(snapshot)===JSON.stringify(state)))return;
  state=snapshot;currentUser=state.user;csrf=state.csrf;renderAll();
}
async function refreshShared(){
  if(refreshPending||!mayRefresh())return;
  refreshPending=true;
  try{await reload({background:true});}
  catch(error){if(error.status===401)location.reload();}
  finally{refreshPending=false;}
}
async function createItem(table,obj){
  if(DEMO){const created={id:uuid(),...obj,created_by:currentUser.id,created_at:now()};state[table].unshift(created);await reload();return created;}
  const r=await api('/items/'+table,{method:'POST',body:JSON.stringify(obj)});await reload();return r;
}
async function patchItem(table,id,obj){
  if(DEMO){const item=state[table].find(x=>x.id===id);if(!item)throw Error('Không tìm thấy dữ liệu.');Object.assign(item,obj);await reload();return item;}
  const r=await api('/items/'+table+'/'+id,{method:'PATCH',body:JSON.stringify(obj)});await reload();return r;
}
async function deleteItem(table,id){
  const recoverable=!DEMO&&table==='memories';
  if(!recoverable&&!confirm('Bạn chắc chắn muốn xóa nội dung này chứ?'))return;
  if(DEMO){state[table]=state[table].filter(x=>x.id!==id);if(table==='albums')state.media.forEach(m=>{if(m.album_id===id)m.album_id=null;});await reload();}
  else{await api('/items/'+table+'/'+id,{method:'DELETE'});await reload();}
  alertToast(recoverable?'Đã chuyển kỷ niệm vào Thùng rác.':'Đã xóa nội dung.');
}
async function patchSettings(obj){if(DEMO){Object.assign(state.settings,obj);await reload();}else{state.settings=await api('/settings',{method:'PATCH',body:JSON.stringify(obj)});await reload();}}
function mediaSrc(id,thumb=true){const m=state.media.find(x=>x.id===id);if(!m)return '';if(DEMO)return /^data:(image|audio|video)\//.test(m.data||'')?m.data:'';return '/api/media/'+encodeURIComponent(id)+(thumb?'?thumb=true':'');}
function isImg(m){return m && String(m.mime).startsWith('image/');}
function displayDate(s){return datefmt(s);}
function sectionScroll(id){closeModal();document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
function setMobileMenu(open){
 const button=$('.mobile-menu');
 $('#mobile-nav').classList.toggle('hidden',!open);
 button.setAttribute('aria-expanded',String(open));
 button.setAttribute('aria-label',open?'Đóng menu':'Mở menu');
}
function initPetals(){if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const area=$('#petals');for(let i=0;i<13;i++){const e=el('span',{class:'petal'},i%3===0?'✿':i%3===1?'❀':'✧');e.style.left=(i*17+7)%100+'%';e.style.animationDuration=14+i%7*3+'s';e.style.animationDelay=-i*2.8+'s';e.style.fontSize=8+i%5*3+'px';area.appendChild(e);}}

function showApp(){
 $('#app').classList.remove('hidden');
 renderAll();
 if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'});
}

function renderAll(){
  if(!state.settings)return;
  document.body.classList.toggle('dark',state.settings.theme==='dark');
  $('.theme-switch').textContent=state.settings.theme==='dark'?'☀':'☾';
  $('.nav-avatar').textContent=currentUser.role==='owner'?'AL':'CP';
  $('#hero-caption').textContent=state.settings.hero_caption||fallbackSettings.hero_caption;
  document.title=(state.settings.hero_title||fallbackSettings.hero_title)+' | Our Little Universe';
  $('.brand-copy b').textContent=state.settings.hero_title;
  renderHeroPhotos();
  document.body.dataset.accent=state.settings.accent || 'peach';
  $('.name-aluong').textContent=person('owner');
  $('.name-capu').textContent=person('partner');
  const titleChanged=state.settings.hero_title!==fallbackSettings.hero_title;
  $('#couple-default-title').hidden=titleChanged;
  $('#custom-hero-title').hidden=!titleChanged;
  $('#custom-hero-title').textContent=state.settings.hero_title;
  $('.nav-avatar').textContent=currentUser.display_name.slice(0,2);
  renderCounter();renderProfiles();renderMemories();renderGallery();renderLetters();renderNotes();renderGoals();renderPlaces();renderEvents();renderMusic();couple?.mount();
}
const HERO_FRAMES = {
  cover_media_id: ['.art-photo-main', 'khung giữa'],
  hero_left_media_id: ['.art-photo-flower', 'khung bên trái'],
  hero_right_media_id: ['.art-photo-peach', 'khung bên phải'],
  story_cover_media_id: ['.story-illustration', 'câu chuyện'],
  map_cover_media_id: ['.map-cover-photo', 'nền bản đồ'],
  room_left_media_id: ['.room-picture.picture-1 .picture-inner', 'khung trái trong phòng'],
  room_right_media_id: ['.room-picture.picture-2 .picture-inner', 'khung phải trong phòng']
};
function renderHeroPhotos(){
  for(const [key,[selector]] of Object.entries(HERO_FRAMES)){
    const frame=$(selector);
    const src=mediaSrc(state.settings[key],false);
    frame.style.backgroundImage=src ? `url("${src}")` : '';
    frame.classList.toggle('covered',!!src);
  }
}
function openHeroPhoto(key){
  const [, label]=HERO_FRAMES[key];
  const selected=state.settings[key] || '';
  const available=state.media.filter(item=>isImg(item) && (!item.purpose || item.purpose==='gallery' || item.id===selected));
  const options=available.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.caption || item.original_name)}</option>`).join('');
  modal('Ảnh '+label,`<form class="form-stack" id="hero-photo-form" data-frame="${key}">
    <label>Chọn ảnh từ album<select name="media_id"><option value="">Hình minh họa mặc định</option>${options}</select></label>
    <label>Hoặc tải ảnh mới<input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <div class="form-actions"><button type="submit" class="btn btn-primary">Lưu ảnh ♡</button></div>
  </form>`);
}
function renderCounter(){
  const current=currentTime(), clock=$('#vietnam-clock');
  clock.dateTime=current.toISOString();
  clock.textContent=vietnamClockFormat.format(current);
  const val=state.settings.start_date;
  const node=$('#day-counter');
  $('#us-days').hidden=!val;
  $('#us-since').hidden=!val;
  const dateButton=$('#us [data-action=love-date]');
  const dateAction=val?'Sửa ngày yêu':'Đặt ngày yêu';
  if(dateButton.textContent!==dateAction)dateButton.textContent=dateAction;
  if(!val){
    if(!node.querySelector('[data-action="love-date"]'))node.innerHTML='<div class="counter-placeholder"><span>♡</span><p>Chưa thiết lập ngày bắt đầu câu chuyện</p><button class="text-link" data-action="love-date">Đặt ngày yêu ↗</button></div>';
    $('#next-anniversary').textContent='';
    return;
  }
  const start=new Date(val.slice(0,10)+'T00:00:00+07:00');if(isNaN(start.getTime()))return;
  const diff=Math.max(0,current-start);const day=Math.floor(diff/86400000);const hour=Math.floor((diff%86400000)/3600000);const minute=Math.floor((diff%3600000)/60000);const second=Math.floor((diff%60000)/1000);
  const count=new Intl.NumberFormat('vi-VN').format(day);
  const dateLabel=val.slice(0,10).split('-').reverse().join('/');
  if($('#us-day-count').textContent!==count)$('#us-day-count').textContent=count;
  const since='Từ '+dateLabel;
  if($('#us-since').textContent!==since)$('#us-since').textContent=since;
  const units=[[day,'ngày'],[hour,'giờ'],[minute,'phút'],[second,'giây']];node.innerHTML=units.map(([v,label])=>`<div class="counter-box"><strong>${String(v).padStart(2,'0')}</strong><span>${label}</span></div>`).join('');
  const year = Number(vietnamDateTime.format(current).slice(0,4));
  const suffix = val.slice(4,10)+'T00:00:00+07:00';
  let anniversary = new Date(year+suffix);
  if (anniversary < current) anniversary = new Date((year+1)+suffix);
  const milestones = [[anniversary,'kỷ niệm hằng năm'],...[100,365,1000].map(n=>[new Date(start.getTime()+n*86400000),n+' ngày bên nhau'])];
  const next=milestones.filter(([date])=>date>=current && date>start).sort((a,b)=>a[0]-b[0])[0];
  const label = val.slice(0,10).split('-').reverse().join('/');
  $('#next-anniversary').textContent='♡ Bắt đầu '+label+(next?' · Còn '+Math.ceil((next[0]-current)/86400000)+' ngày đến '+next[1]:'');
}
function renderProfiles(){
  for(const button of $$('[data-own-avatar], [data-action="edit-person"]')){
    const role=button.dataset.ownAvatar||button.dataset.role;
    button.hidden=!profileFor(role);
  }
  for(const [role,selector] of [['owner','#avatar-owner'],['partner','#avatar-partner']]){
    const box=$(selector), key='avatar_'+role+'_media_id', src=mediaSrc(state.settings[key]);
    const profile=profileFor(role);
    box.closest('.us-profile').querySelector('h3').textContent=person(role);
    box.closest('.us-profile').querySelector('.profile-role').textContent=profile?.nickname || (role==='owner'?'THE BOY':'THE GIRL');
    box.innerHTML=src
      ? `<img src="${src}" alt="Ảnh đại diện ${esc(person(role))}" loading="lazy">`
      : companionPortrait(role);
  }
}
function attachment(item){
 const id=item.media_id;
 if(!id)return '';
 const full=DEMO ? mediaSrc(id,false) : '/api/media/'+encodeURIComponent(id);
 if(!full)return '';
 const src=DEMO ? full : full+'?thumb=true';
 return `<a class="attachment-photo" target="_blank" rel="noopener" href="${esc(full)}"><img src="${esc(src)}" alt="Ảnh đính kèm" loading="lazy"></a>`;
}
function renderMemories(){
 const items=[...state.memories].sort((a,b)=>(b.event_date||b.created_at).localeCompare(a.event_date||a.created_at));const box=$('#timeline');
 box.innerHTML=items.length?items.map((m,i)=>`<article class="timeline-entry" id="memory-${esc(m.id)}" tabindex="-1"><div class="timeline-date">${esc(m.event_date?displayDate(m.event_date):displayDate(m.created_at))} · CHAPTER ${String(i+1).padStart(2,'0')}</div><h3>${esc(m.emoji||'♡')} ${esc(m.title)}</h3>${m.body?`<p>${esc(m.body)}</p>`:''}${m.media_id?`<img class="timeline-media" loading="lazy" src="${mediaSrc(m.media_id)}" alt="Ảnh kỷ niệm" />`:''}${m.location?`<p>⌖ ${esc(m.location)}</p>`:''}<div class="entry-actions"><button data-edit="memories:${m.id}">✎ Chỉnh sửa</button><button data-delete="memories:${m.id}">× Xóa</button></div></article>`).join(''):emptyState('Câu chuyện vẫn đang chờ chương đầu tiên. Hãy cùng viết nên một kỷ niệm đáng nhớ.','Viết kỷ niệm đầu tiên','memories');
}
function renderGallery(){
  const tabs=$('#gallery-tabs');const albums=state.albums;
  if(activeAlbum!=='all'&&!albums.some(x=>x.id===activeAlbum))activeAlbum='all';
  tabs.innerHTML='<button class="chip '+(activeAlbum==='all'?'active':'')+'" data-filter="all">Tất cả ♡</button>'+albums.map(a=>`<button class="chip ${activeAlbum===a.id?'active':''}" data-filter="${a.id}">${esc(short(a.title,25))}</button>`).join('');
  const cover=albums.find(album=>album.id===activeAlbum);
  $('#album-cover').innerHTML=cover?attachment(cover):'';
  const content=state.media.filter(m=>(!m.purpose || m.purpose==='gallery') && (isImg(m) || m.mime.startsWith('video/')));
  const filtered=activeAlbum==='all'?content:content.filter(x=>x.album_id===activeAlbum);
  $('#gallery-count').innerHTML=filtered.length+' khoảnh khắc'+(activeAlbum!=='all'?` <button class="gallery-manage" data-edit="albums:${activeAlbum}">Sửa album</button> <button class="gallery-manage" data-delete="albums:${activeAlbum}">Xóa album</button>`:'');
  $('#gallery-grid').innerHTML=filtered.length?filtered.map((m,i)=>`<button class="gallery-item" data-photo="${m.id}"><div class="gallery-image-wrap">${isImg(m)?`<img loading="lazy" src="${mediaSrc(m.id)}" alt="${esc(m.caption||'Ảnh của chúng mình')}"/>`:`<div style="font-size:70px;color:#af7694">▶</div>`}</div><div class="gallery-label"><span>${esc(short(m.caption||'Our little moment',36))}</span><span>♡</span></div></button>`).join(''):`<div class="gallery-empty"><span class="empty-symbol">✿ ♡ ✿</span><h3>Album của chúng mình đang chờ những tấm hình đầu tiên</h3><p>Hãy tải lên những bức ảnh thật của A Lương và CaPu để nơi này trở thành cuốn nhật ký bằng hình ảnh.</p><button class="btn btn-primary" data-action="upload">↑ Thêm ảnh đầu tiên</button></div>`;
}
function renderLetters(){
 const mine=state.letters.filter(l=>l.created_by===currentUser.id||l.recipient_role===currentUser.role);
 const box=$('#letter-list');
 box.innerHTML=mine.length?mine.map(l=>`<button class="letter-tile" data-letter="${l.id}"><span class="tile-icon">${l.locked?'♙':'✉'}</span><strong>${esc(short(l.title,43))}</strong><small>✦ ${esc(datefmt(l.created_at))}</small><div class="tile-foot"><span class="tile-tag">${l.locked?'⌁ Chưa đến ngày mở':l.status==='draft'?'Bản nháp':'♡ '+(itsMine(l)?'Đã gửi':'Dành cho bạn')}</span><span>↗</span></div></button>`).join(''):`<div class="letter-empty">${emptyState('Hộp thư hiện còn trống. Một lá thư chân thành sẽ làm nơi này ấm áp hơn.','Viết lá thư đầu tiên','letters')}</div>`;
}
function renderNotes(){const n=state.notes.length;$('#note-count').textContent=n+' mẩu yêu thương';}
function renderGoals(){const arr=state.goals;const done=arr.filter(x=>x.done).length;$('#goal-progress-label').textContent=`${done}/${arr.length} hoàn thành`;$('#goal-progress').style.width=arr.length?(done/arr.length*100)+'%':'0%';$('#goal-list').innerHTML=arr.length?arr.map(g=>`<div class="goal-item"><button class="goal-check ${g.done?'checked':''}" data-check="${g.id}" aria-label="Đánh dấu hoàn thành">✓</button><div class="goal-copy ${g.done?'done':''}">${esc(g.title)}<span class="goal-category">${esc(g.category||'Cùng nhau')}</span>${attachment(g)}</div><button class="goal-remove" data-edit="goals:${g.id}" title="Chỉnh sửa">✎</button><button class="goal-remove" data-delete="goals:${g.id}" title="Xóa">×</button></div>`).join(''):'<p style="text-align:center;color:var(--muted);font-size:12px">Chưa có điều ước nào. Hãy viết ra những kế hoạch của hai người nhé ♡</p>';}
function renderPlaces(){const pins=$('#map-markers');const list=$('#places-list');pins.innerHTML=state.places.map(p=>{const x=Math.max(3,Math.min(97,(Number(p.lng)+180)/360*100));const y=Math.max(8,Math.min(91,(90-Number(p.lat))/180*100));return `<button class="map-pin" style="left:${x}%;top:${y}%" data-place="${p.id}" title="${esc(p.name)}"><span>♥</span></button>`;}).join('');list.innerHTML=state.places.length?state.places.map(p=>`<div class="place-item"><b>⌖ ${esc(p.name)}</b>${attachment(p)}<p>${esc(short(p.description||'Một nơi để lưu giữ kỷ niệm',75))}</p><p>${p.visited?'✓ Đã ghé qua':'✧ Muốn đến'}${p.event_date?' · '+esc(datefmt(p.event_date)):''}</p><div class="place-actions"><a href="https://www.google.com/maps?q=${encodeURIComponent(p.lat+','+p.lng)}" target="_blank" rel="noopener noreferrer">Xem bản đồ ↗</a><button data-edit="places:${p.id}">Sửa</button><button data-delete="places:${p.id}">Xóa</button></div></div>`).join(''):'<div class="empty-state"><span class="empty-symbol">⌖</span><p>Chưa có địa điểm nào.<br/>Ghim một nơi hai bạn từng đến nhé.</p><button data-add="places">Thêm địa điểm ↗</button></div>';}
function renderEvents(){if(couple)return;const sorted=[...state.events].sort((a,b)=>a.event_date.localeCompare(b.event_date));$('#event-list').innerHTML=sorted.length?sorted.map(e=>{let d=new Date(e.event_date);return `<article class="event-card"><div class="event-date"><strong>${String(d.getDate()).padStart(2,'0')}</strong><span>THÁNG ${String(d.getMonth()+1).padStart(2,'0')}</span></div><div class="event-copy"><b>${esc(e.title)}</b><p>${esc(short(e.details||datefmt(e.event_date),65))}</p>${attachment(e)}<button data-edit="events:${e.id}">Sửa</button><button data-delete="events:${e.id}">Xóa</button></div></article>`;}).join(''):`<div style="grid-column:1/-1">${emptyState('Chưa có lịch kỷ niệm nào. Hãy giữ lại những ngày thật đặc biệt.','Thêm ngày đặc biệt','events')}</div>`;}
const songNames={FN7ALfpGxiI:'Nơi này có anh · Sơn Tùng M-TP'};
let musicTracks=[];
let musicConfig='';
let audioTracks=[];
let waitingForGesture=false;
let backgroundEnabled=true;
let currentAudioIndex=0;
const musicVolumeKey='our-universe-music-volume';
const ambientTracks=[
 {id:'ambient-lantern',original_name:'Đèn trước hiên',notes:[67,71,74,76,74,71,69,67,64,67,71,72,71,67,69,74]},
 {id:'ambient-moon',original_name:'Trăng bên cửa',notes:[72,76,79,76,74,71,69,67,69,72,76,74,72,69,67,64]},
];
function ambientSource(track){
 if(track.src)return track.src;
 const rate=12000,beat=.67,duration=track.notes.length*beat+1.5;
 const samples=new Float32Array(Math.ceil(duration*rate));
 track.notes.forEach((note,index)=>{
   const start=Math.round(index*beat*rate);
   const frequency=440*2**((note-69)/12);
   for(let i=0;i<rate*1.5&&start+i<samples.length;i++){
     const t=i/rate,phase=t*frequency*2*Math.PI;
     const envelope=Math.min(1,t/.055)*Math.exp(-3.15*t);
     samples[start+i]+=.22*envelope*(Math.sin(phase)+.16*Math.sin(phase*2)+.17*Math.sin(phase*.5));
   }
 });
 const wav=new DataView(new ArrayBuffer(44+samples.length*2));
 const write=(offset,value)=>Array.from(value).forEach((letter,i)=>wav.setUint8(offset+i,letter.charCodeAt(0)));
 write(0,'RIFF');wav.setUint32(4,wav.byteLength-8,true);write(8,'WAVEfmt ');
 wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);
 wav.setUint32(24,rate,true);wav.setUint32(28,rate*2,true);
 wav.setUint16(32,2,true);wav.setUint16(34,16,true);
 write(36,'data');wav.setUint32(40,samples.length*2,true);
 samples.forEach((sample,index)=>wav.setInt16(44+index*2,Math.round(sample*32767),true));
 track.src=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
 return track.src;
}
function youtubeId(value){
 const raw=String(value||'').trim();
 const format=/^[A-Za-z0-9_-]{11}$/;
 if(format.test(raw))return raw;
 try{
   const url=new URL(raw);
   if(!['http:','https:'].includes(url.protocol))return '';
   const path=url.pathname.split('/').filter(Boolean);
   const id=url.hostname==='youtu.be'?path[0]:
     ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)?
       (path[0]==='watch'?url.searchParams.get('v'):['shorts','embed','live'].includes(path[0])?path[1]:''):'';
   return format.test(id||'')?id:'';
 }catch{return '';}
}
function youtubeWatch(id){return 'https://www.youtube.com/watch?v='+id;}
function embedMusic(target, tracks, loop){
 const id=tracks[0];
 if(!id)return;
 const options=new URLSearchParams({autoplay:'1',playsinline:'1',rel:'0'});
 const following=tracks.slice(1);
 if(following.length || loop)options.set('playlist',(loop&&tracks.length===1?tracks:following).join(','));
 if(loop)options.set('loop','1');
 const iframe=document.createElement('iframe');
 iframe.title='Trình phát YouTube';
 iframe.referrerPolicy='strict-origin-when-cross-origin';
 iframe.allow='autoplay; encrypted-media; picture-in-picture';
 iframe.allowFullscreen=true;
 iframe.src='https://www.youtube.com/embed/'+id+'?'+options;
 target.replaceChildren(iframe);
}
function stopMusic(){
 $('#music-embed').replaceChildren();
 backgroundEnabled=false;
 waitingForGesture=false;
 $('#music-audio').pause();
 updateSpeaker();
}
function updateMusicLink(){
 const id=$('#music-track').value;
 $('#music-link').hidden=!id;
 if(id)$('#music-link').href=youtubeWatch(id);
}
function openMusicSettings(){
 modal('Danh sách nhạc chung',`<form id="music-settings-form" class="form-stack">
   <label>Liên kết YouTube, mỗi bài một dòng<textarea name="youtube_playlist" rows="7" maxlength="8000">${esc(musicTracks.map(youtubeWatch).join('\n'))}</textarea></label>
   <label class="check-label"><input type="checkbox" name="youtube_loop" ${state.settings.youtube_loop!=='no'?'checked':''}> Lặp lại từ đầu sau bài cuối</label>
   <div class="form-actions"><button type="button" class="btn btn-soft" data-action="upload-music">Tải tệp nhạc</button><button class="btn btn-primary" type="submit">Lưu danh sách</button></div>
   <input type="file" accept="audio/mpeg,audio/wav" id="music-file-input" multiple hidden>
 </form>`);
}
function renderPlaylist(){
 const tracks=(state.settings.youtube_playlist ?? initialPlaylist).split(/\r?\n/).map(youtubeId).filter(Boolean);
 const config=tracks.join(',')+':'+state.settings.youtube_loop;
 if(config!==musicConfig){
   const selected=$('#music-track').value;
   if($('#music-embed').firstChild)stopMusic();
   musicTracks=tracks;
   musicConfig=config;
   $('#music-track').innerHTML=tracks.map((id,index)=>`<option value="${id}">${esc(songNames[id]||'Bài '+(index+1)+' · '+id)}</option>`).join('');
   if(tracks.includes(selected))$('#music-track').value=selected;
   updateMusicLink();
 }
 $('#music-track-label').hidden=!tracks.length;
 $('[data-action=play-youtube]').hidden=!tracks.length;
 $('[data-action=previous-song]').hidden=tracks.length<2;
 $('[data-action=next-song]').hidden=tracks.length<2;
}
function playYoutube(offset=0){
 if(!musicTracks.length)return;
 const select=$('#music-track');
 const index=(Math.max(0,select.selectedIndex)+offset+musicTracks.length)%musicTracks.length;
 select.selectedIndex=index;
 updateMusicLink();
 const loop=state.settings.youtube_loop!=='no';
 const tracks=loop?musicTracks.slice(index).concat(musicTracks.slice(0,index)):musicTracks.slice(index);
 stopMusic();
 $('#gift-music-embed')?.replaceChildren();
 embedMusic($('#music-embed'),tracks,loop);
}
function updateSpeaker(){
 const playing=!$('#music-audio').paused;
 const button=$('.floating-music');
 button.classList.toggle('playing',playing);
 button.setAttribute('aria-pressed',String(playing));
 button.setAttribute('aria-label',playing?'Tắt nhạc nền':'Bật nhạc nền');
 button.title=button.getAttribute('aria-label');
 const authButton=$('.auth-music');
 authButton.textContent=playing?'Tắt nhạc nền':'Bật nhạc nền';
 authButton.setAttribute('aria-pressed',String(playing));
 const song=audioTracks[currentAudioIndex];
 const current=$('#music-current');
 current.hidden=!song;
 current.textContent=song?(playing?'Đang phát':'Đã chọn')+' · '+song.original_name+' · '+(currentAudioIndex+1)+'/'+audioTracks.length:'';
}
async function playUploaded(){
 $('#music-embed').replaceChildren();
 $('#gift-music-embed')?.replaceChildren();
 await $('#music-audio').play();
 waitingForGesture=false;
 updateSpeaker();
}
function selectAudio(index){
 currentAudioIndex=index;
 const player=$('#music-audio');
 const track=audioTracks[index];
 if(track)player.src=track.notes?ambientSource(track):mediaSrc(track.id,false);
 else player.removeAttribute('src');
 updateSpeaker();
}
function tryBackgroundMusic(){
 if(backgroundEnabled&&audioTracks.length)
   playUploaded().catch(error=>{waitingForGesture=backgroundEnabled&&error.name==='NotAllowedError';});
}
function renderMusic(){
 renderPlaylist();
 const music=state.media.filter(item=>item.mime.startsWith('audio/'));
 const configured=(state.settings.music_media_ids||'').split(/\s+/).filter(Boolean);
 const ids=[...new Set([state.settings.music_media_id,...(configured.length?configured:music.map(track=>track.id))])].filter(Boolean);
 const uploaded=ids.length?ids.map(id=>music.find(item=>item.id===id)).filter(Boolean):music;
 updateBackgroundTracks(uploaded.length?uploaded:ambientTracks);
}
function updateBackgroundTracks(next){
 if(next.map(t=>t.id).join()===audioTracks.map(t=>t.id).join())return;
 const previous=audioTracks[currentAudioIndex]?.id;
 audioTracks=next;
 const retained=next.findIndex(track=>track.id===previous);
 if(retained>=0){currentAudioIndex=retained;updateSpeaker();return;}
 selectAudio(0);
 tryBackgroundMusic();
}
function modal(title,body,eyebrow='OUR LITTLE UNIVERSE',wide=false){currentModal=title;$('#modal-eyebrow').textContent=eyebrow;$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('.modal-window').classList.toggle('wide',wide);$('#modal-backdrop').classList.remove('hidden');document.body.style.overflow='hidden';setTimeout(()=>$('#modal-body input,#modal-body textarea,#modal-body button')?.focus(),50);}
function closeModal(){$('#gift-music-embed')?.replaceChildren();$('#modal-backdrop').classList.add('hidden');document.body.style.overflow='';currentModal='';}
const SPECS={
 albums:{title:'Một album mới',fields:[['title','Tên album','text',true],['description','Một lời mô tả','textarea']]},
 memories:{title:'Lưu một kỷ niệm',fields:[['title','Tên kỷ niệm','text',true],['event_date','Ngày kỷ niệm','date'],['emoji','Biểu tượng nhỏ (VD: ♡)','text'],['body','Câu chuyện của chúng mình','textarea'],['location','Địa điểm (không bắt buộc)','text'],['media_id','Ảnh đính kèm','media']]},
 notes:{title:'Thêm mẩu yêu thương',fields:[['body','Viết lời nhắn thật lòng','textarea',true],['mood','Cảm xúc','select',['Yêu thương','Biết ơn','Dễ thương','Nhớ nhung','Vui vẻ']],['favorite','Đánh dấu yêu thích','checkbox']]},
 letters:{title:'Một lá thư từ trái tim',fields:[['title','Tên lá thư','text',true],['body','Nội dung lá thư','textarea',true],['unlock_at','Mở thư vào thời điểm (để trống nếu mở ngay)','datetime-local'],['status','Trạng thái','select',['sent','draft']]]},
 goals:{title:'Một điều muốn làm cùng nhau',fields:[['title','Điều ước / kế hoạch','text',true],['category','Danh mục','select',['Cùng nhau','Hẹn hò','Du lịch','Ẩm thực','Bất ngờ','Tương lai']],['done','Đã thực hiện','checkbox']]},
 places:{title:'Ghim một nơi kỷ niệm',fields:[['name','Tên địa điểm','text',true],['description','Câu chuyện ở đây','textarea'],['lat','Vĩ độ (latitude)','number',true],['lng','Kinh độ (longitude)','number',true],['event_date','Ngày đến đây','date'],['visited','Đã từng ghé đến','checkbox']]},
 events:{title:'Lưu một ngày đặc biệt',fields:[['title','Tên sự kiện','text',true],['event_date','Ngày và giờ (Việt Nam)','datetime-local',true],['details','Ghi chú','textarea'],
 ['category','Loại sự kiện','select-values',{date:'Hẹn hò',birth:'Sinh nhật',anniversary:'Kỷ niệm',plan:'Kế hoạch chung'}],
 ['color','Màu','select-values',{peach:'Hồng đào',lavender:'Tím lavender',sky:'Xanh trời',cream:'Vàng kem'}],
 ['repeat_rule','Lặp lại','select-values',{'':'Không lặp',weekly:'Hàng tuần',monthly:'Hàng tháng',yearly:'Hàng năm'}],
 ['location','Địa điểm','text'],['checklist','Việc cần chuẩn bị (mỗi dòng một việc)','textarea'],['remind_at','Giờ nhắc trong ngày (Việt Nam)','time']]},
 gifts:{title:'Chuẩn bị một bất ngờ',fields:[['title','Tên món quà','text',true],['message','Lời nhắn trong hộp quà','textarea',true],['music_youtube','Link YouTube cho hộp quà (tùy chọn)','text'],['unlock_at','Ngày được mở (để trống nếu mở ngay)','datetime-local']]}
};
function inputField(table,def,item){const [key,label,type,extra]=def;let value=item?.[key]??'';if(table==='events' && key==='event_date' && value) value=value.length===10?value+'T09:00':value.slice(0,16);
 if(table==='events' && key==='remind_at' && value) value=value.slice(11,16);
 if(type==='select-values')return `<label>${label}<select name="${key}">${Object.entries(extra).map(([k,v])=>`<option value="${k}" ${value===k?'selected':''}>${v}</option>`).join('')}</select></label>`;
 if(key==='music_youtube'&&value){const id=youtubeId(value);if(id)value=youtubeWatch(id);}
 if(key==='unlock_at'&&value){const date=new Date(value);if(!isNaN(date))value=vietnamDateTime.format(date).replace(' ','T').slice(0,16);}
 let content='';const attrs=`name="${key}" id="f-${key}" ${extra===true?'required':''}`;
 if(type==='textarea')content=`<textarea ${attrs} placeholder="Viết bằng tất cả chân thành...">${esc(value)}</textarea>`;
 else if(type==='checkbox')content=`<input type="checkbox" ${attrs} ${value?'checked':''}/>`;
 else if(type==='select')content=`<select ${attrs}>${extra.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o==='sent'?'Gửi thư':'draft'===o?'Lưu bản nháp':o)}</option>`).join('')}</select>`;
 else if(type==='media')content=`<select ${attrs}><option value="">Không đính kèm</option>${state.media.filter(m=>isImg(m)&&m.purpose!=='sealed').map(m=>`<option value="${m.id}" ${m.id===value?'selected':''}>${esc(short(m.caption||m.original_name||'Hình ảnh',42))}</option>`).join('')}</select>`;
 else content=`<input type="${type}" ${attrs} value="${esc(value)}" ${type==='number'?'step="any"':''} ${type==='date'?'max="2100-12-31"':''} placeholder="${esc(label)}"/>`;
 return `<label class="${type==='checkbox'?'check-label':''}" for="f-${key}">${type==='checkbox'?content+esc(label):esc(label)+content}</label>`;
}
function openForm(table,id='',initial=null){
 const spec=SPECS[table];if(!spec)return;
 const item=id?state[table].find(x=>x.id===id):initial;
 if(id&&!item){alertToast('Không tìm thấy nội dung.');return;}
 if(id&&item&&['notes','letters','gifts'].includes(table)&&!itsMine(item)){alertToast('Chỉ người viết mới được sửa nội dung này.');return;}
 const inputs=spec.fields.map(f=>inputField(table,f,item)).join('');
 const sealed=table==='letters'||table==='gifts';
 const picker=table==='memories'?'':sealed
   ?`<label>Ảnh đính kèm<select name="media_id"><option value="">Không đính kèm</option>${item?.media_id?'<option selected value="'+esc(item.media_id)+'">Giữ ảnh hiện tại</option>':''}</select></label>`
   :inputField(table,['media_id','Ảnh từ album','media'],item);
 const newPhoto=picker+'<label>Tải ảnh từ thiết bị<input type="file" name="new_photo" accept="image/jpeg,image/png,image/webp,image/gif"></label>';
 const description=table==='letters'?'Thư gửi người thương. Nếu chọn ngày mở, nội dung sẽ được giữ kín với người nhận cho đến đúng thời điểm đó.':table==='gifts'?'Một hộp quà chỉ dành cho người thương. Bạn có thể chọn thời điểm mở quà.':'';
 modal(id?'Chỉnh sửa kỷ niệm':spec.title,`${description?`<p class="modal-description">${description}</p>`:''}<form id="item-form" data-table="${table}" data-id="${id}" class="form-stack">${inputs}${newPhoto}<div class="form-actions"><button class="btn btn-outline" type="button" data-action="close-modal">Để sau</button><button class="btn btn-primary" type="submit">${id?'Lưu thay đổi':'Cất giữ kỷ niệm'} ♡</button></div></form>`, 'MADE WITH LOVE');
}
async function submitItem(form){
 const table=form.dataset.table,id=form.dataset.id, fields=SPECS[table].fields;const fd=new FormData(form);const values={};
 for(const [key,label,type] of fields){let value=type==='checkbox'?form.elements[key].checked:fd.get(key)||'';if(type==='number' && value!=='')value=Number(value);if(type==='datetime-local'&&value&&table!=='events')value=isoForDate(value);if(type==='time'&&value)value='2000-01-01T'+value;if(key==='media_id'&&!value)value='';values[key]=value;}
 if(table==='letters'||table==='gifts')values.recipient_role=id?state[table].find(x=>x.id===id).recipient_role:otherRole();
 if(table==='goals'){values.completed_at=values.done?(id?state.goals.find(x=>x.id===id)?.completed_at||now():now()):'';}
 if(table==='memories'&&!values.emoji)values.emoji='♡';
 const btn=form.querySelector('[type=submit]');
 if(btn.disabled)return;
 const buttonText=btn.textContent;
 btn.disabled=true;
 btn.textContent='Đang lưu…';
 try {
   values.media_id=fd.get('media_id')||'';
   const file=form.elements.new_photo.files[0];
   if(file){
     if(form.uploadedPhoto?.file!==file){
       form.uploadedPhoto={file,id:(await saveUpload(file,['letters','gifts'].includes(table)?'sealed':'gallery')).id};
     }
     values.media_id=form.uploadedPhoto.id;
   }
   if(table==='gifts'&&values.music_youtube){const track=youtubeId(values.music_youtube);if(!track)throw Error('Hãy nhập liên kết YouTube hợp lệ.');values.music_youtube=track;}
   if(id)await patchItem(table,id,values);else await createItem(table,values);
   closeModal();
   if(table==='memories')document.getElementById('story').scrollIntoView();
   alertToast('Đã lưu vào thế giới nhỏ của hai người ♡');
 }catch(e){alertToast(e.message);}
 finally{btn.disabled=false;btn.textContent=buttonText;}
}
function openLetter(id){const l=state.letters.find(x=>x.id===id);if(!l)return;const locked=l.locked||(DEMO&&!itsMine(l)&&l.unlock_at&&new Date(l.unlock_at)>new Date());
 if(locked){modal('Lá thư đang chờ ngày mở',`<div style="text-align:center;padding:22px"><div style="font-size:74px;color:var(--rose)">✉</div><p class="modal-description">Lá thư này sẽ mở vào <b>${esc(datefmt(l.unlock_at,'long'))}</b>. Hãy để thời gian giữ bí mật nhỏ xinh này nhé.</p></div>`);return;}
 modal(l.title,`<div class="letter-paper"><h3>Dear ${esc(person(l.recipient_role))},</h3>${nl(l.body)}${attachment(l)}<div class="signature">With love, ${esc(itsMine(l)?currentUser.display_name:person(l.recipient_role==='owner'?'partner':'owner'))} ♡</div></div><div class="photo-tools"><span style="font-size:11px;color:var(--muted)">${esc(datefmt(l.created_at))} · ${l.status==='draft'?'Bản nháp':'Lá thư yêu thương'}</span>${itsMine(l)?`<div><button class="btn btn-soft" data-edit="letters:${id}">Chỉnh sửa</button> <button class="btn btn-outline" data-delete="letters:${id}">Xóa</button></div>`:''}</div>`,'SEALED WITH LOVE');
}
function openPhoto(id){const m=state.media.find(x=>x.id===id);if(!m)return;
 const full=mediaSrc(id,false);
 const content=isImg(m)?`<img src="${full}" class="modal-photo" alt="Ảnh kỷ niệm"/>`:`<video class="modal-video" src="${full}" controls playsinline></video>`;
 modal('Một khoảnh khắc đáng nhớ',`${content}<form id="photo-form" class="form-stack" data-id="${id}" style="margin-top:15px"><label>Chú thích ảnh<input name="caption" maxlength="500" value="${esc(m.caption||'')}" placeholder="Thêm đôi dòng thương nhớ..."/></label><label>Album<select name="album_id"><option value="">Chưa phân loại</option>${state.albums.map(a=>`<option value="${a.id}" ${a.id===m.album_id?'selected':''}>${esc(a.title)}</option>`).join('')}</select></label><div class="form-actions"><button type="button" class="btn btn-outline" data-action="delete-photo" data-id="${id}">Xóa ảnh</button>${!DEMO?`<a class="btn btn-outline" href="/api/media/${id}?download=true">Tải file gốc ↓</a>`:''}${!DEMO&&isImg(m)?`<button type="button" class="btn btn-soft" data-couple="avatar" data-id="${id}">Dùng làm avatar</button><button type="button" class="btn btn-soft" data-couple="pin-image" data-id="${id}">Ghim ảnh</button>`:''}<button type="button" class="btn btn-soft" data-action="set-cover" data-id="${id}" ${isImg(m)?'':'disabled'}>Đặt làm ảnh bìa</button><button class="btn btn-primary" type="submit">Lưu ♡</button></div></form>`,'OUR LITTLE MOMENTS',true);
}
function openRandomNote(){if(!state.notes.length){modal('Hũ hạnh phúc còn trống',`<div style="text-align:center;padding:24px"><div style="font-size:72px;color:var(--rose)">♡</div><p class="modal-description">Hãy viết mẩu giấy yêu thương đầu tiên để những ngày buồn cũng có thể tìm thấy niềm vui.</p><button class="btn btn-primary" data-add="notes">+ Viết lời nhắn</button></div>`);return;}
 const n=state.notes[Math.floor(Math.random()*state.notes.length)];modal('Một lời yêu được cất kỹ',`<div class="letter-paper" style="text-align:center"><h3>For us ♡</h3>${nl(n.body)}${attachment(n)}<div class="signature">${esc(person(state.users.find(u=>u.id===n.created_by)?.role||'owner'))} ♡</div></div><div class="photo-tools"><span style="font-size:11px;color:var(--muted)">${esc(n.mood||'Yêu thương')} · ${datefmt(n.created_at)}</span><div>${itsMine(n)?`<button class="btn btn-soft" data-edit="notes:${n.id}">Sửa</button> <button class="btn btn-outline" data-delete="notes:${n.id}">Xóa</button>`:''}<button class="btn btn-primary" data-action="random-note">Rút tiếp ♡</button></div></div>`,'FROM OUR MEMORY JAR');}
function openAllNotes(){
 const rows=state.notes.map(n=>`<div class="place-item" style="margin-bottom:10px"><p style="white-space:pre-wrap;font-size:13px;color:var(--ink)">${esc(n.body)}</p>${attachment(n)}<small style="color:var(--rose)">${esc(n.mood)} · ${datefmt(n.created_at)}</small>${!DEMO?` <button data-couple="pin-note" data-id="${n.id}">Ghim lời nhắn</button>`:''}${itsMine(n)?`<div class="place-actions" style="margin-top:9px"><button data-edit="notes:${n.id}">Sửa lời nhắn</button><button data-delete="notes:${n.id}">Xóa</button></div>`:''}</div>`).join('');
 modal('Những mẩu giấy yêu thương',rows||emptyState('Hũ kỷ niệm của hai người còn trống.','Thêm lời nhắn đầu tiên','notes')+'', 'MEMORY JAR',true);
}
function openGift(){const gifts=state.gifts.filter(g=>!g.locked&&(!g.unlock_at||new Date(g.unlock_at)<=new Date()||itsMine(g))).filter(g=>g.recipient_role===currentUser.role||itsMine(g));const g=gifts[0];if(!g){giftModal('Một điều nhỏ dành cho em',`<div style="text-align:center;padding:15px 5px"><div style="font-size:74px;color:var(--rose)">🎀</div><p class="handwritten" style="font-size:37px">A Lương ♡ CaPu</p><p class="modal-description">“Giữa hàng tỷ người, anh chỉ muốn cùng em viết nên câu chuyện của chúng mình.”</p><p style="font-size:11px;color:var(--muted)">Chưa có món quà bí mật nào được tạo. Hãy viết một lời nhắn dành riêng cho người thương nhé.</p><button class="btn btn-primary" data-add="gifts">Chuẩn bị bất ngờ ♡</button></div>`,'A LITTLE SURPRISE');return;}
 const giftTrack=youtubeId(g.music_youtube);
 giftModal(g.title,`<div class="letter-paper" style="text-align:center"><div style="font-size:62px;line-height:1.3">🎁</div><h3>For ${esc(person(g.recipient_role))} ♡</h3>${nl(g.message)}${attachment(g)}${giftTrack?`<div class="gift-music"><button type="button" class="btn btn-soft" data-action="gift-music" data-track="${giftTrack}">♫ Phát nhạc của món quà</button> <a href="${youtubeWatch(giftTrack)}" target="_blank" rel="noopener noreferrer">Mở trên YouTube ↗</a><div id="gift-music-embed"></div></div>`:''}<div class="signature">A little surprise, with love ♡</div></div>${itsMine(g)?`<div class="photo-tools"><button class="btn btn-soft" data-edit="gifts:${g.id}">Sửa quà và nhạc</button><button class="btn btn-outline" data-delete="gifts:${g.id}">Xóa món quà</button></div>`:''}`,'SPECIAL DELIVERY');}
function giftModal(title,body,eyebrow){
 const sparks=Array.from({length:12},(_,index)=>`<i style="--angle:${index*30}deg;--size:${5+index%4*3}px"></i>`).join('');
 modal(title,`<div class="gift-reveal"><div class="gift-sparks" aria-hidden="true">${sparks}</div>${body}
   <div class="form-actions"><button type="button" class="btn btn-soft" data-action="gift-games">Trò chơi cho hai đứa ♡</button></div>
 </div>`,eyebrow);
}

const giftQuestions=[
 'Nếu được sống lại một buổi đi chơi của hai đứa, bạn chọn buổi nào?',
 'Có thói quen nhỏ nào của người kia khiến bạn bật cười?',
 'Nếu tình yêu của hai đứa là một món ăn, nó sẽ là món gì?',
 'Kỷ niệm nào của tụi mình bạn muốn kể lại sau mười năm nữa?',
 'Có điều gì người kia làm gần đây khiến bạn thấy được quan tâm?',
 'Nếu cuối tuần này có trọn một buổi rảnh, bạn muốn hai đứa làm gì?',
 'Bài hát nào làm bạn nhớ ngay đến người kia?',
 'Hai đứa muốn học một điều mới nào cùng nhau?'
];
const giftDates=[
 'Đi dạo lúc hoàng hôn và mỗi người chụp ba tấm ảnh',
 'Cùng nấu một món chưa từng thử',
 'Chọn một quán mới rồi gọi món cho nhau',
 'Tạo playlist từ năm bài gợi nhớ về hai đứa',
 'Tổ chức một buổi xem phim với đồ ăn tự chuẩn bị',
 'Viết cho nhau một lá thư mở vào tháng sau',
 'Hẹn nhau ăn sáng và cất điện thoại trong một giờ',
 'Đi tìm một cuốn sách để tặng nhau'
];
function drawDifferent(items,previous){
 const choices=items.filter(item=>item!==previous);
 return choices[Math.floor(Math.random()*choices.length)];
}

function openGiftGames(){
 modal('Trò chơi cho hai đứa',`<div class="gift-game-menu">
   <button type="button" data-action="gift-questions"><span aria-hidden="true">✦</span><b>Bốc thẻ tâm sự</b><small>Thay phiên trả lời cùng một câu hỏi.</small></button>
   <button type="button" data-action="gift-memory"><span aria-hidden="true">♡</span><b>Lật thẻ tìm cặp</b><small>Tìm đủ sáu cặp trong ít lượt nhất.</small></button>
   <button type="button" data-action="gift-date"><span aria-hidden="true">✿</span><b>Bốc thăm hẹn hò</b><small>Chọn một ý tưởng và lưu vào kế hoạch chung.</small></button>
 </div>`);
}
function openGiftDraw(isDate){
 const title=isDate?'Bốc thăm hẹn hò':'Bốc thẻ tâm sự';
 modal(title,`<div class="gift-draw-card"><p id="gift-draw-result" role="status"></p></div><div class="form-actions">
   <button type="button" class="btn btn-outline" data-action="gift-games">Các trò chơi</button>
   <button type="button" class="btn btn-soft" id="gift-draw-next">${isDate?'Bốc ý tưởng khác':'Bốc câu hỏi khác'}</button>
   ${isDate?'<button type="button" class="btn btn-primary" id="gift-draw-save">Thêm vào kế hoạch</button>':''}
 </div>`);
 const result=$('#gift-draw-result');
 const draw=()=>{result.textContent=drawDifferent(isDate?giftDates:giftQuestions,result.textContent);};
 $('#gift-draw-next').addEventListener('click',draw);
 $('#gift-draw-save')?.addEventListener('click',()=>openForm('goals','',{title:result.textContent,category:'Hẹn hò'}));
 draw();
}
function openGiftMemory(){
 const deck=['🌷','🎁','🌙','✉️','🍓','⭐'].flatMap(symbol=>[symbol,symbol]);
 for(let i=deck.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [deck[i],deck[j]]=[deck[j],deck[i]];
 }
 modal('Lật thẻ tìm cặp',`<p id="gift-memory-status" role="status">0 / 6 cặp · 0 lượt</p>
   <div class="gift-memory-grid">${deck.map((_,i)=>`<button type="button" aria-label="Lật thẻ ${i+1}"><span aria-hidden="true">♡</span></button>`).join('')}</div>
   <div class="form-actions"><button type="button" class="btn btn-outline" data-action="gift-games">Các trò chơi</button><button type="button" class="btn btn-soft" data-action="gift-memory">Chơi lại</button></div>`);
 const grid=$('.gift-memory-grid'), status=$('#gift-memory-status');
 const cards=[...grid.querySelectorAll('button')];
 let first=null, pairs=0, turns=0, busy=false;
 const reveal=(index,visible)=>{
   const card=cards[index];
   card.classList.toggle('revealed',visible);
   card.firstElementChild.textContent=visible?deck[index]:'♡';
   card.setAttribute('aria-label',visible?`Thẻ ${index+1}: ${deck[index]}`:`Lật thẻ ${index+1}`);
 };
 cards.forEach((card,index)=>card.addEventListener('click',()=>{
   if(busy||card.disabled||index===first)return;
   reveal(index,true);
   if(first===null){first=index;return;}
   turns++;
   const previous=first;
   first=null;
   if(deck[previous]===deck[index]){
     pairs++;
     cards[previous].disabled=card.disabled=true;
   }else{
     busy=true;
     setTimeout(()=>{reveal(previous,false);reveal(index,false);busy=false;},680);
   }
   status.textContent=pairs===6?`Tìm đủ sáu cặp sau ${turns} lượt! ♡`:`${pairs} / 6 cặp · ${turns} lượt`;
 }));
}
function openPlace(id){const p=state.places.find(x=>x.id===id);if(!p)return;modal(p.name,`<div class="letter-paper"><h3>Our memory map ♡</h3>${nl(p.description||'Một nơi chờ chúng mình viết thêm câu chuyện.')}${attachment(p)}<p style="font-size:12px">${p.visited?'✓ Đã ghé thăm':'✧ Muốn ghé thăm'}${p.event_date?' · '+datefmt(p.event_date):''}</p></div><div class="form-actions" style="margin-top:20px"><a class="btn btn-outline" href="https://www.google.com/maps?q=${encodeURIComponent(p.lat+','+p.lng)}" target="_blank" rel="noopener noreferrer">Mở Google Maps ↗</a><button class="btn btn-soft" data-edit="places:${id}">Sửa</button></div>`,'PLACES & PROMISES');}
function formSettings(){
 const settings=state.settings;
 if(currentSettingsTab==='general'){
 return `<form id="settings-form" class="form-stack"><label>Ngày bắt đầu câu chuyện<input type="date" name="start_date" value="${esc(settings.start_date||'')}"/></label><label>Tên ngôi nhà kỷ niệm<input name="hero_title" maxlength="80" value="${esc(settings.hero_title||'')}" required/></label><label>Lời nhắn tại trang chủ<textarea name="hero_caption" maxlength="300">${esc(settings.hero_caption||'')}</textarea></label><label>Chủ đề<select name="theme"><option value="light" ${settings.theme==='light'?'selected':''}>Hồng kem — Romantic Light</option><option value="dark" ${settings.theme==='dark'?'selected':''}>Tím đêm — Romantic Dark</option></select></label><label>Màu chủ đạo<select name="accent">${Object.entries({peach:'Hồng đào',lavender:'Tím lavender',sky:'Xanh trời',cream:'Vàng kem'}).map(([value,label])=>`<option value="${value}" ${settings.accent===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Ảnh bìa chính<select name="cover_media_id"><option value="">Tranh minh hoạ mặc định</option>${state.media.filter(m=>isImg(m)&&m.purpose!=='sealed').map(m=>`<option value="${m.id}" ${settings.cover_media_id===m.id?'selected':''}>${esc(short(m.caption||m.original_name,45))}</option>`).join('')}</select></label><label class="demo-only">Ảnh đại diện A Lương<select name="avatar_owner_media_id"><option value="">Chữ A mặc định</option>${state.media.filter(m=>isImg(m)&&m.purpose!=='sealed').map(m=>`<option value="${m.id}" ${settings.avatar_owner_media_id===m.id?'selected':''}>${esc(short(m.caption||m.original_name,45))}</option>`).join('')}</select></label><label class="demo-only">Ảnh đại diện CaPu<select name="avatar_partner_media_id"><option value="">Chữ C mặc định</option>${state.media.filter(m=>isImg(m)&&m.purpose!=='sealed').map(m=>`<option value="${m.id}" ${settings.avatar_partner_media_id===m.id?'selected':''}>${esc(short(m.caption||m.original_name,45))}</option>`).join('')}</select></label><div class="music-volume-control"><label for="music-volume">Âm lượng nhạc nền</label> <output id="music-volume-value" for="music-volume">${Math.round($('#music-audio').volume*100)}%</output><input id="music-volume" type="range" min="0" max="100" value="${Math.round($('#music-audio').volume*100)}"></div><label>Bài mở đầu của nhạc nền<select name="music_media_id"><option value="">Dùng thứ tự tải lên</option>${state.media.filter(m=>m.mime?.startsWith('audio/')).map(m=>`<option value="${m.id}" ${settings.music_media_id===m.id?'selected':''}>${esc(m.original_name)}</option>`).join('')}</select></label><div class="form-actions"><button type="button" class="btn btn-outline" data-action="music-options">Tùy chọn nhạc</button><button type="button" class="btn btn-outline" data-action="upload-music">↑ Tải nhạc lên</button><button type="submit" class="btn btn-primary">Lưu cài đặt ♡</button></div></form><input type="file" accept="audio/mpeg,audio/wav" id="music-file-input" multiple hidden/>`;
 }
 if(currentSettingsTab==='people'){
 return `<div class="settings-note"><b>Chỉ hai người, một ngôi nhà.</b><br/>${DEMO?'Đây là bản xem trước ngoại tuyến. Khi chạy máy chủ, A Lương tạo tài khoản đầu tiên rồi mời CaPu đăng ký bằng liên kết riêng.':`Bạn đang đăng nhập với vai trò: ${esc(currentUser.display_name)}. Trang này không công khai ảnh hoặc thư tình.`}</div><div class="settings-actions"><button class="btn btn-primary" data-action="invite" ${DEMO||currentUser.role!=='owner'?'disabled':''}>✉ Tạo lời mời cho CaPu</button></div><div id="invite-result"></div><div class="settings-note">Lưu ý: liên kết sử dụng địa chỉ máy chủ hiện tại. Để CaPu vào từ điện thoại khác qua Internet, hãy triển khai website trên HTTPS và cấu hình domain riêng. Mã mời hết hạn sau 24 giờ.</div>`;
 }
 return `<div class="settings-note"><b>Quyền riêng tư và sao lưu</b><br/>${DEMO?'Bản demo lưu dữ liệu chỉ trong trình duyệt này bằng localStorage; không được dùng để lưu dữ liệu riêng tư quan trọng.':'Ảnh và nội dung riêng tư chỉ được gửi khi đã đăng nhập. Máy chủ dùng Argon2 cho mật khẩu, cookie phiên HttpOnly và kiểm tra quyền cho mỗi yêu cầu.'}</div><div class="settings-actions"><button class="btn btn-primary" data-action="export">↓ Xuất bản sao kỷ niệm</button><button class="btn btn-outline" data-action="logout" ${DEMO?'disabled':''}>Đăng xuất</button></div><p class="modal-description">Bản sao giúp giữ lại nội dung khi bạn chuyển máy chủ. Hãy cất bản sao ở nơi riêng tư.</p>`;
}
function openSettings(tab='general'){currentSettingsTab=tab;modal('Góc chỉnh sửa của chúng mình',`<div class="settings-tabs"><button data-settingstab="general" class="${tab==='general'?'active':''}">Giao diện</button><button data-settingstab="people" class="${tab==='people'?'active':''}">Hai người</button><button data-settingstab="backup" class="${tab==='backup'?'active':''}">Sao lưu</button></div>${!DEMO&&tab==='people'?`<form id="profile-form" class="form-stack">
 <label>Tên hiển thị<input name="display_name" value="${esc(currentUser.display_name)}" maxlength="60" required></label>
 <label>Biệt danh<input name="nickname" value="${esc(currentUser.nickname)}" maxlength="60"></label>
 <label><input name="auto_avatar" type="checkbox" ${currentUser.auto_avatar?'checked':''}> Tự dùng ảnh hồ sơ mới làm avatar khi tải lên</label>
 <div class="form-actions"><button type="button" class="btn btn-soft" data-couple="avatar">Tải và cắt ảnh</button><button type="submit" class="btn btn-primary">Lưu hồ sơ</button></div></form><div class="settings-actions"><button class="btn btn-outline" type="button" data-action="password">Đổi mật khẩu</button></div>`:''}${!DEMO&&tab==='people'&&state.google_enabled?'<button class="btn btn-outline" type="button" data-action="link-google">Liên kết tài khoản Google</button>':''}${formSettings()}`,'PRIVATE LITTLE CORNER');}

function openPasswordForm(){
 modal('Đổi mật khẩu', `<form id="password-form" class="form-stack">
   <label>Mật khẩu hiện tại<input name="current_password" type="password" autocomplete="current-password" maxlength="200" required></label>
   <label>Mật khẩu mới<input name="new_password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required></label>
   <label>Nhập lại mật khẩu mới<input name="confirmation" type="password" autocomplete="new-password" minlength="10" maxlength="200" required></label>
   <p class="modal-description">Bạn sẽ cần đăng nhập lại trên mọi thiết bị sau khi đổi mật khẩu.</p>
   <p class="modal-description" data-password-error role="alert"></p>
   <div class="form-actions"><button type="button" class="btn btn-outline" data-settingstab="people">Quay lại</button><button type="submit" class="btn btn-primary">Lưu mật khẩu</button></div>
 </form>`);
}

const companionLines={
 owner:['Chào mừng hai đứa về nhà.','Hôm nay mình giữ một kỷ niệm nhỏ nhé.','Đèn bên này sáng rồi, Pu có thấy không?'],
 partner:['Pu tới rồi, mình thắp đèn lên nhé!','Hôm nay có chuyện gì muốn kể cho nhau không?','Mình đem theo một cái ôm nè.']
};
function companionPortrait(role){
 return `<span class="companion-creature ${role==='owner'?'otter':'momonga'}" aria-hidden="true"></span>`;
}
const companionNames={owner:'Rái cá',partner:'Momonga'};
const companionTurns={owner:0,partner:-1};
function companionLine(role){
 const lines=companionLines[role];
 companionTurns[role]=(companionTurns[role]+1)%lines.length;
 return lines[companionTurns[role]];
}
function greetCompanion(role){
 const court=$('.auth-courtyard');
 court.dataset.side=role;
 court.querySelectorAll('[data-companion]').forEach(button=>
   button.setAttribute('aria-pressed',String(button.dataset.companion===role)));
 court.querySelector('.auth-dialogue').textContent=companionNames[role]+' · '+companionLine(role);
}
function editPerson(role){
 const profile=profileFor(role);
 if(!profile)return;
 modal('Hồ sơ của '+profile.display_name,`<form id="profile-form" class="form-stack">
   <input type="hidden" name="role" value="${esc(role)}">
   ${profile===state.pending_partner?'<p class="modal-description">Pu chưa đăng ký. Hồ sơ này sẽ được dùng khi Pu tham gia.</p>':''}
   <label>Tên hiển thị<input name="display_name" value="${esc(profile.display_name)}" required maxlength="60"></label>
   <label>Biệt danh<input name="nickname" value="${esc(profile.nickname)}" maxlength="60"></label>
   <div class="form-actions">${profile===state.pending_partner?'<button type="button" class="btn btn-outline" data-settingstab="people">Mời Pu tham gia</button>':''}<button type="submit" class="btn btn-primary">Lưu hồ sơ</button></div>
 </form>`);
}

function openMemoryTrash(){
 const items=state.memory_trash||[];
 const list=items.map(item=>`<div class="settings-actions"><span>${esc(item.title)} · ${esc(datefmt(item.deleted_at))}</span><button type="button" class="btn btn-outline" data-action="restore-memory" data-id="${esc(item.id)}">Khôi phục</button></div>`).join('');
 modal('Thùng rác kỷ niệm',list||'<p class="modal-description">Chưa có kỷ niệm nào trong thùng rác.</p>');
}

function normalizeSearch(value){
 return String(value ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replaceAll('đ','d');
}

function openSearch(){
 modal('Tìm nội dung', `<div class="form-stack">
   <label>Từ khóa<input id="content-search" type="search" maxlength="150" placeholder="Tên, nội dung hoặc địa điểm"></label>
   <p id="search-status" class="modal-description" role="status">Tìm kỷ niệm, ảnh, thư tình, lịch, lời nhắn và kế hoạch.</p>
   <div id="search-results"></div>
 </div>`);
 const sources = [
   [state.memories, 'Kỷ niệm', 'memory', 'title', ['body','location']],
   [state.albums, 'Album', 'album', 'title', ['description']],
   [state.media.filter(m=>(!m.purpose||m.purpose==='gallery')&&(isImg(m)||m.mime.startsWith('video/'))), 'Ảnh và video', 'photo', 'original_name', ['caption']],
   [state.letters.filter(l=>itsMine(l)||(!DEMO?true:l.recipient_role===currentUser.role&&l.status!=='draft')), 'Thư tình', 'letter', 'title', ['body']],
   [state.places, 'Địa điểm', 'place', 'name', ['description']],
   [state.notes, 'Lời nhắn', 'note', 'body', ['mood']],
   [state.goals, 'Kế hoạch', 'goal', 'title', ['category']],
   [state.events, 'Lịch', 'event', 'title', ['details','location','event_date']]
 ];
 const entries = sources.flatMap(([items,label,kind,title,fields])=>items.map(item=>{
   const visibleFields = (item.locked||(kind==='letter'&&DEMO&&!itsMine(item)&&item.unlock_at&&new Date(item.unlock_at)>new Date())) ? [] : fields;
   const text = normalizeSearch([item[title], ...visibleFields.map(field=>item[field])].join(' '));
   return {item,label,kind,title,text};
 }));
 $('#content-search').addEventListener('input', event=>{
   const query = normalizeSearch(event.target.value).trim();
   const results = query ? entries.filter(entry=>query.split(/\s+/).every(word=>entry.text.includes(word))) : [];
   $('#search-status').textContent = !query ? 'Nhập từ khóa để tìm nội dung.' : results.length
     ? `Hiển thị ${Math.min(50,results.length)}/${results.length} kết quả.` : 'Không tìm thấy nội dung phù hợp.';
   $('#search-results').replaceChildren(...results.slice(0,50).map(({item,label,kind,title})=>{
     const button = el('button', {class:'btn btn-outline',type:'button'}, `${label} · ${short(kind==='photo'&&item.caption||item[title],80)}`);
     button.addEventListener('click',()=>{
       if(kind==='photo')openPhoto(item.id);
       if(kind==='letter')openLetter(item.id);
       if(kind==='place')openPlace(item.id);
       if(kind==='note')modal('Lời nhắn', `<div class="letter-paper">${nl(item.body)}</div>`);
       if(kind==='goal')modal(item.title, `<p class="modal-description">${esc(item.category||'Cùng nhau')} · ${item.done?'Đã hoàn thành':'Chưa hoàn thành'}</p>${attachment(item)}`);
       if(kind==='event')modal(item.title, `<p class="modal-description">${esc(datefmt(item.event_date))}${item.location?' · '+esc(item.location):''}</p><p>${nl(item.details)}</p>${attachment(item)}`);
       if(kind==='album'){activeAlbum=item.id;renderGallery();sectionScroll('gallery');}
       if(kind==='memory'){
         closeModal();
         const entry = document.getElementById('memory-'+item.id);
         entry?.focus({preventScroll:true});
         entry?.scrollIntoView({block:'center'});
       }
     });
     return button;
   }));
 });
}
async function saveUpload(file,purpose='gallery'){
 if(DEMO){
   if(!file.type.startsWith('image/'))throw Error('Bản xem trước chỉ hỗ trợ tải ảnh.');
   const data=await shrinkImage(file);
   const item={id:uuid(),mime:'image/jpeg',data,original_name:file.name,caption:'',album_id:null,
     size:Math.floor(data.length*.75),created_by:currentUser.id,created_at:now(),purpose};
   state.media.unshift(item);
   saveDemo();
   return item;
 }
 const body=new FormData();
 body.append('file',file);
 return api('/upload?purpose='+purpose,{method:'POST',body});
}
async function uploadFiles(files,kind='gallery'){
 const permitted=kind==='music'?['audio/mpeg','audio/wav']:['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
 let n=0;
 const uploadedTracks=[];
 for(const file of [...files]){
  if(!permitted.includes(file.type)){alertToast('Định dạng này chưa được hỗ trợ: '+file.name);continue;}
  try {
    const uploaded=await saveUpload(file);
    if(kind==='music')uploadedTracks.push(uploaded.id);
    n++;
  }catch(e){alertToast(e.message);}
 }
 if(uploadedTracks.length){
   const existing=[state.settings.music_media_id,...(state.settings.music_media_ids||'').split(/\s+/)].filter(Boolean);
   await patchSettings({music_media_ids:[...new Set([...existing,...uploadedTracks])].join('\n')});
 }
 if(n){await reload();alertToast(`Đã lưu ${n} ${kind==='music'?'bản nhạc':'khoảnh khắc'} ♡`);}
}
async function shrinkImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const c=document.createElement('canvas');const scale=Math.min(1,1100/img.width,1100/img.height);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.7));};img.src=reader.result;};reader.readAsDataURL(file);});}
async function exportData(){
 try{if(DEMO){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});downloadBlob(blob,'A-Luong-CaPu-Preview-Backup.json');}else{const res=await api('/export');downloadBlob(await res.blob(),'A-Luong-CaPu-Backup.zip');}alertToast('Đã tạo bản sao lưu kỷ niệm ♡');}catch(e){alertToast(e.message);}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function photoSave(form){const id=form.dataset.id,caption=new FormData(form).get('caption')||'',album_id=new FormData(form).get('album_id')||'';if(DEMO){const item=state.media.find(m=>m.id===id);item.caption=caption;item.album_id=album_id||null;await reload();}else{await api('/media/'+id,{method:'PATCH',body:JSON.stringify({caption,album_id})});await reload();}closeModal();alertToast('Đã cập nhật ảnh kỷ niệm ♡');}
async function deletePhoto(id){if(!confirm('Xóa ảnh này vĩnh viễn?'))return;if(DEMO){state.media=state.media.filter(m=>m.id!==id);for(const key of Object.keys(HERO_FRAMES))if(state.settings[key]===id)state.settings[key]='';await reload();}else{await api('/media/'+id,{method:'DELETE'});await reload();}closeModal();alertToast('Đã xóa ảnh theo yêu cầu.');}
async function handleAction(action,btn){
 switch(action){
 case 'close-modal':closeModal();break;
 case 'settings':openSettings();break;
 case 'edit-person':if(!DEMO)editPerson(btn.dataset.role);break;
 case 'greet-companion':greetCompanion(btn.dataset.companion);break;
 case 'companion-dialogue':{
   const role=btn.dataset.companion;
   modal(companionNames[role],`<div class="companion-message">${companionPortrait(role)}<p>${esc(companionLine(role))}</p></div>
   ${DEMO?'':'<div class="form-actions"><button class="btn btn-primary" data-action="companion-chat">Mở tin nhắn</button></div>'}`);
   break;
 }
 case 'companion-chat':sectionScroll('chat');location.hash='chat';$('#chat-text')?.focus({preventScroll:true});break;
 case 'search':openSearch();break;
 case 'memory-trash':if(!DEMO)openMemoryTrash();break;
 case 'restore-memory':
   btn.disabled=true;
   try{
     await api('/memories/'+encodeURIComponent(btn.dataset.id)+'/restore',{method:'POST'});
     await reload();
     if($('#modal-body').contains(btn))openMemoryTrash();
     alertToast('Đã khôi phục kỷ niệm.');
   }finally{btn.disabled=false;}
   break;
 case 'password':if(!DEMO)openPasswordForm();break;
 case 'link-google':{const start=await api('/auth/google/link',{method:'POST'});location.assign(start.url);break;}
 case 'hero-photo':openHeroPhoto(btn.dataset.frame);break;
 case 'love-date': {
   modal('Ngày bắt đầu yêu', `<form id="love-date-form" class="form-stack">
     <label>Ngày bắt đầu yêu<input type="date" name="start_date" value="${esc(state.settings.start_date.slice(0,10))}" required></label>
     <div class="form-actions"><button type="submit" class="btn btn-primary">Lưu ngày yêu ♡</button></div>
   </form>`);
   break;
 }
 case 'theme':await patchSettings({theme:state.settings.theme==='light'?'dark':'light'});break;
 case 'menu':setMobileMenu($('#mobile-nav').classList.contains('hidden'));break;
 case 'upload':$('#file-input').click();break;
 case 'new-letter':openForm('letters');break;
 case 'random-note':openRandomNote();break;
 case 'all-notes':openAllNotes();break;
 case 'open-gift':openGift();break;
 case 'gift-games':openGiftGames();break;
 case 'gift-questions':openGiftDraw(false);break;
 case 'gift-date':openGiftDraw(true);break;
 case 'gift-memory':openGiftMemory();break;
 case 'scroll-gallery':sectionScroll('gallery');break;
 case 'scroll-story':sectionScroll('story');break;
 case 'set-cover':await patchSettings({cover_media_id:btn.dataset.id});closeModal();alertToast('Đã thay ảnh bìa của hai người ♡');break;
 case 'delete-photo':await deletePhoto(btn.dataset.id);break;
 case 'export':await exportData();break;
 case 'music':{
  if(!audioTracks.length){openMusicSettings();alertToast('Tải tệp MP3 hoặc WAV để dùng nhạc nền.');break;}
  if(!$('#music-audio').paused){stopMusic();break;}
  backgroundEnabled=true;await playUploaded();break;
 }
 case 'music-options':closeModal();$('#music-panel').hidden=false;break;
 case 'close-music':$('#music-panel').hidden=true;$('#music-embed').replaceChildren();break;
 case 'edit-music':openMusicSettings();break;
 case 'previous-song':playYoutube(-1);break;
 case 'next-song':playYoutube(1);break;
 case 'play-youtube':playYoutube();break;
 case 'play-uploaded':{
  const audio=$('#music-audio');if(!audio.paused){stopMusic();break;}
  stopMusic();backgroundEnabled=true;$('#gift-music-embed')?.replaceChildren();
  try{await playUploaded();}
  catch{alertToast('Trình duyệt chưa phát được tệp nhạc.');}break;
 }
 case 'gift-music':{
  const id=youtubeId(btn.dataset.track);if(!id)break;
  stopMusic();embedMusic($('#gift-music-embed'),[id],false);break;
 }
 case 'upload-music':$('#music-file-input')?.click();break;
 case 'invite':{
  if(DEMO)return alertToast('Mời người yêu chỉ khả dụng trên máy chủ thực.');const data=await api('/invite',{method:'POST'});const base=location.origin+'/';const inviteLink=base+'?invite='+encodeURIComponent(data.token);
  $('#invite-result').innerHTML=`<p class="modal-description">Liên kết đăng ký CaPu (có hiệu lực 24 giờ):</p><div class="invite-box">${esc(inviteLink)}</div><div class="settings-actions"><button class="btn btn-soft" data-action="copy-invite">Sao chép lời mời</button></div>`;$('#invite-result').dataset.link=inviteLink;break;}
 case 'copy-invite':{const link=$('#invite-result')?.dataset.link||'';try{await navigator.clipboard.writeText(link);alertToast('Đã sao chép liên kết ♡');}catch{alertToast('Hãy chọn và sao chép liên kết trong hộp phía trên.');}break;}
 case 'logout':{if(DEMO)return;await api('/auth/logout',{method:'POST'});location.reload();break;}
 }
}
async function runClick(e){
 const target=e.target.closest('button,[data-action],[data-photo],[data-letter],[data-place],[data-add],[data-edit],[data-delete],[data-filter],[data-check],[data-settingstab]');if(!target)return;
 const button=target;try{
  if(button.dataset.action){await handleAction(button.dataset.action,button);return;}
  if(button.dataset.add){openForm(button.dataset.add);return;}
  if(button.dataset.edit){const [table,id]=button.dataset.edit.split(':');openForm(table,id);return;}
  if(button.dataset.delete){const [table,id]=button.dataset.delete.split(':');await deleteItem(table,id);closeModal();return;}
  if(button.dataset.photo){openPhoto(button.dataset.photo);return;}
  if(button.dataset.letter){openLetter(button.dataset.letter);return;}
  if(button.dataset.place){openPlace(button.dataset.place);return;}
  if(button.dataset.filter){activeAlbum=button.dataset.filter;renderGallery();return;}
  if(button.dataset.check){const item=state.goals.find(x=>x.id===button.dataset.check);await patchItem('goals',item.id,{done:!item.done,completed_at:!item.done?now():''});return;}
  if(button.dataset.settingstab){openSettings(button.dataset.settingstab);return;}
 }catch(err){alertToast(err.message||'Có lỗi xảy ra.');}
}
async function runSubmit(e){const form=e.target;
 if(form.id==='password-form'){
   e.preventDefault();
   const button=form.querySelector('[type=submit]');
   if(button.disabled)return;
   const {current_password,new_password,confirmation}=Object.fromEntries(new FormData(form));
   const error=form.querySelector('[data-password-error]');
   if(new_password!==confirmation){error.textContent='Hai mật khẩu mới không khớp.';return;}
   button.disabled=true;
   error.textContent='';
   try{
     await api('/auth/password',{method:'POST',body:JSON.stringify({current_password,new_password})});
     location.reload();
   }catch(err){error.textContent=err.message;button.disabled=false;}
   return;
 }
 if(form.id==='auth-form'){e.preventDefault();$('#auth-error').classList.add('hidden');const values=Object.fromEntries(new FormData(form));const b=$('#auth-submit');b.disabled=true;b.textContent='Đang mở cánh cửa nhỏ...';try{const url=authMode==='login'?'/auth/login':'/auth/register';await api(url,{method:'POST',body:JSON.stringify(values)});const address=new URL(location.href);if(address.searchParams.has('invite')){address.searchParams.delete('invite');history.replaceState(null,'',address);}const data=await api('/data');state=data;currentUser=data.user;csrf=data.csrf;$('#auth-screen').classList.add('hidden');showApp();}catch(err){const a=$('#auth-error');a.textContent=err.message;a.classList.remove('hidden');}finally{b.disabled=false;b.textContent=authMode==='login'?'Đăng nhập ↗':'Tạo không gian kỷ niệm ↗';}return;}
 if(form.id==='music-settings-form'){
   e.preventDefault();
   const button=form.querySelector('[type=submit]');
   if(button.disabled)return;
   button.disabled=true;
   try{
     const lines=form.elements.youtube_playlist.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
     const ids=lines.map(youtubeId);
     if(ids.length>30 || ids.includes(''))throw Error('Hãy nhập tối đa 30 liên kết video YouTube hợp lệ.');
     await patchSettings({youtube_playlist:[...new Set(ids)].join('\n'),youtube_loop:form.elements.youtube_loop.checked?'yes':'no'});
     closeModal();alertToast('Đã lưu danh sách nhạc ♡');
   }catch(err){alertToast(err.message);}
   finally{button.disabled=false;}
   return;
 }
 if(form.id==='hero-photo-form'){
   e.preventDefault();
   const button=form.querySelector('button');
   if(button.disabled)return;
   button.disabled=true;
   try {
     const file=form.elements.photo.files[0];
     if(file && form.uploadedPhoto?.file!==file)form.uploadedPhoto={file,id:(await saveUpload(file)).id};
     const id=file ? form.uploadedPhoto.id : form.elements.media_id.value;
     await patchSettings({[form.dataset.frame]:id});
     closeModal();
     alertToast('Đã lưu ảnh cho khung ♡');
   } catch(err) { alertToast(err.message); }
   finally { button.disabled=false; }
   return;
 }
 if(form.id==='love-date-form'){
   e.preventDefault();
   const button=form.querySelector('button');
   if(button.disabled)return;
   button.disabled=true;
   try {
     await patchSettings({start_date:form.elements.start_date.value});
     closeModal();
     alertToast('Đã lưu ngày bắt đầu yêu ♡');
   } catch(err) { alertToast(err.message); }
   finally { button.disabled=false; }
   return;
 }
 if(form.id==='profile-form'){
   e.preventDefault();
   const values=Object.fromEntries(new FormData(form));
   if(form.elements.auto_avatar)values.auto_avatar=form.elements.auto_avatar.checked;
   try{
     await api('/profile',{method:'PATCH',body:JSON.stringify(values)});
     await reload(); closeModal(); alertToast('Đã lưu hồ sơ ♡');
   }catch(err){alertToast(err.message);}
   return;
 }
 if(form.id==='item-form'){e.preventDefault();await submitItem(form);return;}
 if(form.id==='photo-form'){e.preventDefault();try{await photoSave(form);}catch(err){alertToast(err.message);}return;}
 if(form.id==='settings-form'){e.preventDefault();const vals=Object.fromEntries(new FormData(form));if(!DEMO){delete vals.avatar_owner_media_id;delete vals.avatar_partner_media_id;}try{await patchSettings(vals);closeModal();alertToast('Đã lưu cài đặt ♡');}catch(err){alertToast(err.message);}return;}
}
function setupAuth(status){$('#auth-screen').classList.remove('hidden');$('#app').classList.add('hidden');authInvite=new URLSearchParams(location.search).get('invite')||'';authMode=status.setup_needed||authInvite?'register':'login';$('#invite-input').value=authInvite;const needsCode=!!status.owner_setup_required;$('#setup-code-label').classList.toggle('hidden',!needsCode);$('#invite-input').type=needsCode?'text':'hidden';
 $('#auth-intro').textContent=status.setup_needed?'Chào A Lương! Hãy tạo tài khoản đầu tiên để mở ngôi nhà kỷ niệm.':authInvite?'CaPu ơi, A Lương đã gửi em một lời mời vào thế giới nhỏ của hai người.':'Chỉ hai người có chìa khóa để mở ngôi nhà kỷ niệm này.';
 $('#auth-submit').textContent=authMode==='register'?'Tạo không gian kỷ niệm ↗':'Đăng nhập ↗';
 $('#google-login').hidden=!status.google_enabled||authMode==='register';
 const googleResult=new URLSearchParams(location.search).get('google');
 if(googleResult==='unlinked'||googleResult==='error'){const box=$('#auth-error');box.textContent=googleResult==='unlinked'?'Google này chưa liên kết. Hãy đăng nhập bằng mật khẩu rồi vào Cài đặt → Hai người.':'Chưa thể đăng nhập Google. Hãy thử lại.';box.classList.remove('hidden');}
 $('#auth-foot').textContent=status.setup_needed?'A Lương tạo tài khoản đầu tiên. Sau đó mời CaPu qua liên kết riêng.':authInvite?'Lời mời chỉ sử dụng một lần và có thời hạn 24 giờ.':'Chỉ A Lương và CaPu mới có thể bước vào đây. ♡';
}
async function init(){
 if(!DEMO)couple=window.createCoupleTools({api,$,esc,toast:alertToast,attachment,getState:()=>state,getUser:()=>currentUser,patchSettings,modal,closeModal,createItem,currentTime});
 const musicAudio=$('#music-audio');
 try{
   const saved=localStorage.getItem(musicVolumeKey);
   if(saved!==null&&Number.isFinite(Number(saved)))musicAudio.volume=Math.max(0,Math.min(1,Number(saved)));
 }catch{}
 document.addEventListener('input',event=>{
   if(event.target.id!=='music-volume')return;
   const percent=Number(event.target.value);
   musicAudio.volume=percent/100;
   $('#music-volume-value').textContent=percent+'%';
   try{localStorage.setItem(musicVolumeKey,String(musicAudio.volume));}catch{}
 });
 musicAudio.addEventListener('play',updateSpeaker);
 musicAudio.addEventListener('pause',updateSpeaker);
 musicAudio.addEventListener('ended',()=>{
   if(!audioTracks.length)return;
   selectAudio((currentAudioIndex+1)%audioTracks.length);
   tryBackgroundMusic();
 });
 const retryMusic=event=>{
   if(waitingForGesture&&!event.target.closest('[data-action=music],[data-action=gift-music],[data-action=play-youtube],[data-action=play-uploaded]')){
     waitingForGesture=false;
     tryBackgroundMusic();
   }
 };
 document.addEventListener('click',retryMusic);
 document.addEventListener('keydown',event=>{if(!event.repeat&&event.key!=='Escape')retryMusic(event);});
 updateBackgroundTracks(ambientTracks);
 $('#music-track').addEventListener('change',updateMusicLink);
 initPetals();document.addEventListener('click',runClick);document.addEventListener('submit',runSubmit);
 $('#file-input').addEventListener('change',async e=>{await uploadFiles(e.target.files);e.target.value='';});
 document.addEventListener('change',async e=>{if(e.target.id==='music-file-input'){const editingPlaylist=!!$('#music-settings-form');try{await uploadFiles(e.target.files,'music');if(!editingPlaylist)openSettings();}catch(err){alertToast(err.message);}finally{e.target.value='';}}});
 $('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();if(!$('#mobile-nav').classList.contains('hidden')){setMobileMenu(false);$('.mobile-menu').focus();}}if((e.key==='Enter'||e.key===' ')&&e.target.matches('.letter-envelope')){e.preventDefault();openForm('letters');}});
 $('#mobile-nav').addEventListener('click',e=>{if(e.target.closest('a'))setMobileMenu(false);});
 window.addEventListener('resize',()=>{if(!$('.mobile-menu').getClientRects().length)setMobileMenu(false);});
 window.addEventListener('scroll',()=>$('#navbar')?.classList.toggle('shrink',scrollY>40),{passive:true});
 if(DEMO){loadDemo();$('#auth-screen').classList.add('hidden');$('#demo-ribbon').classList.remove('hidden');showApp();}
 else{try{const status=await api('/auth/status');if(status.logged_in){state=await api('/data');currentUser=state.user;csrf=state.csrf;showApp();const googleResult=new URLSearchParams(location.search).get('google');if(googleResult){alertToast(googleResult==='linked'?'Đã liên kết tài khoản Google':'Chưa thể liên kết Google. Hãy thử lại.');const url=new URL(location.href);url.searchParams.delete('google');history.replaceState(null,'',url);}}else setupAuth(status);}catch(err){setupAuth({setup_needed:false});$('#auth-error').textContent=err.message;$('#auth-error').classList.remove('hidden');}}
 clockTimer=setInterval(()=>{if(!$('#app').classList.contains('hidden')&&state.settings)renderCounter();},1000);
 if(!DEMO){
   const syncClock=async()=>{
     const sent=performance.now();
     try{
       const {utc}=await api('/time');
       const epoch=Date.parse(utc),received=performance.now();
       if(Number.isFinite(epoch))serverClock={epoch:epoch+(received-sent)/2,received};
     }catch{}
   };
   syncClock();
   setInterval(syncClock,5*60*1000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncClock();});
   setInterval(refreshShared,5000);
   document.addEventListener('visibilitychange',refreshShared);
   window.addEventListener('online',refreshShared);
 }
}
init();
})();
