# Move application operations behind the EC2 API

Confirm current public addresses in EC2 before running commands: the web/API IPs below reflect the November 14, 2026 restart and are not reserved Elastic IPs. The private API destination is `172.31.0.254`.

This is a staged deployment. Local implementation does not mean the live deployment has been upgraded. Complete the database migration and API configuration first, then deploy the frontend. Keep Supabase Auth and the existing database; no account or case-record migration to another host is required.

## Architecture and security

Browser sign-in/sign-up/token refresh still use Supabase Auth. For business operations, the browser sends its access token to `/api/*` on the HTTPS web host. YARP forwards it over the existing private connection to the Node.js API. The API verifies the token using Supabase Auth's user endpoint before making user-scoped database requests.

The API uses a **publishable key**, not a service-role key. All database requests carry the user's verified token so row-level security applies. Select/update/delete requests also explicitly filter by the verified user ID. Inserts derive `user_id` on the server. User-supplied ownership, arbitrary database fields, and client-supplied links are rejected. Never put a secret/service-role key in the frontend or this API configuration.

Supabase's REST API remains accessible to authenticated clients under the same ownership policies. Moving application calls to EC2 is not the same as making the database's REST interface inaccessible. Enforcement of data ownership remains mandatory in both places.

## Endpoints

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Public process health and configuration flag; not a database readiness check |
| `/api/info` | GET | Existing infrastructure demonstration |
| `/api/cases?subject=...&offset=0` | GET | Own cases, pages of 200 with `nextOffset` |
| `/api/cases` | POST | Create own case; server generates the research link |
| `/api/cases/:id` | PATCH, DELETE | Update/delete an owned case; foreign IDs return 404 |
| `/api/workspace` | GET, POST | Read or initialize own subjects/preferences |
| `/api/subjects` | PUT | Save active/archive lists with a version check |
| `/api/preferences` | PUT | Save theme/color with a version check |

All business endpoints require `Authorization: Bearer USER_ACCESS_TOKEN`. Unknown fields are rejected. Requests have a 32 KiB JSON body limit. Cases validate G.R. number, field lengths, Solo/Group type, and allowed statuses. Each upstream request times out after five seconds; the browser has a 20-second timeout and refreshes an expired login token once before retrying. Raw database errors and credentials are not returned.

## 1. Apply the additive SQL migration

In the Supabase dashboard, choose the existing project (`lhtfrtozxpcbswugxzcn`), open **SQL Editor**, and start a new query. Paste `api/migrations/001_user_workspaces.sql` (also packaged as `.artifacts/001_user_workspaces.sql`) and run it.

The transaction creates a private `user_workspaces` table, enables RLS on both tables, adds owner-only policies and a case-list index, and revokes anonymous table access. It preserves existing case rows and existing policies. A restrictive owner policy prevents an existing broad permissive policy from exposing another user's records. A schema mismatch causes the transaction to fail rather than partially apply: share the error text without credentials and correct the schema assumption before continuing.

The final query must show `row_security_enabled = true` for both tables. The SQL is rerunnable with its own policy names; it does not drop tables or case records. Use the normal database backup process before production schema changes.

## 2. Upload backend files from local PowerShell

```powershell
scp -i "$env:USERPROFILE\Downloads\casetracker-api-key.pem" "$env:USERPROFILE\Desktop\CaseTracker\.artifacts\server.mjs" "$env:USERPROFILE\Desktop\CaseTracker\.artifacts\install-api.sh" "$env:USERPROFILE\Desktop\CaseTracker\.artifacts\api.env" ec2-user@18.142.159.33:/home/ec2-user/
```

If local files were rebuilt manually, copy the matching source files to `.artifacts/` first. `deploy/aws/package.ps1` performs this packaging too.

## 3. Configure and update the API

On the **Amazon Linux API instance**:

```bash
sudo install -d -m 755 /etc/casetracker
sudo install -o root -g root -m 600 /home/ec2-user/api.env /etc/casetracker/api.env
sudo cp /opt/casetracker-api/server.mjs /home/ec2-user/server-before-business-api.mjs
sudo cp /etc/systemd/system/casetracker-api.service /home/ec2-user/api-service-before-business-api.service
sudo bash /home/ec2-user/install-api.sh /home/ec2-user/server.mjs
curl --fail http://127.0.0.1:3000/api/health
```

Confirm `status` is `ok` and `caseManagementConfigured` is `true`. This flag validates configuration, not the SQL migration. Confirm a request without a login token is rejected:

```bash
curl -i http://127.0.0.1:3000/api/workspace
```

Expected: HTTP **401** and a sign-in message. Do not make port 3000 public. Leave the existing web-to-API security group rule unchanged.

Before deploying frontend changes, also check `https://18.141.214.247/api/health` from the browser. The old website continues to work during this backend-first stage because it still calls Supabase directly, and its diagnostics endpoints remain compatible.

## 4. Deploy the frontend last

From local PowerShell:

```powershell
scp -i "$env:USERPROFILE\Downloads\casetracker-api-key.pem" "$env:USERPROFILE\Desktop\CaseTracker\.artifacts\site-update.tar.gz" ubuntu@18.141.214.247:/home/ubuntu/
```

On the **Ubuntu web instance**:

```bash
web_dir=$(systemctl show casetracker-web --property=WorkingDirectory --value)
sudo tar -czf /home/ubuntu/site-before-business-api.tar.gz -C "$web_dir/dist" .
sudo tar -xzf /home/ubuntu/site-update.tar.gz -C "$web_dir/dist"
```

No web restart is needed. Existing HTTPS settings and the certificate-renewal hook remain in place. Refresh the browser with Ctrl+Shift+R.

## 5. Import and verify

Sign in using the same browser and account you used before. When no cloud workspace exists, the frontend imports the account's cached active/archive lists and current theme. The API also recovers subject names from existing case records. Existing case data stays in `case_digests`; it is not copied or deleted. Empty subjects that exist only in another browser's local storage cannot be recovered automatically; import from that browser first or recreate those empty subjects.

Initialization is idempotent: another browser cannot overwrite an existing cloud workspace with its old local state. Subsequent loads use the cloud workspace. Subject/preference writes use revision checks; a conflicting update asks the user to reload instead of overwriting a newer device's changes.

Verify using temporary test records:

1. Existing subjects and case records load.
2. Add a test case; edit it; change status; delete that test case only.
3. Add/archive/restore a temporary subject.
4. Change theme and reload; verify it persists.
5. In DevTools Network, verify these actions call `/api/cases`, `/api/subjects`, and `/api/preferences` at the web origin. There should be no browser requests to Supabase `/rest/v1/`.
6. Auth requests to Supabase remain expected. Do not print or share bearer tokens.
7. Use a second test account to verify it does not see the first account's subjects or case records. A first-account case ID used for PATCH/DELETE by the second account must return 404 and leave the record unchanged.
8. Verify HTTPS dashboard `/lab-index.html` still works.

## Recovery

If the frontend fails after cutover, restore its backup first. On the web instance:

```bash
web_dir=$(systemctl show casetracker-web --property=WorkingDirectory --value)
sudo tar -xzf /home/ubuntu/site-before-business-api.tar.gz -C "$web_dir/dist"
```

Reload the browser. The previous frontend remains compatible with owner-only RLS. The added workspace table/policies can remain; do not drop user data to undo a frontend deployment.

If necessary, restore the old API only **after** restoring the old frontend. On the API instance:

```bash
sudo cp /home/ec2-user/server-before-business-api.mjs /opt/casetracker-api/server.mjs
sudo cp /home/ec2-user/api-service-before-business-api.service /etc/systemd/system/casetracker-api.service
sudo systemctl daemon-reload
sudo systemctl restart casetracker-api
```

The backup commands above are for the first upgrade. Do not rerun them over the same backup files after the upgrade if you still need the original versions.

## Local validation and limits

`npm.cmd run test:api` exercises the real HTTP handler with a simulated Supabase transport: missing/invalid/forged tokens, two-user isolation, ownership assignment, CRUD, validation, body limits, pagination, first-import preservation, workspace conflicts, and dependency failures. `tests/workspace.py` drives a real browser through Vite's proxy and the Node API handler using fake auth/database data. It verifies CRUD/status, subjects/archive/restore, preferences across reloads, token refresh, account separation, and absence of direct browser database calls.

These tests do not execute SQL against the live project. The SQL and live account tests must pass during deployment. `tests/proxy.mjs` tests the ASP.NET proxy where local execution policy permits it; on this Windows environment Application Control previously blocked starting the .NET test process. The existing live proxy has already forwarded health/info successfully; verify authenticated requests during cutover too.

There is one EC2 instance per role, so this is not highly available. Tokens cross the private EC2 connection over HTTP; network ingress is restricted to the web security group. Internal TLS can be added for stricter requirements. Automatic renewal and public-IP HTTPS do not replace database authorization or backups.
