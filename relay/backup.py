"""Back up the relay: a consistent copy of its database and the files it needs.

Run nightly by benchwork-relay-backup.timer, as the relay's own user. Each
backup is one archive in /var/backups/benchwork-relay holding:

  relay.sqlite   a copy made with SQLite's online backup, so it is complete
                 even while the relay is writing (copying the file is not);
  etc/           the certificate, its key and config.json, which a restored
                 relay needs so paired devices still trust and reach it.

The copy is checked with PRAGMA integrity_check before it is kept. The newest
KEEP archives stay; older ones are removed. Installers in the updates folder
are left out: they can be published again.

The archive holds the relay's TLS key, so it is readable only by its owner.
Notes in the database are encrypted on the devices; the relay never had them.
"""
import argparse
import datetime
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile

KEEP = 14
PREFIX = 'benchwork-relay-'
SUFFIX = '.tar.gz'


def consistent_copy(database: Path, target: Path) -> None:
    """Copies a live SQLite database with the online backup API, then checks it."""
    source = sqlite3.connect(f'{database.resolve().as_uri()}?mode=ro', uri=True, timeout=30)
    try:
        copy = sqlite3.connect(target)
        try:
            source.backup(copy)
            result = copy.execute('PRAGMA integrity_check').fetchone()
            if result is None or result[0] != 'ok':
                raise SystemExit(f'Backup copy failed its integrity check: {result}')
        finally:
            copy.close()
    finally:
        source.close()


def prune(folder: Path, keep: int) -> list[Path]:
    """Removes all but the newest `keep` archives; returns those removed."""
    archives = sorted(p for p in folder.glob(f'{PREFIX}*{SUFFIX}') if p.is_file())
    removed = archives[:-keep] if keep > 0 else archives
    for p in removed:
        p.unlink()
    return removed


def back_up(config_path: Path, folder: Path, keep: int, now: datetime.datetime) -> Path:
    config = json.loads(config_path.read_text())
    database = Path(config['database'])
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.umask(0o077)
    stamp = now.strftime('%Y%m%d-%H%M%S')
    final = folder / f'{PREFIX}{stamp}{SUFFIX}'
    with tempfile.TemporaryDirectory(dir=folder) as work:
        copy = Path(work) / 'relay.sqlite'
        consistent_copy(database, copy)
        partial = folder / f'.{final.name}.partial'
        with tarfile.open(partial, 'w:gz') as archive:
            archive.add(copy, arcname='relay.sqlite')
            for name in ('config.json', 'server.crt', 'server.key'):
                path = config_path.parent / name
                if path.is_file():
                    archive.add(path, arcname=f'etc/{name}')
            note = json.dumps({'made': now.isoformat(), 'database': str(database)}).encode()
            info = tarfile.TarInfo('backup.json')
            info.size = len(note)
            info.mtime = int(now.timestamp())
            archive.addfile(info, io.BytesIO(note))
        os.chmod(partial, 0o600)
        partial.replace(final)
    prune(folder, keep)
    return final


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--config', default='/etc/benchwork-relay/config.json')
    parser.add_argument('--to', default='/var/backups/benchwork-relay')
    parser.add_argument('--keep', type=int, default=KEEP)
    args = parser.parse_args(argv)
    made = back_up(
        Path(args.config),
        Path(args.to),
        max(1, args.keep),
        datetime.datetime.now(datetime.timezone.utc),
    )
    print(f'Backed up to {made} ({made.stat().st_size} bytes)')


if __name__ == '__main__':
    main(sys.argv[1:])
