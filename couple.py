"""Authenticated features for the couple's private space."""
import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

VN = timezone(timedelta(hours=7))
REACTIONS = ('❤️', '🥰', '😂', '✨')
QUESTIONS = (
    'Điều gì hôm nay làm bạn nhớ đến người ấy?',
    'Cuối tuần mình muốn đi đâu cùng nhau?',
    'Kỷ niệm nào làm bạn mỉm cười?',
    'Bạn muốn cảm ơn người ấy vì điều gì hôm nay?',
)


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


class Profile(BaseModel):
    display_name: str
    nickname: str = ''
    auto_avatar: bool | None = None
    role: str | None = None


class Message(BaseModel):
    client_id: str
    text: str = ''
    url: str = ''
    media_id: str = ''
    reply_to: str = ''


class Text(BaseModel):
    text: str


class DailyAnswer(Text):
    media_id: str = ''


class Reaction(BaseModel):
    emoji: str


class Pin(BaseModel):
    kind: str
    target: str


def register(core):
    app, db = core.app, core.store
    clean = core.clean_str

    def writer(request):
        user = core.get_user(request)
        core.require_csrf(request, user)
        return user

    def get_message(ident):
        row = db.one('messages', id=ident)
        if not row or row['deleted']:
            raise HTTPException(404, 'Tin nhắn không còn.')
        return row

    def page(user, before='', after='', limit=30):
        query = {'created_at': {'$lt': before}} if before else {}
        if after:
            query = {'created_at': {'$gt': after}}
        rows = db.find('messages', query, sort=(('created_at', 1 if after else -1),), limit=limit + 1)
        unread = db.count('messages', {'created_by': {'$ne': user['id']}, 'read_at': '', 'deleted': 0})
        return dict(messages=rows[:limit], unread=unread, has_more=len(rows) > limit)

    @app.patch('/api/profile')
    def profile(request: Request, body: Profile):
        user = writer(request)
        role = body.role or user['role']
        if role not in ('owner', 'partner'):
            raise HTTPException(422, 'Hồ sơ không hợp lệ.')
        values = dict(display_name=clean(body.display_name, 60, True), nickname=clean(body.nickname, 60))
        if role == user['role'] and body.auto_avatar is not None:
            values['auto_avatar'] = int(body.auto_avatar)
        with core.mutex:
            if not db.update('users', {'role': role}, values):
                if user['role'] != 'owner' or role != 'partner':
                    raise HTTPException(404, 'Người này chưa tham gia.')
                core.set_setting('pending_partner_name', values['display_name'])
                core.set_setting('pending_partner_nickname', values['nickname'])
        return values

    @app.get('/api/chat')
    def chat(request: Request, before: str = '', after: str = '', limit: int = 30):
        return page(core.get_user(request), clean(before, 40), clean(after, 40), max(1, min(limit, 75)))

    @app.post('/api/chat')
    def send(request: Request, body: Message):
        user = writer(request)
        if not re.fullmatch(r'[\w-]{12,80}', body.client_id, flags=re.ASCII):
            raise HTTPException(422, 'Mã gửi tin không hợp lệ.')
        ident = hashlib.sha256(f"{user['id']}:{body.client_id}".encode()).hexdigest()[:32]
        with core.mutex:
            existing = db.one('messages', id=ident)
            if existing:
                return existing
            text, url = clean(body.text, 4000), clean(body.url, 2048)
            if url:
                try:
                    parsed = urlsplit(url)
                    valid = parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username
                except ValueError:
                    valid = False
                if not valid or any(c.isspace() or c == chr(92) for c in url):
                    raise HTTPException(422, 'Hãy nhập liên kết HTTP hoặc HTTPS hợp lệ.')
            media_id, reply = clean(body.media_id, 32), clean(body.reply_to, 32)
            if media_id:
                photo = db.one('media', id=media_id)
                if not photo or photo.get('purpose') == 'sealed' or not photo['mime'].startswith('image/'):
                    raise HTTPException(422, 'Ảnh đính kèm không hợp lệ.')
            if reply:
                get_message(reply)
            if not (text or url or media_id):
                raise HTTPException(422, 'Hãy nhập lời nhắn hoặc đính kèm ảnh, liên kết.')
            row = dict(id=ident, created_by=user['id'], created_at=timestamp(), text=text, url=url,
                       media_id=media_id, reply_to=reply, read_at='', edited_at='', deleted=0,
                       reaction_owner='', reaction_partner='')
            db.insert('messages', row, ignore=True)
            return db.one('messages', id=ident)

    @app.post('/api/chat/read')
    def read(request: Request, through: str):
        user = writer(request)
        db.update('messages', {'created_by': {'$ne': user['id']}, 'read_at': '',
                               'created_at': {'$lte': clean(through, 40, True)}}, {'read_at': timestamp()})
        return {'ok': True}

    @app.patch('/api/chat/{ident}')
    def edit(request: Request, ident: str, body: Text):
        user = writer(request)
        row = get_message(ident)
        if row['created_by'] != user['id']:
            raise HTTPException(403, 'Bạn chỉ được sửa tin của mình.')
        db.update('messages', {'id': ident, 'deleted': 0}, {
            'text': clean(body.text, 4000, not (row['url'] or row['media_id'])), 'edited_at': timestamp()})
        return {'ok': True}

    @app.delete('/api/chat/{ident}')
    def delete(request: Request, ident: str):
        user = writer(request)
        if get_message(ident)['created_by'] != user['id']:
            raise HTTPException(403, 'Bạn chỉ được xóa tin của mình.')
        db.update('messages', {'id': ident}, dict(deleted=1, text='', url='', media_id='',
                                                 reaction_owner='', reaction_partner=''))
        db.delete('pins', kind='message', target=ident)
        return {'ok': True}

    @app.put('/api/chat/{ident}/reaction')
    def react(request: Request, ident: str, body: Reaction):
        user = writer(request)
        if body.emoji not in ('', *REACTIONS):
            raise HTTPException(422, 'Cảm xúc không hợp lệ.')
        get_message(ident)
        db.update('messages', {'id': ident, 'deleted': 0}, {'reaction_' + user['role']: body.emoji})
        return {'ok': True}

    @app.websocket('/api/chat/live')
    async def live(socket: WebSocket):
        host = socket.headers.get('host')
        scheme = 'https' if core.COOKIE_SECURE or socket.url.scheme == 'wss' else 'http'
        if socket.headers.get('origin') not in ({f'{scheme}://{host}'} | core.ORIGINS):
            await socket.close(1008)
            return
        try:
            await run_in_threadpool(core.get_user, socket)
        except HTTPException:
            await socket.close(1008)
            return
        except core.PyMongoError:
            await socket.close(1013)
            return
        await socket.accept()
        previous = None
        try:
            while True:
                user = await run_in_threadpool(core.get_user, socket)
                snapshot = await run_in_threadpool(page, user)
                if snapshot != previous:
                    await socket.send_json(snapshot)
                    previous = snapshot
                try:
                    event = await asyncio.wait_for(socket.receive(), timeout=0.8)
                    if event['type'] == 'websocket.disconnect':
                        return
                    await socket.close(1008)
                    return
                except asyncio.TimeoutError:
                    pass
        except HTTPException:
            await socket.close(1008)
        except core.PyMongoError:
            await socket.close(1013)
        except WebSocketDisconnect:
            pass

    def today():
        return datetime.now(VN).date()

    @app.get('/api/together')
    def together(request: Request):
        core.get_user(request)
        day = today()
        pins = []
        for pin in db.find('pins', sort=(('created_at', -1),)):
            table = 'messages' if pin['kind'] == 'message' else pin['kind']
            target = db.one(table, id=pin['target'])
            if target and not target.get('deleted'):
                content = next((target[k] for k in ('text','body','caption','url','original_name') if target.get(k)), '')
                pins.append({**pin, 'text': content, 'media_id': target.get('media_id') or
                             (target['id'] if table == 'media' else '')})
        return {'question': QUESTIONS[day.toordinal() % len(QUESTIONS)], 'day': day.isoformat(),
                'answers': db.find('daily_answers', {'day': day.isoformat()}), 'pins': pins}

    @app.put('/api/together/answer')
    def answer(request: Request, body: DailyAnswer):
        user = writer(request)
        day = today().isoformat()
        ident = f"{day}:{user['id']}"
        values = dict(text=clean(body.text, 2000, True), media_id=clean(body.media_id, 32))
        core.validate_attachment('daily_answers', values, user)
        db.insert('daily_answers', dict(id=ident, day=day, created_by=user['id'], **values), ignore=True)
        db.update('daily_answers', {'id': ident}, values)
        return {'ok': True}

    @app.put('/api/together/pins')
    def pin_item(request: Request, body: Pin):
        user = writer(request)
        if body.kind not in ('media', 'message', 'notes'):
            raise HTTPException(422, 'Mục ghim không hợp lệ.')
        target = db.one('messages' if body.kind == 'message' else body.kind, id=body.target)
        if not target or target.get('deleted') or target.get('purpose') == 'sealed':
            raise HTTPException(404, 'Mục cần ghim không còn.')
        db.insert('pins', dict(id=f'{body.kind}:{body.target}', kind=body.kind, target=body.target,
                               created_by=user['id'], created_at=timestamp()), ignore=True)
        return {'ok': True}

    @app.delete('/api/together/pins/{ident}')
    def unpin(request: Request, ident: str):
        writer(request)
        db.delete('pins', id=ident)
        return {'ok': True}
