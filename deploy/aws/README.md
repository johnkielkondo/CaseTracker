# Two EC2 instances, without Nginx

The demo web address last configured on November 14, 2026 is `https://18.141.214.247/`; the API public address is `18.142.159.33`. These are auto-assigned public IPs and can change after stop/start. Confirm them in EC2 before running SSH/SCP commands. The previous Elastic IP was released. HTTPS certificates and the renewal hook must be updated if the web public IP changes. The API's private address remains `172.31.0.254` while its existing network interface is retained.

**Application API upgrade:** before deploying the current frontend, follow [API-MIGRATION.md](API-MIGRATION.md). The original infrastructure walkthrough below predates the live Elastic IP and HTTPS setup. The web instance now uses `https://18.141.214.247/`, terminates TLS directly, and keeps port 8080 on loopback only. The API remains at private IP `172.31.0.254`, with public IP `18.142.159.33` for administration.

Region: Singapore (`ap-southeast-1`). Reuse the existing Ubuntu 26.04 x86_64 web instance (`18.141.214.247`) and launch one Amazon Linux 2023 x86_64 API instance. This guide does not provision AWS resources automatically.

Traffic flows from the browser to ASP.NET Core, then through YARP to the API's private IPv4 address on port 3000. The browser calls relative `/api` URLs; it does not need the API's public address or CORS configuration. Supabase provides authentication and database storage. The current API adds authenticated case CRUD, subjects, archives, and preferences to the original health/info endpoints. Existing case records stay in their original table.

## 1. Network and instances

In the AWS EC2 console, select Singapore. Record the existing web instance's VPC, subnet, and security groups. Check `uname -m` on the web instance; this package requires `x86_64`.

Create a dedicated security group `casetracker-web-sg` in that VPC. Attach it to the web instance while preserving its existing groups. Allow inbound TCP 8080 from your public IP `/32` for a restricted demonstration, or `0.0.0.0/0` if the website must be publicly accessible. Allow outbound TCP 3000 to the API group (default outbound-all also permits this).

Create `casetracker-api-sg` in the same VPC. Allow inbound TCP 3000 with **casetracker-web-sg as the source security group**. Do not expose API port 3000 to the internet. For browser terminal access, allow SSH port 22 from the Singapore EC2 Instance Connect service range. Preserve the web instance's existing SSH access. EC2 Instance Connect through the console originates from the service, not from your computer's IP.

Launch one API instance with Amazon Linux 2023, x86_64, a suitable small instance type such as t3.micro, an encrypted gp3 root disk, and `casetracker-api-sg`. Use the same VPC and a public subnet with an internet gateway route; enable public IPv4 so the instance can download packages and use browser-based EC2 Instance Connect. Default network ACLs allow the traffic. If using custom ACLs, allow port 3000 and return ephemeral traffic between the instances.

Record the API's **private IPv4**. It will be configured on the web instance. A public API address is only used for administration in this setup. EC2, EBS and public IPv4 may incur charges.

## 2. Build on Windows

Prerequisites: Node.js compatible with this project, .NET 10 SDK, and tar. From PowerShell in the project directory:

```powershell
npm.cmd ci
npm.cmd run build
dotnet publish CaseTracker.csproj -c Release -r linux-x64 --self-contained true -o .artifacts/web
tar -czf .artifacts/web.tar.gz -C .artifacts/web .
Copy-Item api/server.mjs .artifacts/server.mjs
Copy-Item deploy/aws/install-web.sh .artifacts/install-web.sh
Copy-Item deploy/aws/install-api.sh .artifacts/install-api.sh
```

Alternatively run `deploy/aws/package.ps1` where local PowerShell policy permits scripts. It performs these steps with error checking. The self-contained web artifact includes the .NET runtime, so no SDK is required on EC2. Rebuild and redeploy to apply runtime security updates.

## Direct transfer with SCP (no S3)

Use this route instead of sections 3–6 below. Build using section 2; keep the network rules in section 1. You need the matching SSH private key for each instance. Do not upload private keys to EC2 or share them in chat. Allow SSH port 22 from your computer's current public IP `/32` on both instances for these direct transfers.

From local Windows PowerShell, replace key paths and `API_PUBLIC_IP`:

```powershell
scp -i "C:\path\api-key.pem" .artifacts/server.mjs .artifacts/install-api.sh ec2-user@API_PUBLIC_IP:/home/ec2-user/
scp -i "C:\path\web-key.pem" .artifacts/web.tar.gz .artifacts/install-web.sh ubuntu@18.141.214.247:/home/ubuntu/
```

Before accepting a first-time SSH host key prompt, verify the host fingerprint against the instance's SSH host key fingerprint shown in EC2's system log. If you do not have a matching private key, do not create a new EC2 key pair expecting it to grant access to an existing instance automatically; use an explicitly configured EC2 Instance Connect key or another authorized transfer method.

On the API instance (browser terminal or SSH):

```bash
sudo bash /home/ec2-user/install-api.sh /home/ec2-user/server.mjs
```

On the existing web instance, confirm `curl http://API_PRIVATE_IP:3000/api/health` succeeds. Follow section 5 to identify and stop the old web service on port 8080. Then install:

```bash
sudo bash /home/ubuntu/install-web.sh /home/ubuntu/web.tar.gz API_PRIVATE_IP
```

Replace `API_PRIVATE_IP` with the second instance's actual private address. Proceed to section 7 to verify, then disable the original web service after successful verification so it cannot compete for port 8080 after a reboot.

## 3. Optional alternative: upload through S3

Create a private general purpose S3 bucket in Singapore. Keep **Block all public access** enabled. Upload the four files from `.artifacts/`: `web.tar.gz`, `server.mjs`, `install-web.sh`, `install-api.sh`.

For each object, select **Object actions → Share with a presigned URL** and generate a short-lived download link, such as one hour. These links grant temporary access; do not publish them. Keep the complete URL, including its query string. Download before expiration, or generate a new link.

## 4. Install the API first

In EC2, select the new API instance and choose **Connect → EC2 Instance Connect**. In its Amazon Linux terminal, replace each placeholder with the corresponding complete S3 URL, preserving single quotes:

```bash
curl --fail --location 'INSTALL_API_SH_PRESIGNED_URL' -o /tmp/install-api.sh
sudo bash /tmp/install-api.sh 'SERVER_MJS_PRESIGNED_URL'
curl --fail http://127.0.0.1:3000/api/health
```

Expect JSON with `status: ok` and `service: casetracker-api`. The installer uses Node.js 22 and runs the API as an unprivileged systemd service that starts after reboot.

## 5. Identify the current web process

Connect to the existing Ubuntu web instance using its EC2 browser terminal. Confirm the API is reachable using its **actual private IP**:

```bash
curl --fail --connect-timeout 5 http://API_PRIVATE_IP:3000/api/health
sudo ss -ltnp 'sport = :8080'
```

The screenshot showed a `dotnet` process on port 8080. Identify its **current PID** from `ss`, then inspect the associated service:

```bash
sudo systemctl status ACTUAL_PID
```

Record the original service name and its configuration so you can restore it. After the API check succeeds and the web artifact is uploaded, stop that specific old web service:

```bash
sudo systemctl stop ACTUAL_OLD_WEB_SERVICE
```

If it is a manually started process, stop it through its original launcher. Do not stop unrelated services or kill all dotnet processes. The installer refuses to overwrite a different running service on port 8080.

## 6. Install the new web host

On the Ubuntu instance, replace the URL placeholders and API address:

```bash
curl --fail --location 'INSTALL_WEB_SH_PRESIGNED_URL' -o /tmp/install-web.sh
sudo bash /tmp/install-web.sh 'WEB_TAR_GZ_PRESIGNED_URL' API_PRIVATE_IP
```

This installs the runtime's Ubuntu dependencies, extracts the self-contained app to a new `/opt/casetracker-web-*` release directory, and configures the `casetracker-web` systemd service on `0.0.0.0:8080`. It sets `ApiBaseUrl` in `/etc/casetracker/web.env`, starts the service, and checks both web and proxied API health. It does not install Nginx or change any existing Nginx service. If a previous Nginx install is present, it is not used by this port-8080 deployment.

Once verification passes, disable the previous web service so it cannot compete for port 8080 after a reboot:

```bash
sudo systemctl disable ACTUAL_OLD_WEB_SERVICE
```

## 7. Verify the two-instance deployment

Open:

- `http://18.141.214.247:8080/` — the website.
- `http://18.141.214.247:8080/health` — web service health.
- `http://18.141.214.247:8080/api/health` — API health forwarded through the web EC2.
- `http://18.141.214.247:8080/lab-index.html` — calls the API and displays the API EC2 instance ID.

Confirm the returned instance ID matches the second instance in the EC2 console. That proves the web host is contacting the separate API. Also verify a case can be read or saved through the existing Supabase flow using a test account when HTTPS is configured.

## Troubleshooting and recovery

On the API instance:

```bash
sudo systemctl status casetracker-api
sudo journalctl -u casetracker-api -n 50 --no-pager
```

On the web instance:

```bash
sudo systemctl status casetracker-web
sudo journalctl -u casetracker-web -n 50 --no-pager
curl --fail http://API_PRIVATE_IP:3000/api/health
curl --fail http://127.0.0.1:8080/api/health
```

HTTP 502 indicates forwarding failed: check the API service, private IP, security groups, and ACLs. HTTP 503 with an API-not-configured message means `ApiBaseUrl` is missing. To change the destination, update `/etc/casetracker/web.env` and restart `casetracker-web`.

If the browser cannot connect but local web health works, check inbound port 8080, Ubuntu's firewall if enabled, and the instance's current public IPv4. An automatically assigned public IP may change after stop/start; an Elastic IP can provide a stable address.

If the new service fails and you need to return to the original web host, stop and disable `casetracker-web`, then enable and start the original service you recorded. Keep release directories until the deployment is verified; do not delete old releases as part of troubleshooting.

This is an HTTP demonstration deployment. Configure a domain and HTTPS before real sign-ins. Kestrel can terminate TLS directly, or an AWS Application Load Balancer can terminate TLS while retaining exactly two EC2 instances; the latter is an additional AWS resource and cost.

## Local verification

```powershell
npm.cmd run build
dotnet build -c Release
node tests/proxy.mjs
```

The integration test starts separate web/API processes and checks forwarding, HTTP methods/status/headers, backend outage behavior, and static pages without an API destination.
