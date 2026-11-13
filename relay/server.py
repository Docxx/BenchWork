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
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        try:
            db.execute("PRAGMA synchronous=FULL")
            with db:
                yield db
        finally:
            db.close()

    def handle(self, data):
        if not isinstance(data, dict):
            raise RelayError(400, "Expected an object")
        action = data.get("action")
        with self.connect() as db:
            # Serialise enrolment, deduplication, quotas and revocation together.
            db.execute("BEGIN IMMEDIATE")
            if action == "create":
                setup = data.get("setup", "")
                if not isinstance(setup, str) or not hmac.compare_digest(digest(setup), self.setup_hash):
                    raise RelayError(403, "Invalid server setup code")
                if db.execute("SELECT 1 FROM claimed WHERE setup=?", (self.setup_hash,)).fetchone():
                    raise RelayError(409, "Server setup code already used")
                vault, token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                db.execute("INSERT INTO vaults(id) VALUES(?)", (vault,))
                db.execute("INSERT INTO devices VALUES(?,?,?,1)", (vault, digest(token), self.name(data)))
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
                db.execute("INSERT INTO devices VALUES(?,?,?,0)", (vault, digest(token), self.name(data)))
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
            self.reply(200, {"service": "benchwork-relay", "protocol": 1})
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
            value = self.server.store.handle(json.loads(body))
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
