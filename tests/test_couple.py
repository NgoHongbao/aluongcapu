"""Integration tests for the private couple workspace."""
from io import BytesIO
import importlib.util
import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from starlette.websockets import WebSocketDisconnect

@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    monkeypatch.delenv('OWNER_SETUP_CODE', raising=False)
    module_name = 'couple_test_' + uuid.uuid4().hex
    monkeypatch.setenv('MONGODB_URI', os.getenv('TEST_MONGODB_URI', ''))
    monkeypatch.setenv('MONGODB_DB', module_name)
    monkeypatch.setenv('MEDIA_STORAGE', os.getenv('TEST_MEDIA_STORAGE', 'disk'))
    spec = importlib.util.spec_from_file_location(module_name, Path(__file__).parents[1] / 'server.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    try:
        yield module.app
    finally:
        sys.modules.pop(module_name)
        if module.store.mongo is not None:
            module.store.mongo.client.drop_database(module_name)
            module.store.mongo.client.close()


@pytest.fixture
def couple(app):
    clients = []
    invite = ''
    for email, password in [('aluong@example.test','LongPassphrase123'), ('capu@example.test','GoodPassphrase123')]:
        client = TestClient(app)
        response = client.post('/api/auth/register', json={'email':email,'password':password,'invite':invite})
        assert response.status_code == 200, response.text
        data = client.get('/api/data').json()
        headers = {'x-csrf-token':data['csrf']}
        clients.append((client, headers, data['user']))
        if not invite:
            invite = client.post('/api/invite', headers=headers).json()['token']
    return clients


def test_chat_and_websocket(couple, app):
    (owner, oh, _), (partner, ph, _) = couple
    origin = {'origin':'http://testserver'}
    with pytest.raises(WebSocketDisconnect):
        with TestClient(app).websocket_connect('/api/chat/live', headers=origin):
            pass
    with pytest.raises(WebSocketDisconnect):
        with owner.websocket_connect('/api/chat/live', headers={'origin':'http://outside.test'}):
            pass
    assert owner.post('/api/chat', json={'client_id':'testchat12345','text':'Hello'}).status_code == 403
    payload = {'client_id':'testchat12345','text':'Thương em 🥰','url':'https://example.com/hello'}
    with partner.websocket_connect('/api/chat/live', headers=origin) as socket:
        socket.receive_json()
        result = owner.post('/api/chat', headers=oh, json=payload)
        assert result.status_code == 200, result.text
        message = result.json()
        assert owner.post('/api/chat', headers=oh, json=payload).json()['id'] == message['id']
        live = socket.receive_json()
        assert live['unread'] == 1 and live['messages'][0]['text'] == payload['text']
    url = '/api/chat/' + message['id']
    assert partner.patch(url, headers=ph, json={'text':'Changed'}).status_code == 403
    assert partner.delete(url, headers=ph).status_code == 403
    assert owner.patch(url, headers=oh, json={'text':'Sửa tin'}).status_code == 200
    assert partner.put(url+'/reaction', headers=ph, json={'emoji':'❤️'}).status_code == 200
    assert partner.post('/api/chat/read', params={'through':message['created_at']}, headers=ph).status_code == 200
    assert owner.get('/api/chat').json()['messages'][0]['read_at']
    reply = partner.post('/api/chat', headers=ph, json={'client_id':'testreply1234','text':'Em cũng vậy','reply_to':message['id']})
    assert reply.json()['reply_to'] == message['id']
    assert owner.get('/api/chat', params={'after':message['created_at']}).json()['messages'][0]['id'] == reply.json()['id']
    assert owner.get('/api/chat', params={'before':reply.json()['created_at']}).json()['messages'][0]['reaction_partner'] == '❤️'
    assert owner.delete(url, headers=oh).status_code == 200
    assert partner.get('/api/chat').json()['messages'][-1]['text'] == ''


def test_profile_media_calendar_and_pins(couple, app):
    (owner, oh, _), (partner, ph, _) = couple
    assert owner.patch('/api/profile', headers=oh, json={'display_name':'Lương','nickname':'Gấu','auto_avatar':True}).status_code == 200
    def image(purpose):
        content = BytesIO()
        Image.new('RGB',(16,16),'pink').save(content, 'PNG')
        return owner.post('/api/upload', params={'purpose':purpose}, headers=oh,
                          files={'file':('profile.png', content.getvalue(), 'image/png')}).json()['id']
    profile = image('profile')
    chat_photo = image('chat')
    sent = owner.post('/api/chat', headers=oh, json={'client_id':'testphoto1234','media_id':chat_photo}).json()
    assert partner.get('/api/chat').json()['messages'][0]['id'] == sent['id']
    assert partner.get('/api/data').json()['settings']['avatar_owner_media_id'] == profile
    assert TestClient(app).get('/api/media/' + chat_photo).status_code == 401
    assert partner.get('/api/media/' + chat_photo).status_code == 200
    partial=partner.get('/api/media/'+chat_photo, headers={'Range':'bytes=0-7'})
    assert partial.status_code == 206 and partial.content == bytes.fromhex('89504e470d0a1a0a')
    assert partner.patch('/api/settings', headers=ph, json={'avatar_owner_media_id':chat_photo}).status_code == 403
    assert image('profile') != profile
    assert owner.get('/api/data').json()['settings']['avatar_owner_media_id'] != profile
    profile_name = next(x for x in partner.get('/api/data').json()['users'] if x['role'] == 'owner')
    assert (profile_name['display_name'], profile_name['nickname']) == ('Lương','Gấu')
    event = dict(title='Buổi hẹn', event_date='2026-11-24T19:00', repeat_rule='weekly',
                 category='date', color='lavender', location='Quán cà phê', checklist='Đặt bàn')
    assert owner.post('/api/items/events', headers=oh, json=event).status_code == 200
    assert partner.get('/api/data').json()['events'][0]['repeat_rule'] == 'weekly'
    assert partner.post('/api/items/events', headers=ph, json={**event,'repeat_rule':'unknown'}).status_code == 422
    assert owner.put('/api/together/answer', headers=oh, json={'text':'Buổi hẹn đầu tiên'}).status_code == 200
    assert partner.get('/api/together').json()['answers'][0]['text'] == 'Buổi hẹn đầu tiên'
    assert owner.put('/api/together/pins', headers=oh, json={'kind':'media','target':chat_photo}).status_code == 200
    assert partner.get('/api/together').json()['pins'][0]['media_id'] == chat_photo

def test_sealed_and_shared_attachments(couple):
    (owner, oh, _), (partner, ph, _) = couple
    data = BytesIO()
    Image.new('RGB', (16,16), 'pink').save(data, 'PNG')
    files = {'file': ('test-attachment.png', data.getvalue(), 'image/png')}
    sealed = owner.post('/api/upload?purpose=sealed', headers=oh, files=files).json()['id']
    image = owner.post('/api/upload', headers=oh, files=files).json()['id']
    for table, fields in [('letters', {'body':'Private','status':'sent'}), ('gifts', {'message':'Private'})]:
        letter = owner.post('/api/items/'+table, headers=oh, json={
            **fields, 'title':'Secret','recipient_role':'partner',
            'unlock_at':'2099-01-01T00:00:00+00:00','media_id':sealed})
        assert letter.status_code == 200, letter.text
        snapshot = partner.get('/api/data').json()
        assert snapshot[table][0]['media_id'] == ''
        assert sealed not in {row['id'] for row in snapshot['media']}
        assert partner.get('/api/media/'+sealed).status_code == 404
        assert partner.get('/api/media/'+sealed+'?thumb=true').status_code == 404
        from zipfile import ZipFile
        with ZipFile(BytesIO(partner.get('/api/export').content)) as archive:
            assert all(sealed not in name for name in archive.namelist())
        assert owner.patch('/api/items/'+table+'/'+letter.json()['id'], headers=oh, json={'unlock_at':''}).status_code == 200
        assert partner.get('/api/media/'+sealed).status_code == 200
        assert owner.delete('/api/items/'+table+'/'+letter.json()['id'], headers=oh).status_code == 200
    for table, payload in [('notes', {'body':'Ảnh chung'}), ('goals', {'title':'Ảnh chung'}), ('albums', {'title':'Ảnh chung'}),
                           ('places', {'name':'Ảnh chung','lat':10,'lng':106}),
                           ('events', {'title':'Ảnh chung','event_date':'2026-11-24'})]:
        response = owner.post('/api/items/'+table, headers=oh, json={**payload,'media_id':image})
        assert response.status_code == 200, response.text
        assert partner.get('/api/data').json()[table][0]['media_id'] == image
    assert owner.put('/api/together/answer', headers=oh, json={'text':'Câu trả lời','media_id':image}).status_code == 200
    assert partner.get('/api/together').json()['answers'][0]['media_id'] == image

def test_playlist_and_gift_music(couple):
    (owner, oh, _), (partner, _, _) = couple
    settings = owner.get('/api/data').json()['settings']
    assert len(settings['youtube_playlist'].splitlines()) == 4
    update = owner.patch('/api/settings', headers=oh, json={'youtube_playlist':
        'https://youtu.be/T7ksmtaVeOk\nhttps://www.youtube.com/watch?v=FN7ALfpGxiI', 'youtube_loop':'no'})
    assert update.status_code == 200
    assert partner.get('/api/data').json()['settings']['youtube_playlist'] == 'T7ksmtaVeOk\nFN7ALfpGxiI'
    assert owner.patch('/api/settings', headers=oh, json={'youtube_playlist':'https://example.com/watch?v=FN7ALfpGxiI'}).status_code == 422
    gift = owner.post('/api/items/gifts', headers=oh, json={'title':'Quà có nhạc','message':'♡',
        'recipient_role':'partner','unlock_at':'2099-01-01','music_youtube':'https://youtu.be/QGa6FL98h-c'})
    assert gift.status_code == 200, gift.text
    assert partner.get('/api/data').json()['gifts'][0]['music_youtube'] == ''
    assert owner.patch('/api/items/gifts/'+gift.json()['id'], headers=oh,
                       json={'unlock_at':'','music_youtube':'https://youtu.be/ZUQtMSa6lN8'}).status_code == 200
    assert partner.get('/api/data').json()['gifts'][0]['music_youtube'] == 'ZUQtMSa6lN8'

def test_google_login_requires_existing_link(couple, app, monkeypatch):
    from urllib.parse import parse_qs, urlsplit
    import google_login

    (_, _, _), (partner, headers, user) = couple
    monkeypatch.setattr(google_login, 'CLIENT_ID', 'test-client')
    monkeypatch.setattr(google_login, 'CLIENT_SECRET', 'test-secret')
    monkeypatch.setattr(google_login, 'ORIGIN', 'http://localhost')
    monkeypatch.setattr(google_login, 'CALLBACK', 'http://localhost/api/auth/google/callback')
    seen = {}

    def fake_exchange(code, verifier):
        assert code == 'oauth-code' and len(verifier) >= 43
        return {'sub':'google-partner', 'nonce':seen['nonce'][0], 'email_verified':True}

    monkeypatch.setattr(google_login, 'claims_for', fake_exchange)

    def finish(client, url, override=None):
        seen.update(parse_qs(urlsplit(url).query))
        return client.get('/api/auth/google/callback', params={
            'state':override or seen['state'][0], 'code':'oauth-code'}, follow_redirects=False)

    guest = TestClient(app)
    start = guest.get('/api/auth/google', follow_redirects=False)
    assert finish(guest, start.headers['location']).headers['location'] == '/?google=unlinked'
    assert guest.get('/api/data').status_code == 401
    assert partner.post('/api/auth/google/link').status_code == 403
    linked = partner.post('/api/auth/google/link', headers=headers)
    assert finish(partner, linked.json()['url'], 'invalid-state').headers['location'] == '/?google=error'
    linked = partner.post('/api/auth/google/link', headers=headers)
    assert finish(partner, linked.json()['url']).headers['location'] == '/?google=linked'
    start = guest.get('/api/auth/google', follow_redirects=False)
    assert finish(guest, start.headers['location']).headers['location'] == '/'
    assert guest.get('/api/data').json()['user']['id'] == user['id']
