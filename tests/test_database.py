"""SQLite import and full private backup against an isolated MongoDB database."""
import os
import sqlite3
import uuid

import pytest

from database_tools import backup, migrate, restore
from storage import Records


def test_sqlite_migration_and_restore(tmp_path):
    source = tmp_path / 'legacy.sqlite3'
    uploads = tmp_path / 'source-files'
    uploads.mkdir()
    name = 'a' * 32 + '.png'
    thumb = 'a' * 32 + '_thumb.webp'
    (uploads / name).write_bytes(b'original')
    (uploads / thumb).write_bytes(b'thumbnail')
    with sqlite3.connect(source) as conn:
        conn.execute('CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, thumbnail TEXT, album_id TEXT)')
        conn.execute('CREATE TABLE albums (id TEXT PRIMARY KEY, title TEXT)')
        conn.execute('INSERT INTO albums VALUES (?,?)', ('album-id','Album cũ'))
        conn.execute('INSERT INTO media VALUES (?,?,?,?)', ('media-id',name,thumb,'album-id'))
    original = source.read_bytes()
    destination = tmp_path / 'uploads'
    assert migrate(None, source, uploads, destination, dry_run=True) == {'albums':1,'media':1,'files':2}
    assert not destination.exists()
    uri = os.getenv('TEST_MONGODB_URI')
    if not uri:
        return
    staged = Records(None, uri, 'universe_migration_' + uuid.uuid4().hex)
    recovered = Records(None, uri, 'universe_restore_' + uuid.uuid4().hex)
    hosted = Records(None, uri, 'universe_gridfs_' + uuid.uuid4().hex)
    try:
        staged.indexes()
        for _ in range(2):
            assert migrate(staged, source, uploads, destination)['files'] == 2
        assert staged.count('media') == 1
        assert staged.one('media', id='media-id')['album_id'] == 'album-id'
        assert source.read_bytes() == original
        archive = tmp_path / 'snapshot.zip'
        backup(staged, destination, archive)
        restored = tmp_path / 'restored'
        assert restore(recovered, archive, restored, dry_run=True)['files'] == 2
        assert not restored.exists()
        assert recovered.count('media') == 0
        restore(recovered, archive, restored)
        assert recovered.one('albums', id='album-id')['title'] == 'Album cũ'
        assert (restored / name).read_bytes() == b'original'
        assert (restored / thumb).read_bytes() == b'thumbnail'
        restore(hosted, archive, restored, gridfs=True)
        hosted_archive = tmp_path / 'hosted.zip'
        backup(hosted, restored, hosted_archive, gridfs=True)
        from zipfile import ZipFile
        with ZipFile(hosted_archive) as exported:
            assert exported.read('private_uploads/'+name) == b'original'
        with pytest.raises(ValueError, match='empty'):
            restore(recovered, archive, restored)
    finally:
        for store in (staged, recovered, hosted):
            store.mongo.client.drop_database(store.mongo.name)
            store.mongo.client.close()
