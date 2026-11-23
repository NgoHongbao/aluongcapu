"""Document storage with a local SQLite mode for offline development."""
import sqlite3
from contextlib import closing


class Records:
    def __init__(self, path, uri, name):
        self.path = path
        self.mongo = None
        self.indexed = False
        if uri:
            from pymongo import MongoClient
            self.mongo = MongoClient(uri, serverSelectionTimeoutMS=3500)[name]

    def connection(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        return conn

    def indexes(self):
        if self.indexed:
            return
        unique = {'users': ('id','email','role'), 'sessions': ('token_hash',),
                  'invitations': ('token_hash',), 'settings': ('key',),
                  'google_flows': ('id',), 'google_accounts': ('id', 'user_id')}
        for table in ('albums','media','memories','notes','letters','goals','places','events',
                      'gifts','messages','daily_answers','pins'):
            unique[table] = ('id',)
        for table, keys in unique.items():
            for key in keys:
                self.mongo[table].create_index(key, unique=True)
        self.mongo.messages.create_index([('created_at', -1), ('id', -1)])
        self.mongo.events.create_index('event_date')
        self.indexed = True

    @staticmethod
    def where(filters):
        clauses, args = [], []
        for key, value in filters.items():
            if value is None:
                clauses.append(f'{key} IS NULL')
            elif isinstance(value, dict):
                operators = {'$gt': '>', '$lt': '<', '$lte': '<=', '$ne': '!='}
                for op, operand in value.items():
                    clauses.append(f'{key}{operators[op]}?')
                    args.append(operand)
            else:
                clauses.append(f'{key}=?')
                args.append(value)
        return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), args

    def find(self, table, filters=None, sort=(), limit=0):
        filters = filters or {}
        if self.mongo is not None:
            self.indexes()
            cursor = self.mongo[table].find(filters, {'_id': 0})
            return list((cursor.sort(list(sort)) if sort else cursor).limit(limit))
        where, args = self.where(filters)
        order = ', '.join(f'{k} {"DESC" if d < 0 else "ASC"}' for k, d in sort)
        suffix = (f' ORDER BY {order}' if sort else '') + (f' LIMIT {int(limit)}' if limit else '')
        with closing(self.connection()) as conn:
            return [dict(row) for row in conn.execute(f'SELECT * FROM {table}{where}{suffix}', args)]

    def one(self, table, **filters):
        return next(iter(self.find(table, filters, limit=1)), None)

    def count(self, table, filters=None):
        if self.mongo is not None:
            self.indexes()
            return self.mongo[table].count_documents(filters or {})
        where, args = self.where(filters or {})
        with closing(self.connection()) as conn:
            return conn.execute(f'SELECT COUNT(*) FROM {table}{where}', args).fetchone()[0]

    def insert(self, table, values, *, ignore=False):
        if self.mongo is not None:
            from pymongo.errors import DuplicateKeyError
            self.indexes()
            try:
                self.mongo[table].insert_one(dict(values))
            except DuplicateKeyError as error:
                if not ignore:
                    raise sqlite3.IntegrityError('Duplicate record') from error
            return
        columns = ','.join(values)
        placeholders = ','.join('?' for _ in values)
        command = 'INSERT OR IGNORE' if ignore else 'INSERT'
        with closing(self.connection()) as conn, conn:
            conn.execute(f'{command} INTO {table} ({columns}) VALUES ({placeholders})', tuple(values.values()))

    def update(self, table, filters, values):
        if self.mongo is not None:
            self.indexes()
            return self.mongo[table].update_many(filters, {'$set': values}).matched_count
        where, args = self.where(filters)
        assignment = ','.join(f'{key}=?' for key in values)
        with closing(self.connection()) as conn, conn:
            return conn.execute(f'UPDATE {table} SET {assignment}{where}', [*values.values(), *args]).rowcount

    def delete(self, table, **filters):
        if self.mongo is not None:
            self.indexes()
            return self.mongo[table].delete_many(filters).deleted_count
        where, args = self.where(filters)
        with closing(self.connection()) as conn, conn:
            return conn.execute(f'DELETE FROM {table}{where}', args).rowcount
