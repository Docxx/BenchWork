import datetime
import json
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import threading
import unittest

import backup


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        root = Path(self.dir.name)
        self.etc = root / 'etc'
        self.etc.mkdir()
        self.database = root / 'relay.sqlite'
        db = sqlite3.connect(self.database)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE events (id INTEGER PRIMARY KEY, body BLOB)')
        db.executemany('INSERT INTO events (body) VALUES (?)', [(b'x' * 100,)] * 50)
        db.commit()
        db.close()
        self.config = self.etc / 'config.json'
        self.config.write_text(json.dumps({'database': str(self.database), 'port': 443}))
        (self.etc / 'server.crt').write_text('certificate')
        (self.etc / 'server.key').write_text('key')
        self.out = root / 'backups'

    def tearDown(self):
        self.dir.cleanup()

    def at(self, day):
        return datetime.datetime(2026, 11, day, 3, 30, tzinfo=datetime.timezone.utc)

    def test_archive_holds_a_checked_copy_and_what_a_restore_needs(self):
        made = backup.back_up(self.config, self.out, 14, self.at(14))
        self.assertEqual(made.name, 'benchwork-relay-20261114-033000.tar.gz')
        if os.name == 'posix':  # Windows has no such permissions.
            self.assertEqual(made.stat().st_mode & 0o777, 0o600)
        with tarfile.open(made) as archive:
            self.assertEqual(
                sorted(archive.getnames()),
                ['backup.json', 'etc/config.json', 'etc/server.crt', 'etc/server.key', 'relay.sqlite'],
            )
            archive.extract('relay.sqlite', self.out / 'check', filter='data')
        copy = sqlite3.connect(self.out / 'check' / 'relay.sqlite')
        self.assertEqual(copy.execute('SELECT COUNT(*) FROM events').fetchone()[0], 50)
        copy.close()
        # Nothing half-written is left beside it.
        self.assertEqual([p.name for p in self.out.iterdir() if p.name != 'check'], [made.name])

    def test_copies_while_the_relay_is_writing(self):
        stop = threading.Event()

        def write():
            db = sqlite3.connect(self.database, timeout=30)
            while not stop.is_set():
                db.execute('INSERT INTO events (body) VALUES (?)', (b'y' * 100,))
                db.commit()
            db.close()

        writer = threading.Thread(target=write)
        writer.start()
        try:
            made = backup.back_up(self.config, self.out, 14, self.at(14))
        finally:
            stop.set()
            writer.join()
        with tarfile.open(made) as archive:
            archive.extract('relay.sqlite', self.out / 'check', filter='data')
        copy = sqlite3.connect(self.out / 'check' / 'relay.sqlite')
        self.assertEqual(copy.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertGreaterEqual(copy.execute('SELECT COUNT(*) FROM events').fetchone()[0], 50)
        copy.close()

    def test_keeps_only_the_newest(self):
        for day in range(1, 6):
            backup.back_up(self.config, self.out, 3, self.at(day))
        self.assertEqual(
            sorted(p.name for p in self.out.glob('*.tar.gz')),
            [
                'benchwork-relay-20261103-033000.tar.gz',
                'benchwork-relay-20261104-033000.tar.gz',
                'benchwork-relay-20261105-033000.tar.gz',
            ],
        )


if __name__ == '__main__':
    unittest.main()
