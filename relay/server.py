"""BenchWork opaque relay. Python 3.12+, SQLite, TLS, no third-party packages.

Neither vault keys nor file names/content are sent to this service. All secrets
are compared as SHA-256 digests; TLS protects the device bearer credentials.
"""
import argparse
from contextlib import contextmanager
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import ssl
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 1600000
MAX_PAYLOAD = 1450000
QUOTA = 10 * 1024**3
ID = re.compile(r"^[a-zA-Z0-9_-]{16,100}$")
LOGIN = re.compile(r"^[a-z0-9._@+-]{3,80}$")
MAX_KEYRING = 262144
# Sign-in limits: failures per username per 15 minutes, and per address per hour.
LOGIN_LIMIT, LOGIN_WINDOW = 5, 900
IP_LIMIT, IP_WINDOW = 20, 3600
DEFAULT_KDF = '{"alg":"argon2id","m":65536,"t":3,"p":1}'
ACCOUNT_ACTIONS = {"prelogin", "register", "logout", "keyring_get", "keyring_put",
                   "vault_create", "vault_join", "vault_attach", "account_devices",
                   "remove_device", "change_password"}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class RelayError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Store:
    def __init__(self, path, setup_hash):
        self.path, self.setup_hash = str(path), setup_hash
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS vaults(id TEXT PRIMARY KEY, closed INTEGER DEFAULT 0);
                CREATE TABLE IF NOT EXISTS devices(vault TEXT, token TEXT PRIMARY KEY, name TEXT, owner INTEGER);
                CREATE TABLE IF NOT EXISTS invites(vault TEXT, secret TEXT PRIMARY KEY, expires INTEGER);
                CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, vault TEXT, id TEXT, payload TEXT, UNIQUE(vault,id));
                CREATE INDEX IF NOT EXISTS event_vault ON events(vault,seq);
                CREATE TABLE IF NOT EXISTS blobs(vault TEXT, id TEXT, payload TEXT, PRIMARY KEY(vault,id));
                CREATE TABLE IF NOT EXISTS claimed(setup TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, login TEXT UNIQUE, salt TEXT, kdf TEXT,
                    auth TEXT, keyring TEXT, version INTEGER, created INTEGER);
                CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token TEXT UNIQUE, account TEXT, name TEXT,
                    created INTEGER, seen INTEGER);
                CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER, start INTEGER);
                CREATE TABLE IF NOT EXISTS signups(secret TEXT PRIMARY KEY, expires INTEGER);
            """)
            # Older databases gain account columns in place; existing rows keep working.
            if "account" not in {r[1] for r in db.execute("PRAGMA table_info(vaults)")}:
                db.execute("ALTER TABLE vaults ADD COLUMN account TEXT")
            if "session" not in {r[1] for r in db.execute("PRAGMA table_info(devices)")}:
                db.execute("ALTER TABLE devices ADD COLUMN session TEXT")
            if not db.execute("SELECT 1 FROM meta WHERE key='pepper'").fetchone():
                db.execute("INSERT INTO meta VALUES('pepper',?)", (secrets.token_hex(32),))
            self.pepper = db.execute("SELECT value FROM meta WHERE key='pepper'").fetchone()[0].encode()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        try:
            db.execute("PRAGMA synchronous=FULL")
            with db:
                yield db
        finally:
            db.close()

    def handle(self, data, ip=""):
        if not isinstance(data, dict):
            raise RelayError(400, "Expected an object")
        action = data.get("action")
        if action == "login":
            return self.login(data, ip)
        with self.connect() as db:
            # Serialise enrolment, deduplication, quotas and revocation together.
            db.execute("BEGIN IMMEDIATE")
            if action in ACCOUNT_ACTIONS:
                return self.account(db, action, data)
            if action == "create":
                setup = data.get("setup", "")
                if not isinstance(setup, str) or not hmac.compare_digest(digest(setup), self.setup_hash):
                    raise RelayError(403, "Invalid server setup code")
                if db.execute("SELECT 1 FROM claimed WHERE setup=?", (self.setup_hash,)).fetchone():
                    raise RelayError(409, "Server setup code already used")
                vault, token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                db.execute("INSERT INTO vaults(id) VALUES(?)", (vault,))
                db.execute("INSERT INTO devices(vault,token,name,owner) VALUES(?,?,?,1)", (vault, digest(token), self.name(data)))
                db.execute("INSERT INTO claimed VALUES(?)", (self.setup_hash,))
                return {"vault": vault, "token": token}
            vault = data.get("vault", "")
            if not isinstance(vault, str) or not ID.fullmatch(vault):
                raise RelayError(400, "Invalid vault")
            if not db.execute("SELECT 1 FROM vaults WHERE id=? AND closed=0", (vault,)).fetchone():
                raise RelayError(403, "Vault access unavailable")
            if action == "join":
                invite = data.get("invitation", "")
                if not isinstance(invite, str) or len(invite) > 100:
                    raise RelayError(400, "Invalid invitation")
                row = db.execute("SELECT expires FROM invites WHERE vault=? AND secret=?", (vault, digest(invite))).fetchone()
                if not row or row[0] < time.time():
                    raise RelayError(403, "Invitation expired or already used")
                token = secrets.token_urlsafe(32)
                db.execute("DELETE FROM invites WHERE secret=?", (digest(invite),))
                db.execute("INSERT INTO devices(vault,token,name,owner) VALUES(?,?,?,0)", (vault, digest(token), self.name(data)))
                return {"token": token}
            token = data.get("token", "")
            if not isinstance(token, str) or len(token) > 100:
                raise RelayError(403, "Invalid device credential")
            device = db.execute("SELECT owner FROM devices WHERE vault=? AND token=?", (vault, digest(token))).fetchone()
            if not device:
                raise RelayError(403, "Device access removed")
            if action == "invite":
                self.owner(device)
                secret, expires = secrets.token_urlsafe(32), int(time.time()) + 600
                db.execute("DELETE FROM invites WHERE expires<?", (int(time.time()),))
                db.execute("INSERT INTO invites VALUES(?,?,?)", (vault, digest(secret), expires))
                return {"invitation": secret, "expires": expires}
            if action == "devices":
                return {"devices": [r[0] for r in db.execute("SELECT name FROM devices WHERE vault=?", (vault,))]}
            if action == "close":
                self.owner(device)
                db.execute("UPDATE vaults SET closed=1 WHERE id=?", (vault,))
                db.execute("DELETE FROM invites WHERE vault=?", (vault,))
                return {"closed": True}
            if action == "events":
                after = data.get("after", 0)
                if not isinstance(after, int) or isinstance(after, bool) or after < 0:
                    raise RelayError(400, "Invalid cursor")
                events, size = [], 0
                for seq, ident, payload in db.execute("SELECT seq,id,payload FROM events WHERE vault=? AND seq>? ORDER BY seq LIMIT 32", (vault, after)):
                    if events and size + len(payload) > 3000000:
                        break
                    events.append({"seq": seq, "id": ident, "payload": payload})
                    size += len(payload)
                return {"events": events}
            ident = data.get("id", "")
            if not isinstance(ident, str) or not ID.fullmatch(ident):
                raise RelayError(400, "Invalid object identifier")
            if action == "get":
                row = db.execute("SELECT payload FROM blobs WHERE vault=? AND id=?", (vault, ident)).fetchone()
                if not row:
                    raise RelayError(404, "Encrypted object unavailable")
                return {"payload": row[0]}
            if action in ("append", "put"):
                payload = data.get("payload")
                if not isinstance(payload, str) or not 20 <= len(payload) <= MAX_PAYLOAD:
                    raise RelayError(413, "Encrypted object exceeds size limit")
                try:
                    base64.b64decode(payload, validate=True)
                except ValueError as exc:
                    raise RelayError(400, "Invalid encrypted object") from exc
                table = "events" if action == "append" else "blobs"
                prior = db.execute(f"SELECT payload FROM {table} WHERE vault=? AND id=?", (vault, ident)).fetchone()
                if prior:
                    if prior[0] != payload:
                        raise RelayError(409, "Object identity already used")
                    return {"stored": True}
                size = sum(db.execute(f"SELECT COALESCE(SUM(LENGTH(payload)),0) FROM {t} WHERE vault=?", (vault,)).fetchone()[0] for t in ("events", "blobs"))
                if size + len(payload) > QUOTA:
                    raise RelayError(507, "Relay vault storage is full")
                db.execute(f"INSERT INTO {table}(vault,id,payload) VALUES(?,?,?)", (vault, ident, payload))
                return {"stored": True}
            raise RelayError(400, "Unsupported relay action")

    # Accounts. The relay keeps a SHA-256 of the sign-in key each device derives
    # from the password, and an encrypted keyring it cannot open. Passwords and
    # vault keys never arrive here.

    def login_id(self, data):
        login = data.get("login", "")
        if not isinstance(login, str):
            raise RelayError(400, "Invalid username")
        login = login.strip().lower()
        if not LOGIN.fullmatch(login):
            raise RelayError(400, "Use 3 to 80 letters, numbers or . _ @ + -")
        return hmac.new(self.pepper, login.encode(), hashlib.sha256).hexdigest()

    @staticmethod
    def secret(data, key):
        value = data.get(key, "")
        if not isinstance(value, str) or not 20 <= len(value) <= 100:
            raise RelayError(400, "Invalid request")
        return value

    @staticmethod
    def keyring(data):
        value = data.get("keyring", "")
        if not isinstance(value, str) or not 40 <= len(value) <= MAX_KEYRING:
            raise RelayError(413, "Encrypted keyring exceeds size limit")
        try:
            base64.b64decode(value, validate=True)
        except ValueError as exc:
            raise RelayError(400, "Invalid encrypted keyring") from exc
        return value

    @staticmethod
    def kdf(data):
        salt, kdf = data.get("salt", ""), data.get("kdf", "")
        if not isinstance(salt, str) or not 16 <= len(salt) <= 64:
            raise RelayError(400, "Invalid salt")
        if not isinstance(kdf, str) or len(kdf) > 200:
            raise RelayError(400, "Invalid key settings")
        try:
            settings = json.loads(kdf)
        except ValueError as exc:
            raise RelayError(400, "Invalid key settings") from exc
        if not isinstance(settings, dict) or settings.get("alg") != "argon2id":
            raise RelayError(400, "Invalid key settings")
        return salt, kdf

    def start_session(self, db, account, data):
        token, ident, now = secrets.token_urlsafe(32), secrets.token_urlsafe(16), int(time.time())
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)",
                   (ident, digest(token), account, self.name(data), now, now))
        return token, ident

    @staticmethod
    def session(db, data):
        token = data.get("session", "")
        if not isinstance(token, str) or len(token) > 100:
            raise RelayError(401, "Signed out. Sign in again.")
        row = db.execute("SELECT id, account FROM sessions WHERE token=?", (digest(token),)).fetchone()
        if not row:
            raise RelayError(401, "Signed out. Sign in again.")
        db.execute("UPDATE sessions SET seen=? WHERE id=?", (int(time.time()), row[0]))
        return row

    def login(self, data, ip):
        login = self.login_id(data)
        auth = self.secret(data, "auth")
        now = int(time.time())
        keys = [("login:" + login, LOGIN_LIMIT, LOGIN_WINDOW), ("ip:" + str(ip), IP_LIMIT, IP_WINDOW)]
        # Failures are committed before the error is raised, so they count.
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for key, limit, window in keys:
                row = db.execute("SELECT count, start FROM attempts WHERE key=?", (key,)).fetchone()
                if row and row[1] + window > now and row[0] >= limit:
                    raise RelayError(429, "Too many tries. Wait 15 minutes.")
            row = db.execute("SELECT id, auth, keyring, version FROM accounts WHERE login=?", (login,)).fetchone()
            if row and hmac.compare_digest(digest(auth), row[1]):
                db.execute("DELETE FROM attempts WHERE key=?", (keys[0][0],))
                token, ident = self.start_session(db, row[0], data)
                return {"session": token, "device": ident, "keyring": row[2], "version": row[3]}
            for key, _, window in keys:
                prior = db.execute("SELECT start FROM attempts WHERE key=?", (key,)).fetchone()
                if prior and prior[0] + window > now:
                    db.execute("UPDATE attempts SET count=count+1 WHERE key=?", (key,))
                else:
                    db.execute("INSERT OR REPLACE INTO attempts VALUES(?,1,?)", (key, now))
        raise RelayError(403, "Username or password is wrong.")

    @staticmethod
    def owned_vault(db, data):
        vault, token = data.get("vault", ""), data.get("token", "")
        if not isinstance(vault, str) or not ID.fullmatch(vault) or not isinstance(token, str) or len(token) > 100:
            raise RelayError(403, "Use the vault's original device for this action")
        row = db.execute("SELECT d.owner, v.account FROM devices d JOIN vaults v ON v.id=d.vault "
                         "WHERE d.vault=? AND d.token=? AND v.closed=0", (vault, digest(token))).fetchone()
        if not row or not row[0]:
            raise RelayError(403, "Use the vault's original device for this action")
        return vault, row[1]

    def account(self, db, action, data):
        if action == "prelogin":
            login = self.login_id(data)
            row = db.execute("SELECT salt, kdf FROM accounts WHERE login=?", (login,)).fetchone()
            if row:
                return {"salt": row[0], "kdf": row[1]}
            # A stable made-up salt, so unknown names look the same as real ones.
            fake = hmac.new(self.pepper, b"salt:" + login.encode(), hashlib.sha256).digest()[:16]
            return {"salt": base64.b64encode(fake).decode(), "kdf": DEFAULT_KDF}
        if action == "register":
            login = self.login_id(data)
            salt, kdf = self.kdf(data)
            auth, keyring = self.secret(data, "auth"), self.keyring(data)
            attach = None
            signup = data.get("signup")
            if isinstance(signup, str) and signup:
                row = db.execute("SELECT expires FROM signups WHERE secret=?", (digest(signup),)).fetchone()
                if not row or row[0] < time.time():
                    raise RelayError(403, "Sign-up code expired or already used")
                db.execute("DELETE FROM signups WHERE secret=?", (digest(signup),))
            else:
                # Without a sign-up code, only a device that owns a vault here can
                # create an account. Registration is never open to the public.
                attach, existing = self.owned_vault(db, data)
                if existing:
                    raise RelayError(409, "This vault already belongs to an account")
            if db.execute("SELECT 1 FROM accounts WHERE login=?", (login,)).fetchone():
                raise RelayError(409, "That username is taken")
            account = secrets.token_urlsafe(16)
            db.execute("INSERT INTO accounts VALUES(?,?,?,?,?,?,1,?)",
                       (account, login, salt, kdf, digest(auth), keyring, int(time.time())))
            if attach:
                db.execute("UPDATE vaults SET account=? WHERE id=?", (account, attach))
            token, ident = self.start_session(db, account, data)
            return {"session": token, "device": ident, "version": 1}
        ident, account = self.session(db, data)
        if action == "logout":
            db.execute("DELETE FROM devices WHERE session=?", (ident,))
            db.execute("DELETE FROM sessions WHERE id=?", (ident,))
            return {"signedOut": True}
        if action == "keyring_get":
            row = db.execute("SELECT keyring, version FROM accounts WHERE id=?", (account,)).fetchone()
            return {"keyring": row[0], "version": row[1]}
        if action == "keyring_put":
            keyring, version = self.keyring(data), data.get("version")
            current = db.execute("SELECT version FROM accounts WHERE id=?", (account,)).fetchone()[0]
            # Compare and swap: a device must have seen the latest keyring first.
            if not isinstance(version, int) or isinstance(version, bool) or version != current:
                raise RelayError(409, "Keyring changed on another device")
            db.execute("UPDATE accounts SET keyring=?, version=? WHERE id=?", (keyring, current + 1, account))
            return {"version": current + 1}
        if action == "change_password":
            row = db.execute("SELECT auth, version FROM accounts WHERE id=?", (account,)).fetchone()
            if not hmac.compare_digest(digest(self.secret(data, "current")), row[0]):
                raise RelayError(403, "Current password is wrong.")
            salt, kdf = self.kdf(data)
            keyring, version, auth = self.keyring(data), data.get("version"), self.secret(data, "auth")
            if version != row[1]:
                raise RelayError(409, "Keyring changed on another device")
            db.execute("UPDATE accounts SET salt=?, kdf=?, auth=?, keyring=?, version=? WHERE id=?",
                       (salt, kdf, digest(auth), keyring, row[1] + 1, account))
            # Other devices keep their sessions; they hold the keys already.
            return {"version": row[1] + 1}
        if action == "account_devices":
            rows = db.execute("SELECT id, name, seen FROM sessions WHERE account=? ORDER BY created", (account,))
            return {"devices": [{"id": r[0], "name": r[1], "seen": r[2], "current": r[0] == ident} for r in rows]}
        if action == "remove_device":
            target = data.get("device", "")
            if not isinstance(target, str) or not db.execute(
                    "SELECT 1 FROM sessions WHERE id=? AND account=?", (target, account)).fetchone():
                raise RelayError(404, "Device not found")
            db.execute("DELETE FROM devices WHERE session=?", (target,))
            db.execute("DELETE FROM sessions WHERE id=?", (target,))
            return {"removed": True}
        if action == "vault_create":
            vault, token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            # The owner credential belongs to the account (kept in its keyring), not
            # to this device, so signing this device out never loses it. Devices
            # then join with credentials of their own.
            db.execute("INSERT INTO vaults(id, account) VALUES(?,?)", (vault, account))
            db.execute("INSERT INTO devices(vault,token,name,owner) VALUES(?,?,?,1)",
                       (vault, digest(token), "Account owner"))
            return {"vault": vault, "token": token}
        if action == "vault_attach":
            vault, existing = self.owned_vault(db, data)
            if existing and existing != account:
                raise RelayError(409, "This vault already belongs to an account")
            db.execute("UPDATE vaults SET account=? WHERE id=?", (account, vault))
            return {"attached": True}
        if action == "vault_join":
            vault = data.get("vault", "")
            if not isinstance(vault, str) or not ID.fullmatch(vault) or not db.execute(
                    "SELECT 1 FROM vaults WHERE id=? AND account=? AND closed=0", (vault, account)).fetchone():
                raise RelayError(403, "Vault access unavailable")
            token = secrets.token_urlsafe(32)
            db.execute("INSERT INTO devices(vault,token,name,owner,session) VALUES(?,?,?,0,?)",
                       (vault, digest(token), self.name(data), ident))
            return {"token": token}
        raise RelayError(400, "Unsupported relay action")

    @staticmethod
    def name(data):
        name = data.get("name", "")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise RelayError(400, "Choose a device name")
        return name.strip()

    @staticmethod
    def owner(device):
        if not device[0]:
            raise RelayError(403, "Use the vault's original device for this action")


class Handler(BaseHTTPRequestHandler):
    server_version = "BenchWorkRelay/1"

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, *_):
        pass  # Never log credentials, invitations, or encrypted request bodies.

    def reply(self, status, value):
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"service": "benchwork-relay", "protocol": 2})
            return
        if self.path.startswith('/updates/'):
            name = self.path[len('/updates/'):]
            root = self.server.updates
            if name != 'latest.json' and not re.fullmatch(r'BenchWork(?:-Labels)?_\d+\.\d+\.\d+_(?:x64-setup\.exe|(?:android-)?arm64\.apk)', name):
                self.reply(404, {"error": "Update unavailable"})
                return
            path = (root / name).resolve()
            if path.parent != root or not path.is_file():
                self.reply(404, {"error": "Update unavailable"})
                return
            try:
                with path.open('rb') as source:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json' if name == 'latest.json' else 'application/octet-stream')
                    self.send_header('Content-Length', str(os.fstat(source.fileno()).st_size))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    while chunk := source.read(65536):
                        self.wfile.write(chunk)
                self.close_connection = True
            except (OSError, TimeoutError):
                self.close_connection = True
            return
        self.reply(404, {"error": "Unknown endpoint"})

    def do_POST(self):
        try:
            if self.path != "/v1/relay":
                raise RelayError(404, "Unknown endpoint")
            if self.headers.get("Transfer-Encoding"):
                raise RelayError(400, "Chunked requests are unsupported")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise RelayError(413, "Request exceeds size limit")
            body = self.rfile.read(length)
            if len(body) != length:
                raise RelayError(400, "Incomplete request")
            value = self.server.store.handle(json.loads(body), self.client_address[0])
            self.reply(200, value)
        except RelayError as exc:
            self.reply(exc.status, {"error": exc.message})
        except (ValueError, UnicodeError):
            self.reply(400, {"error": "Malformed request"})
        except Exception:
            self.reply(503, {"error": "Relay unavailable; retry later"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(16)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        super().process_request(request, address)

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    os.umask(0o077)
    server = Server((config.get("bind", "0.0.0.0"), config.get("port", 443)), Handler)
    server.store = Store(config["database"], config["setupHash"])
    server.updates = Path(config.get('updates', str(Path(config['database']).parent / 'updates'))).resolve()
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(config["certificate"], config["key"])
    server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
    server.serve_forever()


if __name__ == "__main__":
    main()
