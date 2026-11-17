"""Make a single-use account sign-up code, through SSH only. Valid for 7 days.

Accounts can also be created from a device that already owns a relay vault, so
this is only needed for someone without one. Run as root and keep the code private:

    sudo -u benchwork-relay python3 /opt/benchwork-relay/signup.py
"""
import hashlib
import secrets
import sqlite3
import sys
import time

DATABASE = '/var/lib/benchwork-relay/relay.sqlite'


def main():
    database = sys.argv[1] if len(sys.argv) > 1 else DATABASE
    code = secrets.token_urlsafe(24)
    db = sqlite3.connect(database, timeout=30)
    try:
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS signups(secret TEXT PRIMARY KEY, expires INTEGER)")
            db.execute("INSERT INTO signups VALUES(?,?)",
                       (hashlib.sha256(code.encode()).hexdigest(), int(time.time()) + 7 * 86400))
    finally:
        db.close()
    print(code)


if __name__ == '__main__':
    main()
