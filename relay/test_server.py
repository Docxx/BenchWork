import base64
import tempfile
import unittest
import http.client
import threading
from pathlib import Path
from server import Store, RelayError, digest, Server, Handler


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.store = Store(Path(self.temp.name) / 'relay.sqlite', digest('setup'))
        self.owner = self.store.handle({'action': 'create', 'setup': 'setup', 'name': 'PC'})

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, **data):
        return self.store.handle({**self.owner, 'action': action, **data})

    def test_single_use_registration_pairing_and_revocation(self):
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'create', 'setup': 'setup', 'name': 'Attacker'})
        invite = self.call('invite')
        client = self.call('join', invitation=invite['invitation'], name='Tablet')
        self.assertNotEqual(client['token'], self.owner['token'])
        with self.assertRaises(RelayError):
            self.call('join', invitation=invite['invitation'], name='Duplicate')
        with self.assertRaises(RelayError):
            self.call('close', token=client['token'])
        self.call('close')
        with self.assertRaises(RelayError):
            self.call('events', token=client['token'])
        with self.assertRaises(RelayError):
            self.call('events')

    def test_durable_idempotent_upload_and_payload_identity(self):
        payload = base64.b64encode(b'encrypted-data-opaque').decode()
        ident = 'a' * 36
        for _ in range(2):
            self.call('append', id=ident, payload=payload)
        reopened = Store(self.store.path, digest('setup'))
        events = reopened.handle({**self.owner, 'action': 'events'})['events']
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['payload'], payload)
        with self.assertRaises(RelayError):
            self.call('append', id=ident, payload=base64.b64encode(b'different-encrypted-content').decode())
        self.call('put', id=ident, payload=payload)
        self.assertEqual(self.call('get', id=ident)['payload'], payload)

    def test_wrong_token_expired_invites_malformed_and_oversized_input(self):
        with self.assertRaises(RelayError):
            self.call('events', token='wrong')
        invite = self.call('invite')
        with self.store.connect() as db:
            db.execute('UPDATE invites SET expires=0')
        with self.assertRaises(RelayError):
            self.call('join', invitation=invite['invitation'], name='Tablet')
        for payload in ('not base64' * 10, 'A' * 1450001):
            with self.assertRaises(RelayError):
                self.call('append', id='x' * 36, payload=payload)
        for after in (-1, 'x', True):
            with self.assertRaises(RelayError):
                self.call('events', after=after)
        with self.assertRaises(RelayError):
            self.call('get', id='../../etc/passwd')


class UpdateDownloads(unittest.TestCase):
    def test_serves_only_published_catalogue_and_installers_without_traversal_or_partial_files(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory).resolve()
            (root / 'latest.json').write_text('{"tag_name":"v0.19.0"}')
            (root / 'BenchWork_0.19.0_arm64.apk').write_bytes(b'verified installer')
            (root / 'latest.json.partial').write_text('unpublished')
            server = Server(('127.0.0.1', 0), Handler)
            server.updates = root
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for path, expected in [('/updates/latest.json', 200), ('/updates/BenchWork_0.19.0_arm64.apk', 200),
                    ('/updates/latest.json.partial', 404), ('/updates/../server.py', 404), ('/updates/%2e%2e%2fserver.py', 404), ('/updates/missing.apk', 404)]:
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                    connection.request('GET', path)
                    response = connection.getresponse()
                    self.assertEqual(response.status, expected)
                    body = response.read()
                    if expected == 200: self.assertEqual(int(response.getheader('Content-Length')), len(body))
                    connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
