"""Run with: python -m pytest -q tests/test_site.py"""
import os
import atexit
import uuid
import tempfile
from io import BytesIO
from pathlib import Path

# Configure isolated SQLite before importing server.
_TMP = tempfile.TemporaryDirectory(prefix='aluong-test-')
os.environ['DATA_DIR'] = _TMP.name
os.environ['MONGODB_URI'] = os.getenv('TEST_MONGODB_URI', '')
os.environ['MONGODB_DB'] = 'universe_regression_' + uuid.uuid4().hex
os.environ.pop('OWNER_SETUP_CODE', None)
from fastapi.testclient import TestClient  # noqa: E402
from server import app, store  # noqa: E402
from PIL import Image  # noqa: E402

client=TestClient(app)
if store.mongo is not None:
    atexit.register(store.mongo.client.drop_database, store.mongo.name)

def test_00_public_status_private_data():
    assert client.get('/api/auth/status').json()['setup_needed'] is True
    assert client.get('/api/data').status_code == 401
    assert client.get('/api/export').status_code == 401
    assert client.get('/').status_code == 200


def test_01_register_first_user_and_crud():
    r=client.post('/api/auth/register',json={'email':'aluong@example.test','password':'LongPassphrase123'})
    assert r.status_code==200,r.text
    data=client.get('/api/data').json()
    assert data['user']['display_name']=='A Lương'
    assert data['user']['role']=='owner'
    assert data['memories']==[]
    csrf=data['csrf'];globals()['csrf']=csrf
    # write requests must carry same-origin CSRF
    assert client.post('/api/items/notes',json={'body':'Xin chào'}).status_code==403
    headers={'x-csrf-token':csrf}
    note=client.post('/api/items/notes',headers=headers,json={'body':'Thương em ♡','mood':'Yêu thương'})
    assert note.status_code==200,note.text
    noteid=note.json()['id']
    assert client.get('/api/data').json()['notes'][0]['body']=='Thương em ♡'
    assert client.patch('/api/items/notes/'+noteid,headers=headers,json={'body':'Thương em thật nhiều'}).status_code==200
    # Unauthorized account cannot reach files
    assert client.get('/api/media/none').status_code==404
    globals()['note_id']=noteid


def test_02_upload_and_export():
    img=Image.new('RGB',(500,300),'#bd7296');buf=BytesIO();img.save(buf,format='PNG');
    response=client.post('/api/upload',headers={'x-csrf-token':csrf},files={'file':('demo.png',buf.getvalue(),'image/png')})
    assert response.status_code==200,response.text
    ident=response.json()['id']
    photo=client.get('/api/media/'+ident+'?thumb=true')
    assert photo.status_code==200 and photo.headers['content-type'].startswith('image/webp')
    assert client.get('/api/export').status_code==200
    assert client.patch('/api/settings',headers={'x-csrf-token':csrf},json={'cover_media_id':ident}).status_code==200


def test_03_invite_and_locks():
    invite=client.post('/api/invite',headers={'x-csrf-token':csrf}).json()['token']
    partner=TestClient(app)
    assert partner.post('/api/auth/register',json={'email':'bad@example.test','password':'GoodPassphrase123'}).status_code==403
    r=partner.post('/api/auth/register',json={'email':'capu@example.test','password':'GoodPassphrase123','invite':invite})
    assert r.status_code==200,r.text
    pcsrf=partner.get('/api/data').json()['csrf']
    assert partner.get('/api/data').json()['user']['display_name']=='CaPu'
    # author can read scheduled letter, partner can't read it before unlock.
    letter=client.post('/api/items/letters',headers={'x-csrf-token':csrf},json={
        'title':'Một lá thư', 'body':'Lời nhắn bí mật', 'recipient_role':'partner',
        'unlock_at':'2099-01-01T00:00:00+00:00', 'status':'sent'})
    assert letter.status_code==200,letter.text
    partner_letter=partner.get('/api/data').json()['letters'][0]
    assert partner_letter['locked'] is True
    assert partner_letter['body']==''
    assert client.get('/api/data').json()['letters'][0]['body']=='Lời nhắn bí mật'
    # Export must not disclose letters still locked for the recipient.
    import zipfile, json
    with zipfile.ZipFile(BytesIO(partner.get('/api/export').content)) as z:
        exported=json.loads(z.read('ky-niem.json'))
    assert exported['letters'][0]['body']==''
    assert exported['letters'][0]['locked'] is True
    # ensure partner cannot edit letter written by owner
    assert partner.patch('/api/items/letters/'+letter.json()['id'],headers={'x-csrf-token':pcsrf},json={'body':'Hack'}).status_code==403


def test_04_delete_and_no_access_after_logout():
    assert client.delete('/api/items/notes/'+note_id,headers={'x-csrf-token':csrf}).status_code==200
    assert client.post('/api/auth/logout',headers={'x-csrf-token':csrf}).status_code==200
    assert client.get('/api/data').status_code==401
