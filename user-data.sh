#!/bin/bash
# ===== Launch Template User Data: installs and starts the API =====
dnf install -y nodejs
mkdir -p /opt/api
cat > /opt/api/server.js <<'EOF'
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const PORT = 80;
const startedAt = Date.now();
let info = {};
// Ask the EC2 Instance Metadata Service (IMDSv2) about this server
async function imds(path) {
  try {
    const t = await fetch("http://169.254.169.254/latest/api/token", {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "300" }
    });
    const token = await t.text();
    const r = await fetch("http://169.254.169.254/latest/meta-data/" + path, {
      headers: { "X-aws-ec2-metadata-token": token }
    });
    return r.ok ? await r.text() : "none";
  } catch (e) {
    return "unknown";
  }
}
async function loadInfo() {
  info = {
    instanceId: await imds("instance-id"),
    instanceType: await imds("instance-type"),
    availabilityZone: await imds("placement/availability-zone"),
    placementGroup: await imds("placement/group-name"),
    partitionNumber: await imds("placement/partition-number"),
    privateIp: await imds("local-ipv4")
  };
}
function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(body, null, 2));
}
const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.url === "/api/health") return send(res, 200, { status: "ok" });
  if (req.url === "/api/info") {
    return send(res, 200, {
      ...info,
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg().map(n => n.toFixed(2)),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      servedAt: new Date().toISOString()
    });
  }
  if (req.url === "/api/stress") {
    // Burn 100% of every CPU on THIS instance for 5 minutes
    for (let i = 0; i < os.cpus().length; i++) {
      spawn("timeout", ["300", "sh", "-c", "while :; do :; done"],
        { detached: true, stdio: "ignore" }).unref();
    }
    return send(res, 200, {
      message: "CPU stress started for 300 seconds",
      instanceId: info.instanceId
    });
  }
  send(res, 404, { error: "Not found" });
});
loadInfo().then(() => server.listen(PORT, () => console.log("API up")));
EOF
cat > /etc/systemd/system/api.service <<'EOF'
[Unit]
Description=Auto Scaling Lab API
After=network-online.target
[Service]
ExecStart=/usr/bin/node /opt/api/server.js
Restart=always
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now api
