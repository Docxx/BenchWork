#!/usr/bin/env bash
# Run over the administrator's authenticated SSH connection, after tests pass.
set -euo pipefail
cd "$(dirname "$0")"
ip="${1:?Pass the relay public IPv4 address}"
if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Expected an IPv4 address' >&2
  exit 1
fi
python3 -m unittest discover -s . -p test_server.py -v
id benchwork-relay >/dev/null 2>&1 || useradd --system --home /var/lib/benchwork-relay --shell /usr/sbin/nologin benchwork-relay
install -d -o root -g root -m 0755 /opt/benchwork-relay
install -d -o root -g benchwork-relay -m 0750 /etc/benchwork-relay
install -d -o benchwork-relay -g benchwork-relay -m 0700 /var/lib/benchwork-relay
install -o root -g root -m 0644 server.py /opt/benchwork-relay/server.py
install -o root -g root -m 0644 admin.py /opt/benchwork-relay/admin.py
if [[ ! -e /etc/benchwork-relay/server.key ]]; then
  umask 077
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 \
    -keyout /etc/benchwork-relay/server.key -out /etc/benchwork-relay/server.crt \
    -subj '/CN=BenchWork private relay' -addext "subjectAltName=IP:$ip" \
    -addext 'basicConstraints=critical,CA:FALSE' \
    -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
    -addext 'extendedKeyUsage=serverAuth' >/dev/null 2>&1
fi
chown root:benchwork-relay /etc/benchwork-relay/server.key /etc/benchwork-relay/server.crt
chmod 0640 /etc/benchwork-relay/server.key /etc/benchwork-relay/server.crt
if [[ ! -e /etc/benchwork-relay/config.json ]]; then
  python3 /opt/benchwork-relay/admin.py "$ip"
fi
cat > /etc/systemd/system/benchwork-relay.service <<'EOF'
[Unit]
Description=BenchWork encrypted sync relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=benchwork-relay
Group=benchwork-relay
ExecStart=/usr/bin/python3 -B /opt/benchwork-relay/server.py --config /etc/benchwork-relay/config.json
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/benchwork-relay
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryMax=384M
TasksMax=32
LimitNOFILE=1024

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now benchwork-relay.service
# Existing active firewalls keep their policy; add only the relay's TLS port.
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then ufw allow 443/tcp; fi
systemctl --no-pager --full status benchwork-relay.service
echo 'Private server setup details: /root/benchwork-relay-setup.json'
