"""Generate a single-use registration code through SSH, never through HTTP.

Running again rotates only the unused server setup code, preserving vaults/data.
Restart the relay afterwards. Requires root; keep the output file private.
"""
import grp
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys


def main():
    ip = sys.argv[1]
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", ip):
        raise SystemExit('Pass the relay public IPv4 address')
    os.umask(0o077)
    setup = secrets.token_urlsafe(32)
    config = Path('/etc/benchwork-relay/config.json')
    content = {
        'database': '/var/lib/benchwork-relay/relay.sqlite',
        'certificate': '/etc/benchwork-relay/server.crt',
        'key': '/etc/benchwork-relay/server.key',
        'port': 443,
        'setupHash': hashlib.sha256(setup.encode()).hexdigest(),
    }
    temporary = config.with_suffix('.new')
    temporary.write_text(json.dumps(content))
    os.chown(temporary, 0, grp.getgrnam('benchwork-relay').gr_gid)
    os.chmod(temporary, 0o640)
    temporary.replace(config)
    Path('/root/benchwork-relay-setup.json').write_text(json.dumps({
        'endpoint': f'https://{ip}',
        'certificate': Path(content['certificate']).read_text(),
        'setup': setup,
    }))
    os.chmod('/root/benchwork-relay-setup.json', 0o600)


if __name__ == '__main__':
    main()
