"""Link existing couple accounts to verified Google identities."""
import base64
import hashlib
import os
import secrets
import sqlite3
import time
from urllib.parse import urlencode, urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
ORIGIN = os.getenv('PUBLIC_ORIGIN', '').rstrip('/')
CALLBACK = f'{ORIGIN}/api/auth/google/callback'
COOKIE = 'universe_google_flow'
AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN = 'https://oauth2.googleapis.com/token'


def enabled():
    origin = urlsplit(ORIGIN)
    return bool(CLIENT_ID and CLIENT_SECRET and origin.hostname and not (
        origin.username or origin.path or origin.query or origin.fragment
    ) and (origin.scheme == 'https' or
           (origin.scheme == 'http' and origin.hostname in ('localhost', '127.0.0.1'))))


def claims_for(code, verifier):
    import requests
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    response = requests.post(TOKEN, data={
        'code': code, 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
        'redirect_uri': CALLBACK, 'grant_type': 'authorization_code', 'code_verifier': verifier,
    }, timeout=10)
    response.raise_for_status()
    return id_token.verify_oauth2_token(response.json()['id_token'], GoogleRequest(), CLIENT_ID)


def install(core):
    app, store = core.app, core.store

    def start(account_id='', session_hash=''):
        if not enabled():
            raise HTTPException(404, 'Chưa cấu hình đăng nhập Google.')
        now = int(time.time())
        store.delete('google_flows', expires_at={'$lt': now})
        browser_token, state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(4))
        store.insert('google_flows', dict(id=core.hashed(browser_token), state=state, nonce=nonce,
                                         verifier=verifier, account_id=account_id,
                                         session_hash=session_hash, expires_at=now+600))
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        target = AUTH + '?' + urlencode({
            'client_id': CLIENT_ID, 'redirect_uri': CALLBACK, 'response_type': 'code',
            'scope': 'openid email', 'state': state, 'nonce': nonce,
            'code_challenge': challenge, 'code_challenge_method': 'S256', 'prompt': 'select_account',
        })
        response = JSONResponse({'url': target}) if account_id else RedirectResponse(target, status_code=303)
        response.set_cookie(COOKIE, browser_token, httponly=True, secure=ORIGIN.startswith('https://'),
                            samesite='lax', max_age=600, path='/api/auth/google/callback')
        return response

    @app.get('/api/auth/google')
    def login():
        return start()

    @app.post('/api/auth/google/link')
    def link(request: Request):
        user = core.get_user(request)
        core.require_csrf(request, user)
        return start(user['id'], core.hashed(request.cookies['al_capu_session']))

    @app.get('/api/auth/google/callback')
    def callback(request: Request, state: str = '', code: str = ''):
        result = RedirectResponse('/?google=error', status_code=303)
        result.delete_cookie(COOKIE, path='/api/auth/google/callback')
        browser_token = request.cookies.get(COOKIE)
        if not enabled() or not browser_token or not state or not code:
            return result
        ident = core.hashed(browser_token)
        flow = store.one('google_flows', id=ident, expires_at={'$gt': int(time.time())})
        if not flow or not secrets.compare_digest(flow['state'], state):
            return result
        if store.delete('google_flows', id=ident) != 1:
            return result
        try:
            claims = claims_for(code, flow['verifier'])
        except Exception:
            return result
        subject = claims.get('sub')
        if not isinstance(subject, str) or not subject or claims.get('nonce') != flow['nonce']:
            return result
        if not claims.get('email_verified'):
            return result
        identity = store.one('google_accounts', id=subject)
        user_id = flow['account_id']
        if user_id:
            session = store.one('sessions', token_hash=flow['session_hash'], expires_at={'$gt': int(time.time())})
            if not session or session['user_id'] != user_id:
                return result
            if identity and identity['user_id'] != user_id:
                return result
            current = store.one('google_accounts', user_id=user_id)
            if current and current['id'] != subject:
                return result
            if not identity:
                try:
                    store.insert('google_accounts', {'id': subject, 'user_id': user_id})
                except sqlite3.IntegrityError:
                    return result
        else:
            if not identity:
                result.headers['Location'] = '/?google=unlinked'
                return result
            user_id = identity['user_id']
        if not store.one('users', id=user_id):
            return result
        result.headers['Location'] = '/?google=linked' if flow['account_id'] else '/'
        core.create_session(result, user_id)
        return result
