#!/bin/bash
# Ubuntu 26.04, x86_64. Accept a local web archive or an HTTPS URL.
set -euo pipefail
if [[ $EUID -ne 0 || $# -ne 2 ]]; then
  echo "Usage: sudo bash install-web.sh LOCAL_ARCHIVE_OR_HTTPS_URL API_PRIVATE_IPV4" >&2
  exit 1
fi
artifact_source=$1
api_ip=$2
[[ "$artifact_source" == https://* || -f "$artifact_source" ]] || { echo 'Use an existing local archive or an HTTPS URL.' >&2; exit 1; }
[[ "$api_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo 'Use the API private IPv4 address.' >&2; exit 1; }
IFS=. read -r a b c d <<< "$api_ip"
for octet in "$a" "$b" "$c" "$d"; do
  (( 10#$octet <= 255 )) || { echo 'Invalid IPv4 address.' >&2; exit 1; }
done
[[ $(uname -m) == x86_64 ]] || { echo 'This artifact requires x86_64.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 ]] || { echo 'This installer targets Ubuntu 26.04.' >&2; exit 1; }
# Never stop an unidentified process already serving port 8080.
if ! systemctl is-active --quiet casetracker-web && ss -ltnH 'sport = :8080' | grep -q .; then
  echo 'Port 8080 is occupied. Identify and stop the previous web service before installing.' >&2
  exit 1
fi
apt-get update
apt-get install -y curl ca-certificates libc6 libgcc-s1 libgssapi-krb5-2 libicu78 libssl3t64 libstdc++6 tzdata zlib1g
curl --fail --connect-timeout 5 --max-time 20 "http://$api_ip:3000/api/health"
id casetracker >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin casetracker
release_dir=$(mktemp -d /opt/casetracker-web-XXXXXXXX)
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
if [[ "$artifact_source" == https://* ]]; then
  curl --fail --location "$artifact_source" -o "$archive"
else
  cp -- "$artifact_source" "$archive"
fi
tar -xzf "$archive" -C "$release_dir"
test -f "$release_dir/CaseTracker"
test -f "$release_dir/dist/index.html"
chmod 755 "$release_dir/CaseTracker"
chown -R root:root "$release_dir"
chmod -R a+rX "$release_dir"
install -d -m 755 /etc/casetracker
printf 'ApiBaseUrl=http://%s:3000\n' "$api_ip" > /etc/casetracker/web.env
chmod 600 /etc/casetracker/web.env
cat > /etc/systemd/system/casetracker-web.service <<UNIT
[Unit]
Description=CaseTracker web host and API proxy
After=network-online.target
Wants=network-online.target
[Service]
User=casetracker
Group=casetracker
WorkingDirectory=$release_dir
ExecStart=$release_dir/CaseTracker
Environment=ASPNETCORE_URLS=http://0.0.0.0:8080
Environment=ASPNETCORE_ENVIRONMENT=Production
EnvironmentFile=/etc/casetracker/web.env
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
systemctl enable casetracker-web
systemctl restart casetracker-web
curl --fail --retry 15 --retry-connrefused --retry-delay 2 http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/api/health
echo 'Web host installed on port 8080; API proxy verified.'
