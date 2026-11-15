import http from 'node:http';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

async function metadata() {
  if (process.env.AWS_EC2_METADATA_DISABLED === 'true') return {};
  const base = 'http://169.254.169.254/latest/';
  try {
    const response = await fetch(base + 'api/token', {
      method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '300' },
      signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) return {};
    const token = await response.text();
    const entries = await Promise.all(Object.entries({
      instanceId: 'instance-id', availabilityZone: 'placement/availability-zone',
      privateIp: 'local-ipv4', instanceType: 'instance-type'
    }).map(async ([key, path]) => {
      const result = await fetch(base + 'meta-data/' + path, {
        headers: { 'X-aws-ec2-metadata-token': token }, signal: AbortSignal.timeout(2000)
      });
      return [key, result.ok ? await result.text() : 'unknown'];
    }));
    return Object.fromEntries(entries);
  } catch { return {}; }
}

const DEFAULT_SUBJECTS = ['Constitutional Law I', 'Criminal Law I', 'Persons and Family Relations', 'Statutory Construction'];
const THEMES = new Set(['blue', 'emerald', 'crimson', 'amethyst', 'slate', 'dark', 'custom']);
const STATUSES = new Set(['-', 'IN PROGRESS', 'DONE', 'STUCK']);
const TYPES = new Set(['Solo', 'Group']);
const CASE_FIELDS = 'id,user_id,subject,gr,caseName,topic,type,status,link,created_at';
const WORKSPACE_FIELDS = 'active_subjects,archived_subjects,theme,custom_color,revision';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected a JSON object.');
  if (Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'Request contains unsupported fields.');
}
function text(value, name, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) fail(400, name + ' is invalid.');
  return value.trim();
}
function lists(body) {
  const result = {};
  for (const key of ['activeSubjects', 'archivedSubjects']) {
    if (!Array.isArray(body[key]) || body[key].length > 200) fail(400, 'Subject lists must contain at most 200 names.');
    result[key] = body[key].map(value => text(value, 'Subject', 160));
  }
  const all = [...result.activeSubjects, ...result.archivedSubjects];
  if (all.length > 200 || new Set(all).size !== all.length) fail(400, 'Subjects must be unique across both lists (maximum 200).');
  return { active_subjects: result.activeSubjects, archived_subjects: result.archivedSubjects };
}
function preferences(body) {
  if (!THEMES.has(body.theme) || !/^#[0-9a-f]{6}$/i.test(body.customColor || '')) fail(400, 'Theme or custom color is invalid.');
  return { theme: body.theme, custom_color: body.customColor.toLowerCase() };
}
function workspace(row) {
  return { activeSubjects: row.active_subjects, archivedSubjects: row.archived_subjects, theme: row.theme, customColor: row.custom_color, version: row.revision };
}
function caseValues(body, creating) {
  fields(body, creating ? ['subject', 'gr', 'caseName', 'topic', 'type', 'status'] : ['gr', 'caseName', 'topic', 'type', 'status']);
  if (!Object.keys(body).length) fail(400, 'Supply at least one field to update.');
  const values = {};
  if (creating) values.subject = text(body.subject, 'Subject', 160);
  if (creating || 'gr' in body) values.gr = text(body.gr, 'G.R. number', 200);
  for (const [key, max] of [['caseName', 500], ['topic', 5000]]) {
    if (creating || key in body) values[key] = text(body[key], key, max, creating ? '-' : undefined);
  }
  if (creating || 'type' in body) {
    if (!TYPES.has(body.type)) fail(400, 'Digest type is invalid.');
    values.type = body.type;
  }
  if (creating || 'status' in body) {
    const status = creating && body.status === undefined ? '-' : body.status;
    if (!STATUSES.has(status)) fail(400, 'Case status is invalid.');
    values.status = status;
  }
  return values;
}
function caseLink(gr, caseName) {
  const query = [gr, caseName === '-' ? '' : caseName, '(site:lawphil.net OR site:elibrary.judiciary.gov.ph)'].filter(Boolean).join(' ');
  return 'https://www.google.com/search?q=' + encodeURIComponent(query);
}
async function jsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'Use Content-Type: application/json.');
  if (Number(req.headers['content-length']) > 32768) { req.resume(); fail(413, 'Request body is too large.'); }
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let ended = false;
    req.on('data', chunk => {
      if (ended) return;
      bytes += chunk.length;
      if (bytes > 32768) { ended = true; reject(new ApiError(413, 'Request body is too large.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!ended) { ended = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', () => reject(new ApiError(400, 'Could not read request body.')));
    req.on('aborted', () => reject(new ApiError(400, 'Request was interrupted.')));
  });
  try { return JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
}

export function createServer(info = {}, options = {}) {
  const config = options.config || { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  const fetchUpstream = options.fetchImpl || fetch;
  let base = null;
  if (config.url || config.key) {
    try {
      const parsed = new URL(config.url);
      if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password || !config.key) throw new Error();
      // This server intentionally uses a publishable/anon key, never a service-role key.
      if (config.key.startsWith('sb_secret_')) throw new Error();
      if (!config.key.startsWith('sb_publishable_')) {
        const payload = JSON.parse(Buffer.from(config.key.split('.')[1], 'base64url').toString());
        if (payload.role !== 'anon') throw new Error();
      }
      base = parsed.origin;
    } catch { throw new Error('Configure SUPABASE_URL as an HTTPS origin and SUPABASE_PUBLISHABLE_KEY as a publishable or anon key.'); }
  }
  async function upstream(path, token, init = {}) {
    let response;
    try {
      response = await fetchUpstream(base + path, {
        ...init, headers: { apikey: config.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(5000), redirect: 'error'
      });
    } catch { fail(503, 'The account or database service is temporarily unavailable.'); }
    if (!response.ok) {
      if (response.status === 401) fail(401, 'Your session has expired. Please sign in again.');
      if (response.status === 403) fail(403, 'You do not have access to this resource.');
      if (response.status === 409) fail(409, 'This update conflicts with an existing record.');
      if (response.status === 429) fail(503, 'The database is busy. Please try again shortly.');
      // Do not return raw database errors or connection information to the client.
      fail(503, 'The database request failed. Please try again or contact the administrator.');
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { fail(502, 'The upstream service returned an invalid response.'); }
  }
  async function authenticate(req) {
    if (!base) fail(503, 'The application API is not configured.');
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match || match[1].length > 8192) fail(401, 'Please sign in to continue.');
    // Verify with Supabase Auth, not by decoding untrusted JWT claims.
    const user = await upstream('/auth/v1/user', match[1]);
    if (!user || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id || '')) fail(401, 'Invalid user session.');
    return { id: user.id, token: match[1] };
  }
  async function rest(table, user, query = {}, init = {}) {
    // All reads, updates and deletes carry an explicit verified-owner filter as well as RLS.
    const params = new URLSearchParams(query);
    if (init.method !== 'POST') params.set('user_id', 'eq.' + user.id);
    const result = await upstream('/rest/v1/' + table + '?' + params, user.token, init);
    if (!Array.isArray(result)) fail(502, 'The database returned an invalid response.');
    return result;
  }
  function method(req, res, allowed) {
    if (!allowed.includes(req.method)) { res.setHeader('Allow', allowed.join(', ')); fail(405, 'Method not allowed.'); }
  }
  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path === '/api/health' || path === '/api/info') {
        method(req, res, ['GET']);
        return send(res, 200, path === '/api/health'
          ? { status: 'ok', service: 'casetracker-api', caseManagementConfigured: Boolean(base), ...info }
          : { ...info, cpuCount: os.cpus().length, uptimeSeconds: Math.round(process.uptime()), servedAt: new Date().toISOString() });
      }
      const caseMatch = /^\/api\/cases\/([A-Za-z0-9_-]{1,128})$/.exec(path);
      if (!['/api/cases', '/api/workspace', '/api/subjects', '/api/preferences'].includes(path) && !caseMatch) fail(404, 'Not found.');
      const user = await authenticate(req);
      if (path === '/api/workspace') {
        method(req, res, ['GET', 'POST']);
        if (req.method === 'GET') {
          const rows = await rest('user_workspaces', user, { select: WORKSPACE_FIELDS, limit: '1' });
          return send(res, 200, { data: rows[0] ? workspace(rows[0]) : null });
        }
        const body = await jsonBody(req);
        fields(body, ['activeSubjects', 'archivedSubjects', 'theme', 'customColor']);
        const existing = await rest('user_workspaces', user, { select: WORKSPACE_FIELDS, limit: '1' });
        if (existing[0]) return send(res, 200, { data: workspace(existing[0]) });
        const initial = {
          user_id: user.id,
          ...lists({ activeSubjects: body.activeSubjects ?? DEFAULT_SUBJECTS, archivedSubjects: body.archivedSubjects ?? [] }),
          ...preferences({ theme: body.theme ?? 'blue', customColor: body.customColor ?? '#0f3a68' })
        };
        // Recover subject names from existing cases, including when this browser has no old local storage.
        const known = new Set([...initial.active_subjects, ...initial.archived_subjects]);
        for (let offset = 0; ; offset += 200) {
          const cases = await rest('case_digests', user, { select: 'subject', order: 'id.asc', offset: String(offset), limit: '200' });
          for (const item of cases) {
            if (typeof item.subject === 'string' && item.subject.trim() && !known.has(item.subject)) {
              text(item.subject, 'Existing subject', 160);
              initial.active_subjects.push(item.subject); known.add(item.subject);
            }
          }
          if (cases.length < 200) break;
        }
        if (known.size > 200) fail(400, 'Your existing records contain more than 200 subjects. Contact the administrator before importing.');
        // Ignore a duplicate user_id: a second browser must never overwrite an existing workspace on import.
        await rest('user_workspaces', user, { on_conflict: 'user_id', select: WORKSPACE_FIELDS }, {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(initial)
        });
        const rows = await rest('user_workspaces', user, { select: WORKSPACE_FIELDS, limit: '1' });
        if (!rows[0]) fail(503, 'Could not initialize your workspace.');
        return send(res, 200, { data: workspace(rows[0]) });
      }
      if (path === '/api/subjects' || path === '/api/preferences') {
        method(req, res, ['PUT']);
        const body = await jsonBody(req);
        const subjects = path === '/api/subjects';
        fields(body, subjects ? ['activeSubjects', 'archivedSubjects', 'version'] : ['theme', 'customColor', 'version']);
        if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version >= Number.MAX_SAFE_INTEGER) fail(400, 'A valid workspace version is required.');
        const update = { ...(subjects ? lists(body) : preferences(body)), revision: body.version + 1 };
        const rows = await rest('user_workspaces', user, { revision: 'eq.' + body.version, select: WORKSPACE_FIELDS }, {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update)
        });
        if (!rows[0]) fail(409, 'Your workspace changed in another tab or device. Reload it before saving again.');
        return send(res, 200, { data: workspace(rows[0]) });
      }
      if (path === '/api/cases') {
        method(req, res, ['GET', 'POST']);
        if (req.method === 'GET') {
          const subject = text(url.searchParams.get('subject'), 'Subject', 160);
          const rawOffset = url.searchParams.get('offset') ?? '0';
          if (!/^\d{1,8}$/.test(rawOffset)) fail(400, 'Invalid page offset.');
          const offset = Number(rawOffset);
          const rows = await rest('case_digests', user, { select: CASE_FIELDS, subject: 'eq.' + subject, order: 'created_at.desc,id.desc', limit: '201', offset: String(offset) });
          return send(res, 200, { data: rows.slice(0, 200), nextOffset: rows.length > 200 ? offset + 200 : null });
        }
        const values = caseValues(await jsonBody(req), true);
        const rows = await rest('case_digests', user, { select: CASE_FIELDS }, {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ ...values, user_id: user.id, link: caseLink(values.gr, values.caseName) })
        });
        if (!rows[0]) fail(503, 'The case could not be saved.');
        return send(res, 201, { data: rows[0] });
      }
      method(req, res, ['PATCH', 'DELETE']);
      const query = { id: 'eq.' + caseMatch[1], select: CASE_FIELDS };
      if (req.method === 'DELETE') {
        const rows = await rest('case_digests', user, query, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
        if (!rows[0]) fail(404, 'Case not found.');
        return send(res, 200, { data: { id: rows[0].id } });
      }
      const values = caseValues(await jsonBody(req), false);
      if ('gr' in values || 'caseName' in values) {
        const current = await rest('case_digests', user, { ...query, limit: '1' });
        if (!current[0]) fail(404, 'Case not found.');
        values.link = caseLink(values.gr ?? current[0].gr, values.caseName ?? current[0].caseName);
      }
      const rows = await rest('case_digests', user, query, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(values) });
      if (!rows[0]) fail(404, 'Case not found.');
      return send(res, 200, { data: rows[0] });
    } catch (error) {
      if (!res.destroyed && !res.headersSent) send(res, error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'An unexpected server error occurred.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(await metadata());
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
