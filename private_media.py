"""Private media storage for local disks and hosted MongoDB."""
from contextlib import contextmanager


class PrivateMedia:
    def __init__(self, directory, database=None):
        self.directory = directory
        self.bucket = None
        if database is not None:
            from gridfs import GridFSBucket
            self.bucket = GridFSBucket(database, bucket_name='private_media')

    @contextmanager
    def open(self, name):
        if self.bucket is None:
            with (self.directory / name).open('rb') as stream:
                yield stream
            return
        from gridfs.errors import NoFile
        try:
            with self.bucket.open_download_stream(name) as stream:
                yield stream
        except NoFile as error:
            raise FileNotFoundError(name) from error

    def write(self, name, content):
        if self.bucket is None:
            (self.directory / name).write_bytes(content)
        else:
            self.bucket.upload_from_stream_with_id(name, name, content)

    def delete(self, name):
        if self.bucket is None:
            (self.directory / name).unlink(missing_ok=True)
        else:
            from gridfs.errors import NoFile
            try:
                self.bucket.delete(name)
            except NoFile:
                pass
