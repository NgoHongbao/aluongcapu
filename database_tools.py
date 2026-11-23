"""Import an SQLite installation, or back up and restore MongoDB and private files."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import zipfile
from contextlib import closing
from pathlib import Path

from storage import Records

TABLES = dict(users='id', sessions='token_hash', invitations='token_hash', settings='key',
              albums='id', media='id', memories='id', notes='id', letters='id', goals='id',
              places='id', events='id', gifts='id', messages='id', daily_answers='id', pins='id', google_accounts='id')
FILE_NAME = re.compile(r'[a-f0-9]{32}(?:_thumb)?\.[a-z0-9]{2,6}')


def sqlite_records(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN')
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        return {table: [dict(row) for row in conn.execute(f'SELECT * FROM {table}')]
                for table in TABLES if table in tables}


def file_names(records):
    names = set()
    for media in records.get('media', []):
        for key in ('filename', 'thumbnail'):
            name = media.get(key)
            if not name:
                if key == 'filename':
                    raise ValueError('Media missing filename.')
                continue
            if not FILE_NAME.fullmatch(name):
                raise ValueError('Invalid media filename.')
            names.add(name)
    return sorted(names)


def import_records(store, records, *, dry_run=False):
    for table, key in TABLES.items():
        for row in records.get(table, []):
            if key not in row:
                raise ValueError(f'Missing record key in {table}.')
    if dry_run:
        return
    for table, key in TABLES.items():
        for row in records.get(table, []):
            store.mongo[table].update_one({key: row[key]}, {'$setOnInsert': row}, upsert=True)


def digest(source):
    checksum = hashlib.sha256()
    for block in iter(lambda: source.read(1024 * 1024), b''):
        checksum.update(block)
    return checksum.digest()


def copy_file(source, target, *, dry_run=False):
    if target.is_file():
        with target.open('rb') as existing:
            if digest(source) != digest(existing):
                raise ValueError(f'Destination file conflict: {target.name}')
        return
    if dry_run:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + '.partial')
    try:
        with partial.open('wb') as out:
            shutil.copyfileobj(source, out)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)


def migrate(store, sqlite_path, media_path, destination, *, dry_run=False):
    records = sqlite_records(sqlite_path)
    names = file_names(records)
    for name in names:
        with (media_path / name).open('rb') as source:
            copy_file(source, destination / name, dry_run=True)
    if not dry_run:
        for name in names:
            with (media_path / name).open('rb') as source:
                copy_file(source, destination / name)
    import_records(store, records, dry_run=dry_run)
    return {**{table: len(rows) for table, rows in records.items()}, 'files': len(names)}


def backup(store, media_path, output):
    records = {table: store.find(table) for table in TABLES if table not in ('sessions', 'invitations')}
    with output.open('xb') as stream:
        try:
            with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
                archive.writestr('database.json', json.dumps({'version': 1, 'records': records}, ensure_ascii=False))
                for name in file_names(records):
                    archive.write(media_path / name, f'private_uploads/{name}')
        except Exception:
            stream.close()
            output.unlink(missing_ok=True)
            raise


def restore(store, source, destination):
    if any(store.count(table) for table in TABLES):
        raise ValueError('Restore requires an empty MongoDB database.')
    with zipfile.ZipFile(source) as archive:
        snapshot = json.loads(archive.read('database.json'))
        if snapshot['version'] != 1:
            raise ValueError('Unsupported backup version.')
        records = snapshot['records']
        if not set(records) <= set(TABLES) - {'sessions', 'invitations'}:
            raise ValueError('Unexpected backup contents.')
        names = file_names(records)
        import_records(store, records, dry_run=True)
        if archive.testzip() is not None:
            raise ValueError('Damaged backup.')
        for name in names:
            with archive.open(f'private_uploads/{name}') as stream:
                copy_file(stream, destination / name, dry_run=True)
        for name in names:
            with archive.open(f'private_uploads/{name}') as stream:
                copy_file(stream, destination / name)
        import_records(store, records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    command = parser.add_subparsers(dest='command', required=True)
    migration = command.add_parser('migrate')
    migration.add_argument('sqlite', type=Path)
    migration.add_argument('--source-media', type=Path)
    migration.add_argument('--dry-run', action='store_true')
    command.add_parser('backup').add_argument('archive', type=Path)
    command.add_parser('restore').add_argument('archive', type=Path)
    args = parser.parse_args()
    dry_run = args.command == 'migrate' and args.dry_run
    uri = os.getenv('MONGODB_URI', '')
    if not uri and not dry_run:
        parser.error('MONGODB_URI must be configured.')
    store = Records(None, uri, os.getenv('MONGODB_DB', 'our_little_universe'))
    destination = Path(os.getenv('DATA_DIR', 'data')) / 'private_uploads'
    try:
        if not dry_run:
            store.indexes()
        if args.command == 'migrate':
            source = args.source_media or args.sqlite.parent / 'private_uploads'
            print(json.dumps(migrate(store, args.sqlite, source, destination, dry_run=dry_run), indent=2))
        elif args.command == 'backup':
            backup(store, destination, args.archive)
        else:
            restore(store, args.archive, destination)
    except Exception as error:
        print(f'{type(error).__name__}: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
