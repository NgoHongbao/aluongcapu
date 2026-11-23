"""A Lương ♡ CaPu - private, two-person memory website.
Run with: python server.py
MongoDB or local SQLite, with private uploads.
"""
from __future__ import annotations

import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import sys
from contextlib import closing
from storage import Records
from couple import register as register_couple
import google_login
from private_media import PrivateMedia
from urllib.parse import quote
try:
    from pymongo.errors import PyMongoError
except ImportError:
    class PyMongoError(Exception):
        pass
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import Body, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('DATA_DIR', ROOT / 'data')).resolve()
MEDIA_DIR = DATA / 'private_uploads'
DATA.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA / 'memories.sqlite3'
MAX_UPLOAD = int(os.environ.get('MAX_UPLOAD_BYTES', 12 * 1024 * 1024))
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', 'false').lower() == 'true'
OWNER_SETUP_CODE = os.environ.get('OWNER_SETUP_CODE', '').strip()
login_attempts: dict[str, list[int]] = {}
ORIGINS = {s.strip().rstrip('/') for s in os.environ.get('ALLOWED_ORIGINS', '').split(',') if s.strip()}
ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
mutex = threading.RLock()
app = FastAPI(title='A Lương ♡ CaPu', docs_url=None, redoc_url=None, openapi_url=None)

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS google_flows (
 id TEXT PRIMARY KEY, state TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
 account_id TEXT NOT NULL, session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_accounts (id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 text TEXT NOT NULL, url TEXT NOT NULL, media_id TEXT NOT NULL, reply_to TEXT NOT NULL,
 read_at TEXT NOT NULL, edited_at TEXT NOT NULL, deleted INTEGER NOT NULL,
 reaction_owner TEXT NOT NULL, reaction_partner TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_created ON messages(created_at, id);
CREATE TABLE IF NOT EXISTS daily_answers (
 id TEXT PRIMARY KEY, day TEXT NOT NULL, created_by TEXT NOT NULL, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pins (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','partner')), password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
 token_hash TEXT PRIMARY KEY, inviter_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS albums (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
 id TEXT PRIMARY KEY, album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
 caption TEXT NOT NULL DEFAULT '', original_name TEXT NOT NULL, mime TEXT NOT NULL,
 size INTEGER NOT NULL, filename TEXT NOT NULL, thumbnail TEXT, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 event_date TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '♡',
 media_id TEXT, location TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
 id TEXT PRIMARY KEY, body TEXT NOT NULL, mood TEXT NOT NULL DEFAULT 'Yêu thương',
 favorite INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS letters (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, recipient_role TEXT NOT NULL,
 unlock_at TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'sent',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Cùng nhau',
 done INTEGER NOT NULL DEFAULT 0, completed_at TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS places (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 lat REAL NOT NULL, lng REAL NOT NULL, visited INTEGER NOT NULL DEFAULT 0,
 event_date TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, event_date TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gifts (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL,
 recipient_role TEXT NOT NULL, unlock_at TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
'''

DEFAULT_SETTINGS = {
    'start_date': '', 'hero_title': 'A Lương ♡ CaPu',
    'hero_caption': 'Giữa hàng tỷ người, anh chỉ muốn cùng em viết nên câu chuyện của chúng mình.',
    'theme': 'light', 'accent': 'peach', 'cover_media_id': '', 'hero_left_media_id': '', 'hero_right_media_id': '', 'music_media_id': '',
    'avatar_owner_media_id': '', 'avatar_partner_media_id': '',
    'music_media_ids': '',
    'youtube_playlist': 'ZUQtMSa6lN8\nFN7ALfpGxiI\nQGa6FL98h-c\nT7ksmtaVeOk', 'youtube_loop': 'yes',
    'story_cover_media_id': '', 'map_cover_media_id': '',
    'room_left_media_id': '', 'room_right_media_id': ''
}


store = Records(DB, os.getenv('MONGODB_URI', ''), os.getenv('MONGODB_DB', 'our_little_universe'))
use_gridfs = os.getenv('MEDIA_STORAGE', 'disk') == 'gridfs'
if use_gridfs and store.mongo is None:
    raise RuntimeError('MEDIA_STORAGE=gridfs requires MONGODB_URI.')
private_media = PrivateMedia(MEDIA_DIR, store.mongo if use_gridfs else None)
EXTRA_COLUMNS = {
    'users': {'nickname': "TEXT NOT NULL DEFAULT ''", 'auto_avatar': 'INTEGER NOT NULL DEFAULT 0'},
    'gifts': {'music_youtube': "TEXT NOT NULL DEFAULT ''"},
    'daily_answers': {'media_id': "TEXT NOT NULL DEFAULT ''"},
    'media': {'purpose': "TEXT NOT NULL DEFAULT 'gallery'"},
    'events': {key: "TEXT NOT NULL DEFAULT ''" for key in ('category','color','repeat_rule','location','checklist','remind_at')},
}
ATTACHMENT_TABLES = ('albums', 'notes', 'letters', 'goals', 'places', 'events', 'gifts')
SEALED_TABLES = ('letters', 'gifts')
for attachment_table in ATTACHMENT_TABLES:
    EXTRA_COLUMNS.setdefault(attachment_table, {})['media_id'] = "TEXT NOT NULL DEFAULT ''"

ITEM_DEFAULTS = {
    'albums': {'description': ''},
    'memories': {'body': '', 'event_date': '', 'emoji': '♡', 'media_id': None, 'location': ''},
    'notes': {'mood': 'Yêu thương', 'favorite': 0},
    'letters': {'unlock_at': '', 'status': 'sent'},
    'goals': {'category': 'Cùng nhau', 'done': 0, 'completed_at': ''},
    'places': {'description': '', 'visited': 0, 'event_date': ''},
    'events': {'details': '', **dict.fromkeys(EXTRA_COLUMNS['events'], '')},
    'gifts': {'unlock_at': ''},
}
if store.mongo is None:
    with closing(store.connection()) as conn, conn:
        conn.executescript(SCHEMA)
        for table, columns in EXTRA_COLUMNS.items():
            existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({table})')}
            for key, definition in columns.items():
                if key not in existing:
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {key} {definition}')


def settings_data():
    return {**DEFAULT_SETTINGS, **{row['key']: row['value'] for row in store.find('settings')}}


def set_setting(key, value):
    store.insert('settings', dict(key=key, value=value), ignore=True)
    store.update('settings', {'key': key}, {'value': value})


def public_media(row):
    return {key: value for key, value in row.items() if key not in ('filename', 'thumbnail')}


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def hashed(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def get_user(request: Request):
    token = request.cookies.get('al_capu_session', '')
    if not token:
        raise HTTPException(401, 'Cần đăng nhập để xem không gian riêng tư.')
    session = store.one('sessions', token_hash=hashed(token), expires_at={'$gt': int(time.time())})
    user = store.one('users', id=session['user_id']) if session else None
    if not user:
        raise HTTPException(401, 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.')
    return {**user, 'csrf': session['csrf']}


def require_csrf(request: Request, user: dict):
    if request.headers.get('x-csrf-token') != user['csrf']:
        raise HTTPException(403, 'Yêu cầu không hợp lệ (CSRF).')


def clean_str(value: Any, maxlen=1000, required=False):
    if not isinstance(value, str):
        value = '' if value is None else str(value)
    value = value.strip()
    if len(value) > maxlen or (required and not value):
        raise HTTPException(422, f'Nội dung không hợp lệ (tối đa {maxlen} ký tự).')
    return value


def clean_iso_date(value: Any, required=False):
    raw = clean_str(value, 40, required)
    if raw:
        try:
            # date or timestamp ISO 8601
            datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(422, 'Ngày/giờ không đúng định dạng.')
    return raw


def create_session(response: Response, user_id: str):
    token = secrets.token_urlsafe(36)
    csrf = secrets.token_urlsafe(24)
    store.delete('sessions', expires_at={'$lt': int(time.time())})
    store.insert('sessions', dict(token_hash=hashed(token), user_id=user_id, csrf=csrf,
                                  expires_at=int(time.time()) + 60*60*24*14))
    response.set_cookie('al_capu_session', token, httponly=True, secure=COOKIE_SECURE,
                        samesite='strict', max_age=60*60*24*14, path='/')
    return {'ok': True}


class Credentials(BaseModel):
    email: str
    password: str
    invite: str = ''


@app.middleware('http')
async def security_headers(request: Request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        host = request.headers.get('host', '')
        scheme = request.url.scheme
        allowed = {f'{scheme}://{host}', f'http://{host}', f'https://{host}'} | ORIGINS
        if origin and origin.rstrip('/') not in allowed:
            return JSONResponse({'detail': 'Nguồn yêu cầu không được phép.'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store' if request.url.path.startswith('/api/') else 'public, max-age=300'
    if request.url.path.endswith('.html') or request.url.path == '/':
        response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-src https://www.youtube.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    return response


@app.exception_handler(PyMongoError)
async def database_unavailable(request, error):
    return JSONResponse({'detail': 'Không kết nối được MongoDB. Vui lòng thử lại.'}, status_code=503)


@app.get('/api/health')
def health():
    if store.mongo is not None:
        store.mongo.command('ping')
    return {'ok': True, 'name': 'Our Little Universe'}


@app.get('/api/auth/status')
def status(request: Request):
    count = store.count('users')
    try:
        u = get_user(request)
        return {'logged_in': True, 'setup_needed': False, 'user': {k:u.get(k, '') for k in ('id','email','display_name','role','nickname','auto_avatar')}, 'csrf':u['csrf']}
    except HTTPException:
        return {'logged_in': False, 'google_enabled': google_login.enabled(), 'setup_needed': count == 0,
                'owner_setup_required': count == 0 and bool(OWNER_SETUP_CODE)}


@app.post('/api/auth/register')
def register(body: Credentials, response: Response):
    email = clean_str(body.email, 240, True).lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(422, 'Email không hợp lệ.')
    if len(body.password) < 10 or len(body.password) > 200:
        raise HTTPException(422, 'Mật khẩu cần từ 10 đến 200 ký tự.')
    with mutex:
        count = store.count('users')
        if count >= 2:
            raise HTTPException(403, 'Không gian chỉ dành cho A Lương và CaPu.')
        if count == 0 and OWNER_SETUP_CODE and not secrets.compare_digest(body.invite, OWNER_SETUP_CODE):
            raise HTTPException(403, 'Mã thiết lập A Lương không hợp lệ.')
        if count == 1:
            invitation = store.one('invitations', token_hash=hashed(body.invite),
                                   expires_at={'$gt': int(time.time())}, used_at=None)
            if not invitation:
                raise HTTPException(403, 'Cần lời mời hợp lệ từ A Lương.')
        display_name = 'A Lương' if count == 0 else 'CaPu'
        role = 'owner' if count == 0 else 'partner'
        uid = uuid.uuid4().hex
        try:
            store.insert('users', dict(id=uid, email=email, display_name=display_name, role=role,
                                      password_hash=ph.hash(body.password), created_at=utcnow(),
                                      nickname='', auto_avatar=0))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'Tài khoản đã tồn tại.')
        if count == 1:
            store.update('invitations', {'token_hash': hashed(body.invite)}, {'used_at': int(time.time())})
    return create_session(response, uid)


@app.post('/api/auth/login')
def login(body: Credentials, response: Response, request: Request):
    ip = request.client.host if request.client else 'unknown'
    cutoff = int(time.time()) - 600
    with mutex:
        attempts = [t for t in login_attempts.get(ip, []) if t > cutoff]
        login_attempts[ip] = attempts
        if len(attempts) >= 8:
            raise HTTPException(429, 'Quá nhiều lần thử. Vui lòng đăng nhập lại sau 10 phút.')
    email = clean_str(body.email, 240, True).lower()
    row = store.one('users', email=email)
    if not row:
        with mutex: login_attempts.setdefault(ip, []).append(int(time.time()))
        raise HTTPException(401, 'Email hoặc mật khẩu không đúng.')
    try:
        ph.verify(row['password_hash'], body.password)
    except (VerifyMismatchError, VerificationError):
        with mutex: login_attempts.setdefault(ip, []).append(int(time.time()))
        raise HTTPException(401, 'Email hoặc mật khẩu không đúng.')
    with mutex: login_attempts.pop(ip, None)
    return create_session(response, row['id'])


@app.post('/api/auth/logout')
def logout(request: Request, response: Response):
    user = get_user(request)
    require_csrf(request, user)
    token = request.cookies.get('al_capu_session', '')
    store.delete('sessions', token_hash=hashed(token))
    response.delete_cookie('al_capu_session', path='/')
    return {'ok': True}


@app.post('/api/invite')
def invite(request: Request):
    user = get_user(request)
    require_csrf(request, user)
    if user['role'] != 'owner':
        raise HTTPException(403, 'Chỉ A Lương có thể mời CaPu.')
    token = secrets.token_urlsafe(32)
    with mutex:
        if store.count('users') >= 2:
            raise HTTPException(409, 'Người thương đã tham gia website.')
        store.delete('invitations', used_at=None)
        store.insert('invitations', dict(token_hash=hashed(token), inviter_id=user['id'],
                                         expires_at=int(time.time()) + 86400, used_at=None))
    return {'token': token, 'expires_in_hours': 24}


TABLES = {
    'albums': {'title': ('text', 120, True), 'description': ('text', 1800, False)},
    'memories': {'title': ('text', 160, True), 'body': ('text', 10000, False),
                 'event_date': ('date', 0, False), 'emoji': ('text', 16, False),
                 'media_id': ('text', 32, False), 'location': ('text', 200, False)},
    'notes': {'body': ('text', 1200, True), 'mood': ('text', 30, False), 'favorite': ('bool', 0, False)},
    'letters': {'title': ('text', 160, True), 'body': ('text', 14000, True),
                'recipient_role': ('role', 0, True), 'unlock_at': ('date', 0, False),
                'status': ('status', 0, False)},
    'goals': {'title': ('text', 220, True), 'category': ('text', 60, False),
              'done': ('bool', 0, False), 'completed_at': ('date', 0, False)},
    'places': {'name': ('text', 180, True), 'description': ('text', 2000, False),
               'lat': ('lat', 0, True), 'lng': ('lng', 0, True),
               'visited': ('bool', 0, False), 'event_date': ('date', 0, False)},
    'events': {'title': ('text', 180, True), 'event_date': ('date', 0, True),
               'details': ('text', 2000, False), 'category': ('text', 40, False),
               'color': ('text', 12, False), 'repeat_rule': ('repeat', 0, False),
               'location': ('text', 200, False), 'checklist': ('text', 2000, False),
               'remind_at': ('date', 0, False)},
    'gifts': {'title': ('text', 160, True), 'message': ('text', 12000, True),
              'recipient_role': ('role', 0, True), 'unlock_at': ('date', 0, False),
              'music_youtube': ('youtube', 0, False)},
}


for attachment_table in ATTACHMENT_TABLES:
    TABLES[attachment_table]['media_id'] = ('text', 32, False)


def validate_attachment(table, values, user, item_id=None):
    ident = values.get('media_id')
    if not ident:
        return
    media = store.one('media', id=ident)
    if not media or not media['mime'].startswith('image/'):
        raise HTTPException(422, 'Ảnh đính kèm không hợp lệ.')
    sealed = media.get('purpose') == 'sealed'
    if table in SEALED_TABLES and (not sealed or media['created_by'] != user['id']):
        raise HTTPException(422, 'Hãy tải riêng ảnh cho thư hoặc quà.')
    if table in SEALED_TABLES and any(
        item['id'] != item_id for kind in SEALED_TABLES for item in store.find(kind, {'media_id': ident})
    ):
        raise HTTPException(422, 'Ảnh này đã được đính kèm vào một thư hoặc quà khác.')
    if table not in SEALED_TABLES and sealed:
        raise HTTPException(422, 'Ảnh này được giữ riêng cho thư hoặc quà.')


def media_visible(media, user):
    if media.get('purpose') != 'sealed' or media['created_by'] == user['id']:
        return True
    for table in SEALED_TABLES:
        for row in store.find(table, {'media_id': media['id']}):
            visible = as_json_locks(table, row, user)
            if visible and not visible['locked']:
                return True
    return False


def youtube_id(value):
    raw = clean_str(value, 300)
    if not raw:
        return ''
    if re.fullmatch(r'[A-Za-z0-9_-]{11}', raw):
        return raw
    try:
        link = urlsplit(raw)
        host = link.hostname
        path = link.path.strip('/').split('/')
        if link.scheme in ('http', 'https'):
            if host == 'youtu.be':
                ident = path[0]
            elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
                ident = parse_qs(link.query).get('v', [''])[0] if path == ['watch'] else (
                    path[1] if len(path) == 2 and path[0] in ('shorts', 'embed', 'live') else '')
            else:
                ident = ''
            if re.fullmatch(r'[A-Za-z0-9_-]{11}', ident):
                return ident
    except ValueError:
        pass
    raise HTTPException(422, 'Hãy nhập liên kết video YouTube hợp lệ.')


def validate_value(field, meta, value):
    typ, maxlen, required = meta
    if typ == 'text':
        return clean_str(value, maxlen, required)
    if typ == 'date':
        return clean_iso_date(value, required)
    if typ == 'bool':
        return int(value is True or value == 1)
    if typ == 'role':
        if value not in ('owner','partner'):
            raise HTTPException(422, 'Người nhận không hợp lệ.')
        return value
    if typ in ('lat','lng'):
        try:
            val = float(value)
            if val != val or not (-90 <= val <= 90 if typ=='lat' else -180 <= val <= 180):
                raise ValueError()
            return val
        except (ValueError, TypeError):
            raise HTTPException(422, 'Tọa độ không hợp lệ.')
    if typ == 'youtube':
        return youtube_id(value)
    if typ == 'repeat':
        if value not in ('', 'weekly', 'monthly', 'yearly'):
            raise HTTPException(422, 'Kiểu lặp không hợp lệ.')
        return value
    if typ == 'status':
        if value not in ('draft','sent'):
            raise HTTPException(422, 'Trạng thái không hợp lệ.')
        return value
    raise HTTPException(422, 'Dữ liệu không hợp lệ.')


def as_json_locks(table: str, row: dict, user: dict):
    if table in ('letters', 'gifts'):
        own = row['created_by'] == user['id']
        recipient = row['recipient_role'] == user['role']
        # A draft is visible only to the author.
        if table == 'letters' and row.get('status') == 'draft' and not own:
            return None
        if not (own or recipient):
            return None
        unlock = row.get('unlock_at') or ''
        locked = False
        if not own and unlock:
            try:
                due = datetime.fromisoformat(unlock.replace('Z','+00:00'))
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                locked = datetime.now(timezone.utc) < due
            except ValueError:
                locked = True
        if locked:
            row['media_id'] = ''
            if table == 'gifts':
                row['music_youtube'] = ''
            row['body' if table=='letters' else 'message'] = ''
            row['locked'] = True
        else:
            row['locked'] = False
    return row


@app.get('/api/data')
def data(request: Request):
    user = get_user(request)
    settings = settings_data()
    payload = {}
    for table in TABLES:
        rows = store.find(table, sort=(('created_at', -1),))
        payload[table] = [obj for row in rows if (obj := as_json_locks(table, row, user)) is not None]
    payload['media'] = [public_media(row) for row in store.find('media', sort=(('created_at', -1),)) if media_visible(row, user)]
    payload['users'] = [{k: row.get(k, '') for k in ('id','display_name','role','nickname')}
                        for row in store.find('users')]
    return {'user': {k:user.get(k, '') for k in ('id','email','display_name','role','nickname','auto_avatar')},
            'csrf': user['csrf'], 'settings': settings,
            'google_enabled': google_login.enabled(), **payload}


@app.post('/api/items/{table}')
def create_item(table: str, request: Request, body: dict = Body(...)):
    user = get_user(request)
    require_csrf(request, user)
    if table not in TABLES:
        raise HTTPException(404, 'Mục không tồn tại.')
    if not isinstance(body, dict):
        raise HTTPException(422, 'Dữ liệu phải là object.')
    schema = TABLES[table]
    values = {k:validate_value(k,v,body[k]) for k,v in schema.items() if k in body}
    for k, meta in schema.items():
        if meta[2] and k not in values:
            raise HTTPException(422, f'Thiếu trường {k}.')
    if table in ('letters','gifts') and values.get('recipient_role') == user['role']:
        raise HTTPException(422, 'Hãy chọn người yêu làm người nhận.')
    item_id = uuid.uuid4().hex
    values.update(id=item_id, created_by=user['id'], created_at=utcnow())
    with mutex:
        validate_attachment(table, values, user, item_id)
        store.insert(table, {**ITEM_DEFAULTS.get(table, {}), **values})
    return store.one(table, id=item_id)


@app.patch('/api/items/{table}/{item_id}')
def update_item(table: str, item_id: str, request: Request, body: dict = Body(...)):
    user = get_user(request)
    require_csrf(request, user)
    if table not in TABLES:
        raise HTTPException(404, 'Không tìm thấy.')
    if not isinstance(body, dict):
        raise HTTPException(422, 'Dữ liệu không hợp lệ.')
    values = {k:validate_value(k, meta, body[k]) for k,meta in TABLES[table].items() if k in body}
    if not values:
        raise HTTPException(422, 'Không có nội dung cần cập nhật.')
    with mutex:
        old = store.one(table, id=item_id)
        if not old:
            raise HTTPException(404, 'Không tìm thấy dữ liệu.')
        if table in ('letters','gifts','notes') and old['created_by'] != user['id']:
            raise HTTPException(403, 'Chỉ người viết mới được sửa nội dung này.')
        if table in ('letters','gifts') and 'recipient_role' in values and values['recipient_role'] == user['role']:
            raise HTTPException(422, 'Người nhận phải là người yêu.')
        validate_attachment(table, values, user)
        store.update(table, {'id': item_id}, values)
        return store.one(table, id=item_id)


@app.delete('/api/items/{table}/{item_id}')
def delete_item(table: str, item_id: str, request: Request):
    user = get_user(request)
    require_csrf(request, user)
    if table not in TABLES:
        raise HTTPException(404, 'Không tìm thấy.')
    with mutex:
        old = store.one(table, id=item_id)
        if not old:
            raise HTTPException(404, 'Không tìm thấy.')
        if table in ('letters','gifts','notes') and old['created_by'] != user['id']:
            raise HTTPException(403, 'Chỉ người viết mới được xóa.')
        if table == 'albums':
            store.update('media', {'album_id': item_id}, {'album_id': None})
        store.delete(table, id=item_id)
    return {'ok': True}


@app.patch('/api/settings')
def update_settings(request: Request, body: dict = Body(...)):
    user = get_user(request)
    require_csrf(request, user)
    if not isinstance(body, dict):
        raise HTTPException(422, 'Dữ liệu không hợp lệ.')
    updates = {}
    for key, val in body.items():
        if key not in DEFAULT_SETTINGS:
            continue
        if key == 'start_date':
            val = clean_iso_date(val)
            if val and not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', val):
                raise HTTPException(422, 'Hãy nhập ngày bắt đầu theo dạng năm-tháng-ngày.')
        elif key.endswith('_media_id'):
            val = clean_str(val,32)
            if key.startswith('avatar_') and key != f"avatar_{user['role']}_media_id":
                raise HTTPException(403, 'Bạn chỉ có thể đổi avatar của mình.')
            if val:
                media = store.one('media', id=val)
                prefix = 'audio/' if key == 'music_media_id' else 'image/'
                if not media or media.get('purpose') == 'sealed' or not media['mime'].startswith(prefix):
                    raise HTTPException(422, 'Tệp không tồn tại hoặc không đúng loại.')
        elif key == 'music_media_ids':
            ids = list(dict.fromkeys(clean_str(val, 1200).split()))
            if len(ids) > 30:
                raise HTTPException(422, 'Danh sách tối đa 30 tệp nhạc.')
            for ident in ids:
                track = store.one('media', id=ident)
                if not track or not track['mime'].startswith('audio/'):
                    raise HTTPException(422, 'Tệp nhạc không tồn tại hoặc không đúng loại.')
            val = '\n'.join(ids)
        elif key == 'youtube_playlist':
            lines = clean_str(val, 8000).splitlines()
            if len(lines) > 30:
                raise HTTPException(422, 'Danh sách tối đa 30 bài.')
            val = '\n'.join(dict.fromkeys(youtube_id(line) for line in lines if line.strip()))
        elif key == 'youtube_loop':
            if val not in ('yes', 'no'):
                raise HTTPException(422, 'Tùy chọn lặp không hợp lệ.')
        elif key == 'hero_title':
            val = clean_str(val,80,True)
        elif key == 'hero_caption':
            val = clean_str(val,300)
        elif key == 'accent':
            if val not in ('peach', 'lavender', 'sky', 'cream'):
                raise HTTPException(422, 'Màu chủ đạo không hợp lệ.')
        elif key == 'theme':
            if val not in ('light','dark'):
                raise HTTPException(422, 'Chủ đề không hợp lệ.')
        updates[key] = val
    with mutex:
        for key, val in updates.items():
            set_setting(key, val)
    return settings_data()


ACCEPTED = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'video/mp4': '.mp4', 'video/webm': '.webm',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav'
}


@app.post('/api/upload')
def upload(request: Request, file: UploadFile = File(...), purpose: str = 'gallery'):
    user = get_user(request)
    require_csrf(request, user)
    mime = (file.content_type or '').lower()
    if purpose not in ('gallery', 'chat', 'profile', 'sealed') or (purpose != 'gallery' and not mime.startswith('image/')):
        raise HTTPException(415, 'Mục này chỉ nhận ảnh.')
    if mime not in ACCEPTED:
        raise HTTPException(415, 'Chỉ nhận JPG, PNG, WEBP, GIF, MP4, WEBM, MP3, WAV.')
    contents = file.file.read(MAX_UPLOAD + 1)
    if len(contents) > MAX_UPLOAD:
        raise HTTPException(413, f'File vượt quá {MAX_UPLOAD//1024//1024} MB.')
    if not contents:
        raise HTTPException(422, 'File trống.')
    thumb = None
    if mime.startswith('image/'):
        try:
            with Image.open(io.BytesIO(contents)) as im:
                expected = {'image/jpeg':'JPEG', 'image/png':'PNG', 'image/webp':'WEBP', 'image/gif':'GIF'}
                if im.format != expected[mime]:
                    raise ValueError('Unexpected image format')
                im.verify()
            with Image.open(io.BytesIO(contents)) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((900,900))
                if im.mode not in ('RGB','RGBA'):
                    im = im.convert('RGB')
                buffer = io.BytesIO()
                im.save(buffer, format='WEBP', quality=78)
                thumb = buffer.getvalue()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(422, 'Hình ảnh bị lỗi hoặc không hợp lệ.')
    elif mime.startswith('video/') and not (contents[4:8] == b'ftyp' or contents.startswith(b'\x1a\x45\xdf\xa3')):
        raise HTTPException(422, 'Video không hợp lệ.')
    elif mime == 'audio/mpeg' and not (contents.startswith(b'ID3') or contents[:2] in (b'\xff\xfb',b'\xff\xf3',b'\xff\xf2')):
        raise HTTPException(422, 'Âm thanh MP3 không hợp lệ.')
    elif mime == 'audio/wav' and not contents.startswith(b'RIFF'):
        raise HTTPException(422, 'Âm thanh WAV không hợp lệ.')
    file_id = uuid.uuid4().hex
    filename = f'{file_id}{ACCEPTED[mime]}'
    thumb_name = f'{file_id}_thumb.webp' if thumb else None
    original_name = Path(file.filename or 'file').name[:180]
    row = dict(id=file_id, album_id=None, caption='', original_name=original_name, mime=mime,
               size=len(contents), filename=filename, thumbnail=thumb_name, created_by=user['id'],
               created_at=utcnow(), purpose=purpose)
    try:
        private_media.write(filename, contents)
        if thumb_name:
            private_media.write(thumb_name, thumb)
        store.insert('media', row)
    except Exception:
        private_media.delete(filename)
        if thumb_name:
            private_media.delete(thumb_name)
        raise
    if purpose == 'profile':
        key = f"avatar_{user['role']}_media_id"
        with mutex:
            if not settings_data()[key] or store.one('users', id=user['id']).get('auto_avatar'):
                set_setting(key, file_id)
    return public_media(row)


@app.patch('/api/media/{media_id}')
def update_media(media_id: str, request: Request, body: dict = Body(...)):
    user = get_user(request)
    require_csrf(request, user)
    caption = clean_str(body.get('caption', ''), 500)
    album_id = clean_str(body.get('album_id',''),32) or None
    with mutex:
        if not store.one('media', id=media_id):
            raise HTTPException(404, 'File không tồn tại.')
        if album_id and not store.one('albums', id=album_id):
            raise HTTPException(422, 'Album không tồn tại.')
        store.update('media', {'id': media_id}, {'caption': caption, 'album_id': album_id})
    return {'ok': True}


@app.get('/api/media/{media_id}')
def get_media(media_id: str, request: Request, thumb: bool = False, download: bool = False):
    user = get_user(request)
    row = store.one('media', id=media_id)
    if not row or not media_visible(row, user):
        raise HTTPException(404, 'File không tồn tại.')
    filename = row['thumbnail'] if thumb and row['thumbnail'] else row['filename']
    mime = 'image/webp' if thumb and row['thumbnail'] else row['mime']
    if use_gridfs:
        return gridfs_response(filename, mime, row['original_name'] if download else '', request.headers.get('range'))
    fpath = MEDIA_DIR / filename
    if not fpath.is_file():
        raise HTTPException(404, 'Tệp đã bị thiếu.')
    return FileResponse(fpath, media_type=mime,
                        filename=row['original_name'] if download else None,
                        content_disposition_type='attachment' if download else 'inline')


def gridfs_response(filename, mime, original_name, requested_range):
    headers = {'Accept-Ranges': 'bytes'}
    if original_name:
        headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + quote(original_name, safe='')
    try:
        with private_media.open(filename) as stream:
            size = stream.length
            if not requested_range:
                return Response(stream.read(), media_type=mime, headers=headers)
            match = re.fullmatch(r'bytes=(\d{0,20})-(\d{0,20})', requested_range)
            first, last = match.groups() if match else ('', '')
            start = int(first) if first else max(0, size - int(last or 0))
            end = min(size - 1, int(last)) if first and last else size - 1
            if start > end or not (first or last):
                return Response(status_code=416, headers={**headers, 'Content-Range': f'bytes */{size}'})
            stream.seek(start)
            headers['Content-Range'] = f'bytes {start}-{end}/{size}'
            return Response(stream.read(end - start + 1), status_code=206, media_type=mime, headers=headers)
    except FileNotFoundError:
        raise HTTPException(404, 'Tệp đã bị thiếu.') from None


@app.delete('/api/media/{media_id}')
def remove_media(media_id: str, request: Request):
    user = get_user(request)
    require_csrf(request, user)
    with mutex:
        row = store.one('media', id=media_id)
        if not row:
            raise HTTPException(404, 'File không tồn tại.')
        if row.get('purpose') == 'sealed' and row['created_by'] != user['id']:
            raise HTTPException(403, 'Chỉ người gửi mới được xóa ảnh này.')
        store.update('memories', {'media_id': media_id}, {'media_id': None})
        for table in ATTACHMENT_TABLES:
            store.update(table, {'media_id': media_id}, {'media_id': ''})
        store.update('messages', {'media_id': media_id}, {'media_id': ''})
        store.update('daily_answers', {'media_id': media_id}, {'media_id': ''})
        store.delete('pins', target=media_id, kind='media')
        for key, value in settings_data().items():
            if key.endswith('_media_id') and value == media_id:
                set_setting(key, '')
        tracks = settings_data()['music_media_ids'].split()
        if media_id in tracks:
            set_setting('music_media_ids', '\n'.join(track for track in tracks if track != media_id))
        store.delete('media', id=media_id)
    for key in ('filename','thumbnail'):
        if row[key]:
            private_media.delete(row[key])
    return {'ok': True}


@app.get('/api/export')
def export_all(request: Request):
    user = get_user(request)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        payload = {'settings':settings_data()}
        for table in (*TABLES.keys(), 'media', 'messages', 'daily_answers', 'pins'):
            if table in ('letters','gifts'):
                payload[table] = [obj for r in store.find(table)
                                  if (obj := as_json_locks(table, dict(r), user)) is not None]
            elif table == 'media':
                payload[table] = [r for r in store.find(table) if media_visible(r, user)]
            else:
                payload[table] = store.find(table)
        archive.writestr('ky-niem.json', json.dumps(payload, ensure_ascii=False, indent=2))
        for r in payload['media']:
            try:
                with private_media.open(r['filename']) as stream:
                    archive.writestr(f"uploads/{r['id']}_{Path(r['original_name']).name}", stream.read())
            except FileNotFoundError:
                continue
    buffer.seek(0)
    return StreamingResponse(buffer, media_type='application/zip',
                             headers={'Content-Disposition':'attachment; filename="A-Luong-CaPu-Backup.zip"'})


@app.get('/', response_class=HTMLResponse)
def index():
    return FileResponse(ROOT/'site'/'index.html')

app.mount('/assets', StaticFiles(directory=ROOT/'site'/'assets'), name='assets')


register_couple(sys.modules[__name__])
google_login.install(sys.modules[__name__])


if __name__ == '__main__':
    import uvicorn
    print('\n♡ A LƯƠNG & CAPU - OUR LITTLE UNIVERSE')
    print('Mở trình duyệt: http://127.0.0.1:8000')
    print('Lần đầu tiên: tạo tài khoản A Lương, sau đó mời CaPu.')
    uvicorn.run(app, host=os.getenv('HOST','127.0.0.1'), port=int(os.environ.get('PORT','8000')))
