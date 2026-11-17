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


KDF = '{"alg":"argon2id","m":65536,"t":3,"p":1}'
KEYRING = base64.b64encode(b'sealed-keyring-the-relay-cannot-open').decode()


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.store = Store(Path(self.temp.name) / 'relay.sqlite', digest('setup'))
        self.owner = self.store.handle({'action': 'create', 'setup': 'setup', 'name': 'PC'})

    def tearDown(self):
        self.temp.cleanup()

    def register(self, **extra):
        return self.store.handle({'action': 'register', 'login': 'Ray', 'salt': 'c2FsdHNhbHRzYWx0c2FsdA==',
                                  'kdf': KDF, 'auth': 'a' * 43, 'keyring': KEYRING, 'recovery': 'r' * 43,
                                  'rkeyring': KEYRING, 'name': 'PC', **extra})

    def login(self, auth='a' * 43, name='Tablet', ip='10.0.0.1'):
        return self.store.handle({'action': 'login', 'login': 'ray', 'auth': auth, 'name': name}, ip)

    def test_registration_is_closed_without_an_owner_credential_or_signup_code(self):
        with self.assertRaises(RelayError):
            self.register()
        with self.assertRaises(RelayError):
            self.register(vault=self.owner['vault'], token='wrong')
        with self.assertRaises(RelayError):
            self.register(signup='made-up-code')
        invite = self.store.handle({**self.owner, 'action': 'invite'})
        tablet = self.store.handle({**self.owner, 'action': 'join', 'invitation': invite['invitation'], 'name': 'Tab'})
        with self.assertRaises(RelayError):
            self.register(vault=self.owner['vault'], token=tablet['token'])

    def test_owner_migrates_and_a_new_device_joins_the_same_vault_with_its_login(self):
        account = self.register(vault=self.owner['vault'], token=self.owner['token'])
        with self.assertRaises(RelayError):
            self.register(vault=self.owner['vault'], token=self.owner['token'], login='other')
        prelogin = self.store.handle({'action': 'prelogin', 'login': ' RAY '})
        self.assertEqual(prelogin['kdf'], KDF)
        signed = self.login()
        self.assertEqual(signed['keyring'], KEYRING)
        joined = self.store.handle({'action': 'vault_join', 'session': signed['session'],
                                    'vault': self.owner['vault'], 'name': 'Tablet'})
        events = self.store.handle({'action': 'events', 'vault': self.owner['vault'], 'token': joined['token']})
        self.assertEqual(events['events'], [])
        names = [d['name'] for d in self.store.handle({'action': 'account_devices', 'session': account['session']})['devices']]
        self.assertEqual(names, ['PC', 'Tablet'])
        # Removing a device revokes its sign-in and its vault credential together.
        self.store.handle({'action': 'remove_device', 'session': account['session'], 'device': signed['device']})
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'events', 'vault': self.owner['vault'], 'token': joined['token']})
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'keyring_get', 'session': signed['session']})

    def test_other_accounts_cannot_join_and_unknown_names_get_stable_fake_salts(self):
        self.register(vault=self.owner['vault'], token=self.owner['token'])
        with self.store.connect() as db:
            db.execute("INSERT INTO signups VALUES(?,?)", (digest('code-for-sam'), 9999999999))
        sam = self.register(signup='code-for-sam', login='sam')
        with self.assertRaises(RelayError):
            self.register(signup='code-for-sam', login='sam2')
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'vault_join', 'session': sam['session'], 'vault': self.owner['vault'], 'name': 'X'})
        first = self.store.handle({'action': 'prelogin', 'login': 'nobody'})
        self.assertEqual(first, self.store.handle({'action': 'prelogin', 'login': 'nobody'}))
        self.assertEqual(first['kdf'], KDF)

    def test_keyring_compare_and_swap_and_password_change(self):
        account = self.register(vault=self.owner['vault'], token=self.owner['token'])
        session = account['session']
        put = {'action': 'keyring_put', 'session': session, 'keyring': KEYRING, 'rkeyring': KEYRING}
        self.assertEqual(self.store.handle({**put, 'version': 1})['version'], 2)
        with self.assertRaises(RelayError):
            self.store.handle({**put, 'version': 1})
        change = {'action': 'change_password', 'session': session, 'salt': 'bmV3c2FsdG5ld3NhbHQ=',
                  'kdf': KDF, 'auth': 'b' * 43, 'keyring': KEYRING, 'rkeyring': KEYRING, 'version': 2}
        with self.assertRaises(RelayError):
            self.store.handle({**change, 'current': 'wrong' * 5})
        self.store.handle({**change, 'current': 'a' * 43})
        with self.assertRaises(RelayError):
            self.login()
        self.assertEqual(self.login(auth='b' * 43)['version'], 3)
        # Forgotten password: the recovery key signs in and sets a new one.
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'login', 'login': 'ray', 'recovery': 'x' * 43, 'name': 'New'})
        rescued = self.store.handle({'action': 'login', 'login': 'ray', 'recovery': 'r' * 43, 'name': 'New'})
        self.store.handle({**change, 'session': rescued['session'], 'recovery': 'r' * 43,
                           'auth': 'c' * 43, 'version': 3})
        self.assertEqual(self.login(auth='c' * 43)['version'], 4)

    def test_sign_in_failures_are_limited_by_username_and_by_address(self):
        self.register(vault=self.owner['vault'], token=self.owner['token'])
        for _ in range(5):
            with self.assertRaises(RelayError) as wrong:
                self.login(auth='z' * 43)
            self.assertEqual(wrong.exception.status, 403)
        with self.assertRaises(RelayError) as limited:
            self.login()
        self.assertEqual(limited.exception.status, 429)
        with self.store.connect() as db:
            db.execute("UPDATE attempts SET start=0 WHERE key LIKE 'login:%'")
        self.assertIn('session', self.login())
        for attempt in range(20):
            with self.assertRaises(RelayError):
                self.store.handle({'action': 'login', 'login': f'guess{attempt}', 'auth': 'z' * 43, 'name': 'X'}, '10.0.0.9')
        with self.assertRaises(RelayError) as blocked:
            self.store.handle({'action': 'login', 'login': 'ray', 'auth': 'a' * 43, 'name': 'X'}, '10.0.0.9')
        self.assertEqual(blocked.exception.status, 429)

    def test_logout_and_vault_create_for_an_account(self):
        account = self.register(vault=self.owner['vault'], token=self.owner['token'])
        made = self.store.handle({'action': 'vault_create', 'session': account['session'], 'name': 'PC'})
        joined = self.store.handle({'action': 'vault_join', 'session': account['session'],
                                    'vault': made['vault'], 'name': 'PC'})
        self.store.handle({'action': 'append', 'vault': made['vault'], 'token': joined['token'],
                           'id': 'b' * 36, 'payload': KEYRING})
        self.store.handle({'action': 'logout', 'session': account['session']})
        with self.assertRaises(RelayError):
            self.store.handle({'action': 'events', 'vault': made['vault'], 'token': joined['token']})
        # The account's owner credential, kept in the keyring, survives a sign-out.
        self.store.handle({'action': 'events', 'vault': made['vault'], 'token': made['token']})
        # The original pairing credential, made before the account, still works.
        self.store.handle({**self.owner, 'action': 'events'})


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
