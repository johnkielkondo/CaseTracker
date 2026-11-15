#!/bin/bash
# Amazon Linux 2023, x86_64. Accept a local server.mjs file or an HTTPS URL.
set -euo pipefail
if [[ $EUID -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash install-api.sh LOCAL_SERVER_MJS_OR_HTTPS_URL" >&2
  exit 1
fi
[[ "$1" == https://* || -f "$1" ]] || { echo 'Use an existing local server.mjs file or an HTTPS URL.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == amzn && "$VERSION_ID" == 2023 ]] || { echo 'This installer targets Amazon Linux 2023.' >&2; exit 1; }
dnf install -y nodejs22
id casetracker >/dev/null 2>&1 || useradd --system --shell /sbin/nologin casetracker
install -d /opt/casetracker-api
if [[ "$1" == https://* ]]; then
  curl --fail --location "$1" -o /opt/casetracker-api/server.new.mjs
else
  cp -- "$1" /opt/casetracker-api/server.new.mjs
fi
/usr/bin/node-22 --check /opt/casetracker-api/server.new.mjs
mv /opt/casetracker-api/server.new.mjs /opt/casetracker-api/server.mjs
cat > /etc/systemd/system/casetracker-api.service <<'UNIT'
[Unit]
Description=CaseTracker API
After=network-online.target
Wants=network-online.target
[Service]
User=casetracker
Group=casetracker
WorkingDirectory=/opt/casetracker-api
ExecStart=/usr/bin/node-22 /opt/casetracker-api/server.mjs
Environment=PORT=3000
EnvironmentFile=-/etc/casetracker/api.env
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable casetracker-api
systemctl restart casetracker-api
curl --fail --retry 15 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
