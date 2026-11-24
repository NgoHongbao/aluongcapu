'use strict';
window.createCoupleTools = ({api, $, esc, toast, attachment, getState, getUser, patchSettings, modal, closeModal, createItem}) => {
  const messages = new Map();
  let socket, catchup, pending, reply, editing, connected = false, unread = 0;
  let calendarView = 'list', calendarMonth = vietnamDay().slice(0, 7);
  const reminders = new Set();
  const order = () => [...messages.values()].sort((a,b) => a.created_at.localeCompare(b.created_at));
  const photo = (id, thumb = false) => '/api/media/' + encodeURIComponent(id) + (thumb ? '?thumb=true' : '');
  const name = id => getState().users?.find(user => user.id === id)?.display_name || 'Người thương';
  const chatVisible = () => location.hash === '#chat' && document.visibilityState === 'visible';
  const sendStatus = value => { $('#chat-status').textContent = value; };

  function drawChat() {
    const list = $('#chat-messages');
    const keepBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    list.innerHTML = order().map(m => {
      const mine = m.created_by === getUser().id;
      const actions = m.deleted ? '' : `<div class="chat-actions"><button data-couple="reply" data-id="${m.id}">Trả lời</button>
        <button data-couple="pin-msg" data-id="${m.id}">Ghim</button>${['❤️','🥰','😂','✨'].map(emoji => `<button aria-label="Thả ${emoji}" data-couple="react" data-id="${m.id}" data-emoji="${emoji}">${emoji}</button>`).join('')}
        ${mine ? `<button data-couple="edit" data-id="${m.id}">Sửa</button> <button data-couple="delete" data-id="${m.id}">Xóa</button>` : ''}</div>`;
      const quote = messages.get(m.reply_to);
      const url = m.url ? new URL(m.url) : null;
      return `<article class="chat-message ${mine?'mine':''}"><small>${esc(name(m.created_by))} · ${new Date(m.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'})}</small>
        ${m.reply_to && !m.deleted ? `<blockquote>${esc(quote?.text || 'Tin nhắn được trả lời')}</blockquote>` : ''}
        <div class="chat-text">${m.deleted ? 'Tin nhắn đã được xóa' : esc(m.text)}</div>
        ${m.media_id ? `<a href="${photo(m.media_id)}" target="_blank" rel="noopener"><img loading="lazy" src="${photo(m.media_id,true)}" alt="Ảnh đính kèm"></a><button data-couple="avatar" data-id="${m.media_id}">Dùng làm avatar</button>` : ''}
        ${url ? `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(url.hostname)} ↗</a>` : ''}
        <small>${esc([m.reaction_owner,m.reaction_partner].filter(Boolean).join(' '))} ${m.edited_at && !m.deleted?'· Đã sửa':''} ${mine&&!m.deleted?(m.read_at?'· Đã đọc':'· Đã gửi'):''}</small>${actions}</article>`;
    }).join('') || '<p>Chưa có tin nhắn. Gửi lời chào đầu tiên nhé.</p>';
    if (keepBottom) list.scrollTop = list.scrollHeight;
  }

  function seen() {
    if (!chatVisible() || !unread || !order().length) return;
    api('/chat/read?through=' + encodeURIComponent(order().at(-1).created_at), {method:'POST'}).catch(e => sendStatus(e.message));
  }

  function ingest(page, notify = false) {
    if (notify && page.unread > unread && !chatVisible()) toast('Bạn có tin nhắn mới ♡');
    unread = page.unread;
    document.querySelectorAll('.chat-count').forEach(node => { node.textContent = unread ? ' ('+unread+')' : ''; });
    for (const m of page.messages) messages.set(m.id, m);
    drawChat();
    seen();
  }

  function connect() {
    if (socket || !getState().user) return;
    socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/chat/live');
    socket.onopen = () => { sendStatus('Đã kết nối'); };
    socket.onmessage = async event => {
      const page = JSON.parse(event.data);
      if (!connected) {
        const latest = order().at(-1);
        if (latest && page.has_more) {
          try {
            let after = latest.created_at, more;
            do {
              const missed = await api('/chat?after=' + encodeURIComponent(after));
              for (const m of missed.messages) messages.set(m.id,m);
              after = missed.messages.at(-1)?.created_at || after;
              more = missed.has_more;
            } while (more);
          } catch (err) { sendStatus(err.message); }
        }
        $('#chat-older').hidden = !page.has_more;
      }
      ingest(page, connected || messages.size > 0);
      connected = true;
    };
    socket.onclose = event => {
      socket = null;
      connected = false;
      sendStatus(event.code === 1008 ? 'Phiên đã hết hạn. Hãy tải lại trang.' : 'Mất kết nối. Đang thử lại…');
      if (event.code !== 1008) catchup = setTimeout(connect, 2000);
    };
  }

  function write(path, method, value) {
    return api(path, {method, ...(value === undefined ? {} : {body: JSON.stringify(value)})});
  }

  async function upload(file, purpose) {
    const body = new FormData();
    body.append('file', file);
    return api('/upload?purpose=' + purpose, {method:'POST', body});
  }

  function clearCompose() {
    reply = editing = pending = null;
    $('#chat-form').reset();
    $('#chat-context').textContent = '';
    $('#chat-retry').hidden = true;
  }

  async function send() {
    const form = $('#chat-form');
    const button = form.querySelector('button[type=submit]');
    if (button.disabled) return;
    button.disabled = true;
    sendStatus('Đang gửi…');
    try {
      const data = new FormData(form);
      if (editing) {
        await write('/chat/' + editing, 'PATCH', {text: data.get('text')});
      } else {
        if (!pending) {
          const file = data.get('photo');
          pending = {
            file, client_id: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join(''),
            text: data.get('text'), url: data.get('url'), reply_to: reply || '', media_id: ''
          };
        }
        const {file, ...payload} = pending;
        if (file.size && !payload.media_id) payload.media_id = pending.media_id = (await upload(file,'chat')).id;
        const m = await write('/chat', 'POST', payload);
        messages.set(m.id,m);
        drawChat();
      }
      clearCompose();
      sendStatus('Đã lưu tin nhắn');
    } catch (err) {
      $('#chat-retry').hidden = !pending;
      sendStatus(err.message);
    } finally { button.disabled = false; }
  }

  async function avatar(source, role = getUser().role) {
    const photos = getState().media.filter(item => item.mime.startsWith('image/') && (!item.purpose || item.purpose === 'gallery'));
    const displayName = getState().users.find(user=>user.role===role)?.display_name || (role==='partner'?'Pu':'A Lương');
    modal('Ảnh đại diện của ' + displayName, `<form id="avatar-crop" class="form-stack">
      ${source ? '' : '<label>Tải ảnh<input name="source" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>'}
      ${!source && photos.length ? `<label>Hoặc chọn ảnh trong album<select name="album_photo"><option value="">Chọn ảnh</option>${photos.map(item=>`<option value="${esc(item.id)}">${esc(item.caption || item.original_name)}</option>`).join('')}</select></label>` : ''}
      <canvas id="avatar-preview" width="320" height="320" aria-label="Xem trước ảnh đại diện"></canvas>
      <label>Thu phóng<input name="zoom" type="range" min="1" max="3" value="1" step=".05"></label>
      <label>Vị trí ngang<input name="x" type="range" min="0" max="1" value=".5" step=".05"></label>
      <label>Vị trí dọc<input name="y" type="range" min="0" max="1" value=".5" step=".05"></label>
      <button type="submit" class="btn btn-primary" disabled>Lưu ảnh đã cắt</button>
    </form>`);
    const form = $('#avatar-crop'), canvas = $('#avatar-preview'), img = new Image();
    let objectUrl;
    const button = form.querySelector('button');
    function draw() {
      if (!img.naturalWidth) return;
      const size = Math.min(img.naturalWidth,img.naturalHeight) / Number(form.elements.zoom.value);
      canvas.getContext('2d').drawImage(img,(img.naturalWidth-size)*Number(form.elements.x.value),
        (img.naturalHeight-size)*Number(form.elements.y.value),size,size,0,0,320,320);
      button.disabled = false;
    }
    img.onload = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); draw(); };
    img.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); toast('Không mở được ảnh.'); };
    form.addEventListener('input', e => {
      if (e.target.name === 'source') {
        if (!e.target.files.length) return;
        button.disabled = true;
        if(form.elements.album_photo) form.elements.album_photo.value = '';
        if(objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(e.target.files[0]);
        img.src = objectUrl;
      } else if (e.target.name === 'album_photo') {
        if (!e.target.value) return;
        button.disabled = true;
        form.elements.source.value = '';
        img.src = photo(e.target.value);
      } else draw();
    });
    if (source) img.src = photo(source);
    form.onsubmit = async e => {
      e.preventDefault();
      button.disabled = true;
      try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const media = await upload(new File([blob],'avatar.png',{type:'image/png'}),'avatar');
        await patchSettings({['avatar_'+role+'_media_id']:media.id});
        closeModal();
        toast('Đã đổi ảnh đại diện ♡');
      } catch (err) { toast(err.message); button.disabled = false; }
    };
  }

  async function together() {
    const data = await api('/together');
    $('#daily-question').textContent = data.question;
    const field = $('#daily-answer');
    const own = data.answers.find(a => a.created_by === getUser().id);
    if (document.activeElement !== field && !field.dataset.dirty) field.value = own?.text || '';
    $('#daily-form').dataset.mediaId = own?.media_id || '';
    $('#daily-answers').innerHTML = data.answers.map(a => `<p><strong>${esc(name(a.created_by))}</strong> ${esc(a.text)}</p>${attachment(a)}`).join('');
    $('#couple-pins').innerHTML = data.pins.map(p => `<article>${p.media_id ? `<a href="${photo(p.media_id)}"><img src="${photo(p.media_id,true)}" alt="Ảnh đã ghim"></a>` : ''}
      <p>${esc(p.text)}</p><button data-couple="unpin" data-id="${esc(p.id)}">Bỏ ghim</button></article>`).join('') || '<p>Chưa ghim ảnh hoặc lời nhắn nào.</p>';
  }

  async function pin(kind, target) {
    await write('/together/pins','PUT',{kind,target});
    await together();
    toast('Đã ghim ♡');
  }

  function vietnamDay(value = new Date()) {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
  }

  function occurrences(event, start, end) {
    const first = event.event_date.slice(0,10);
    const dates = [];
    const date = new Date(start+'T00:00:00Z'), last = new Date(end+'T00:00:00Z');
    const origin = new Date(first+'T00:00:00Z');
    while (date <= last) {
      const day = date.toISOString().slice(0,10);
      if (day >= first && (day === first ||
          (event.repeat_rule === 'weekly' && date.getUTCDay() === origin.getUTCDay()) ||
          (event.repeat_rule === 'monthly' && day.slice(8) === first.slice(8)) ||
          (event.repeat_rule === 'yearly' && day.slice(5) === first.slice(5)))) dates.push(day);
      date.setUTCDate(date.getUTCDate()+1);
    }
    return dates;
  }

  function renderCalendar() {
    const today = vietnamDay();
    const startDate = getState().settings.start_date.slice(0,10);
    const events = [...getState().events];
    if (startDate) {
      events.push({title:'Kỷ niệm ngày yêu',event_date:startDate,repeat_rule:'yearly'});
      for (const days of [100,365,1000]) {
        const date = new Date(startDate+'T00:00:00Z');
        date.setUTCDate(date.getUTCDate()+days);
        events.push({title:days+' ngày bên nhau',event_date:date.toISOString().slice(0,10)});
      }
    }
    const [year,month] = calendarMonth.split('-').map(Number);
    const last = new Date(Date.UTC(year,month,0)).getUTCDate();
    const first = calendarMonth + '-01', end = calendarMonth + '-' + last;
    const times = events.flatMap(event => occurrences(event,first,end).map(day => ({day,event})))
      .sort((a,b) => (a.day+a.event.event_date.slice(10)).localeCompare(b.day+b.event.event_date.slice(10)));
    $('#calendar-month').textContent = 'Tháng '+month+' / '+year;
    const labels = {date:'Hẹn hò',birth:'Sinh nhật',anniversary:'Kỷ niệm',plan:'Kế hoạch chung'};
    const colors = {peach:'#bd7296',lavender:'#9162af',sky:'#427ea3',cream:'#9a7137'};
    const card = ({day,event}) => `<article class="couple-event" style="--event-color:${colors[event.color] || colors.peach}">
      <strong>${esc(event.title)}</strong><small>${day.slice(8)}/${month} ${esc(event.event_date.slice(11,16))} ${labels[event.category] || ''}</small>
       ${attachment(event)}${event.location ? `<p>⌖ ${esc(event.location)}</p>` : ''}${event.details ? `<p>${esc(event.details)}</p>` : ''}
      ${event.checklist ? `<ul>${event.checklist.split('\n').map((line,index)=>{
        if (!line.trim()) return '';
        const checked = line.startsWith('[x] ');
        const label = checked ? line.slice(4) : line;
        return `<li><label><input type="checkbox" data-checklist="${event.id}" data-index="${index}" ${checked?'checked':''}> ${esc(label)}</label></li>`;
      }).join('')}</ul>` : ''}
      ${event.id ? `<button data-edit="events:${event.id}">Sửa</button> <button data-delete="events:${event.id}">Xóa</button>
        ${event.category==='date' && day<=today ? `<button data-couple="memory" data-id="${event.id}" data-day="${day}">Lưu kỷ niệm</button>` : ''}` : ''}</article>`;
    const list = $('#event-list');
    list.classList.toggle('month-view',calendarView==='month');
    if (calendarView === 'list') list.innerHTML = times.map(card).join('') || '<p>Tháng này chưa có sự kiện.</p>';
    else {
      const offset = (new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
      list.innerHTML = ['T2','T3','T4','T5','T6','T7','CN'].map(d=>`<b>${d}</b>`).join('') + '<div></div>'.repeat(offset) +
        Array.from({length:last}, (_,i) => `<div class="calendar-cell"><strong>${i+1}</strong>${times.filter(x=>Number(x.day.slice(8))===i+1).map(card).join('')}</div>`).join('');
    }
    const current = new Date();
    for (const e of events) {
      if (!e.remind_at || !occurrences(e,today,today).length) continue;
      const time = e.remind_at.slice(11,16);
      const due = new Date(today+'T'+(time || '09:00')+':00+07:00');
      const key = e.id+':'+today;
      if (due <= current && !reminders.has(key)) { reminders.add(key); toast('Nhắc lịch · '+e.title); }
    }
  }

  function mount() {
    connect();
    renderCalendar();
    together().catch(err => { $('#daily-question').textContent = err.message; });
  }

  document.addEventListener('change', async e => {
    if (!e.target.matches('[data-checklist]')) return;
    const field = e.target;
    const event = getState().events.find(item => item.id === field.dataset.checklist);
    if (!event) return;
    const lines = event.checklist.split('\n');
    const index = Number(field.dataset.index);
    lines[index] = (field.checked ? '[x] ' : '') + lines[index].replace(/^\[x\] /,'');
    field.disabled = true;
    try {
      const updated = await write('/items/events/'+event.id,'PATCH',{checklist:lines.join('\n')});
      event.checklist = updated.checklist;
      renderCalendar();
    } catch (err) { field.checked = !field.checked; toast(err.message); }
    finally { field.disabled = false; }
  });
  document.addEventListener('visibilitychange', seen);
  window.addEventListener('hashchange', seen);
  window.addEventListener('pagehide', () => { clearTimeout(catchup); if (socket) {socket.onclose = null; socket.close(); socket = null;} });
  window.addEventListener('pageshow', e => { if (e.persisted && !$('#chat').hidden) connect(); });
  $('#chat-form').addEventListener('submit', e => { e.preventDefault(); send(); });
  $('#chat-form').addEventListener('input', () => { pending = null; $('#chat-retry').hidden = true; });
  $('#daily-answer').addEventListener('input', e => { e.target.dataset.dirty = '1'; });
  $('#daily-form').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      const file = $('#daily-photo').files[0];
      if (file && e.target.uploadedPhoto?.file !== file) e.target.uploadedPhoto = {file,id:(await upload(file,'gallery')).id};
      const media_id = file ? e.target.uploadedPhoto.id : e.target.dataset.mediaId || '';
      await write('/together/answer','PUT',{text:$('#daily-answer').value,media_id});
      $('#daily-photo').value = '';
      delete $('#daily-answer').dataset.dirty;
      await together();
      toast('Đã lưu câu trả lời');
    } catch (err) { toast(err.message); } finally { button.disabled = false; }
  });

  document.addEventListener('click', async e => {
    const button = e.target.closest('[data-couple]');
    if (!button) return;
    const {couple: action, id, emoji, day} = button.dataset;
    try {
      switch (action) {
        case 'retry': await send(); break;
        case 'older': {
          const oldest = order()[0];
          if (!oldest) return;
          const page = await api('/chat?before='+encodeURIComponent(oldest.created_at));
          ingest(page);
          button.hidden = !page.has_more;
          break;
        }
        case 'reply':
          clearCompose(); reply=id; $('#chat-context').textContent='Đang trả lời '+name(messages.get(id).created_by); $('#chat-text').focus(); break;
        case 'edit':
          clearCompose(); editing=id; $('#chat-context').textContent='Đang sửa tin nhắn'; $('#chat-text').value=messages.get(id).text; $('#chat-text').focus(); break;
        case 'cancel': clearCompose(); break;
        case 'delete': if (confirm('Xóa tin nhắn này?')) await write('/chat/'+id,'DELETE'); break;
        case 'react': await write('/chat/'+id+'/reaction','PUT',{emoji:messages.get(id)['reaction_'+getUser().role]===emoji?'':emoji}); break;
        case 'avatar': await avatar(id, button.dataset.ownAvatar); break;
        case 'pin-msg': await pin('message',id); break;
        case 'pin-note': await pin('notes',id); break;
        case 'pin-image': await pin('media',id); break;
        case 'clear-daily-photo':
          $('#daily-photo').value = '';
          { const form = $('#daily-form'); await write('/together/answer','PUT',{text:$('#daily-answer').value,media_id:''}); form.dataset.mediaId = ''; await together(); }
          break;
        case 'unpin': await write('/together/pins/'+encodeURIComponent(id),'DELETE'); await together(); break;
        case 'calendar-list':
        case 'calendar-month': calendarView=action.slice(9); renderCalendar(); break;
        case 'prev':
        case 'next': {
          const [y,m]=calendarMonth.split('-').map(Number);
          calendarMonth=new Date(Date.UTC(y,m+(action==='prev'?-2:0),1)).toISOString().slice(0,7);
          renderCalendar(); break;
        }
        case 'memory': {
          const event=getState().events.find(item=>item.id===id);
          await createItem('memories',{title:event.title,event_date:day,location:event.location||'',body:event.details||'',media_id:event.media_id||''});
          toast('Đã lưu buổi hẹn vào dòng thời gian'); break;
        }
      }
    } catch (err) { toast(err.message); }
  });
  return {mount, renderCalendar};
};
